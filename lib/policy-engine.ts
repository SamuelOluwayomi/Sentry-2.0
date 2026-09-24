// Sentry 2.0 -- Policy Engine
// Deterministic execution policy. The AI cannot override these decisions.
// This is the enforcement layer: allowed / blocked / shadow.

import type {
  SentryEvent,
  NetworkSnapshot,
  PolicyEvaluation,
  PolicyRule,
  BlockReason,
  CircuitBreaker,
  CircuitBreakerState,
  ExecutionMode,
} from "./types";
import { scoreOpportunity } from "./event-engine";

// -- Default Policy Rules (overridable via API) --
const DEFAULT_RULES: PolicyRule[] = [
  {
    id: "blur-liquidity",
    name: "Blur Liquidity Change",
    enabled: true,
    eventTypes: ["liquidity_change"],
    conditions: {
      minLiquidityDeltaUsd: 5_000,
      maxCongestionScore: 80,
      minOpportunityScore: 50,
    },
    limits: {
      maxTipLamports: 100_000,
      maxRetriesPerEvent: 2,
      maxExecutionsPerMinute: 10,
      maxDailySpendSol: 0.5,
    },
    route: "auto",
  },
  {
    id: "blur-swap",
    name: "Blur Large Swap",
    enabled: true,
    eventTypes: ["swap"],
    conditions: {
      minLiquidityDeltaUsd: 10_000,
      maxCongestionScore: 75,
      minOpportunityScore: 55,
    },
    limits: {
      maxTipLamports: 75_000,
      maxRetriesPerEvent: 2,
      maxExecutionsPerMinute: 5,
      maxDailySpendSol: 0.3,
    },
    route: "beam",
  },
  {
    id: "large-transfer",
    name: "Large SOL Transfer",
    enabled: true,
    eventTypes: ["large_transfer"],
    conditions: {
      minLiquidityDeltaUsd: 0,
      maxCongestionScore: 85,
      minOpportunityScore: 60,
    },
    limits: {
      maxTipLamports: 50_000,
      maxRetriesPerEvent: 1,
      maxExecutionsPerMinute: 3,
      maxDailySpendSol: 0.2,
    },
    route: "beam",
  },
];

// -- In-memory rule store (replaceable at runtime) --
let activeRules: PolicyRule[] = [...DEFAULT_RULES];

export function getRules(): PolicyRule[] {
  return activeRules;
}

export function updateRule(rule: PolicyRule) {
  const idx = activeRules.findIndex(r => r.id === rule.id);
  if (idx >= 0) {
    activeRules[idx] = rule;
  } else {
    activeRules.push(rule);
  }
}

// -- Circuit Breaker --
let circuitBreaker: CircuitBreaker = {
  state: "closed",
  failureCount: 0,
  successCount: 0,
};

const CB_OPEN_THRESHOLD = 5;    // consecutive failures to open
const CB_RECOVERY_MS = 30_000;  // 30s before half-open
const CB_SUCCESS_TO_CLOSE = 2;  // successes in half-open to close

export function getCircuitBreaker(): CircuitBreaker {
  return { ...circuitBreaker };
}

export function recordExecutionOutcome(success: boolean) {
  if (success) {
    circuitBreaker.successCount++;
    if (circuitBreaker.state === "half_open" &&
        circuitBreaker.successCount >= CB_SUCCESS_TO_CLOSE) {
      circuitBreaker.state = "closed";
      circuitBreaker.failureCount = 0;
      circuitBreaker.reason = undefined;
      circuitBreaker.trippedAt = undefined;
    }
  } else {
    circuitBreaker.failureCount++;
    circuitBreaker.successCount = 0;
    if (circuitBreaker.state === "closed" &&
        circuitBreaker.failureCount >= CB_OPEN_THRESHOLD) {
      circuitBreaker.state = "open";
      circuitBreaker.reason = `${CB_OPEN_THRESHOLD} consecutive failures`;
      circuitBreaker.trippedAt = new Date().toISOString();
      circuitBreaker.recoveryAt = new Date(Date.now() + CB_RECOVERY_MS).toISOString();
    }
  }
}

function checkCircuitBreaker(): CircuitBreakerState {
  if (circuitBreaker.state === "open" && circuitBreaker.recoveryAt) {
    if (Date.now() > new Date(circuitBreaker.recoveryAt).getTime()) {
      circuitBreaker.state = "half_open";
    }
  }
  return circuitBreaker.state;
}

// -- Execution Budget Tracking --
interface Budget {
  dailySpendSol: number;
  executionsThisMinute: number;
  minuteWindowStart: number;
  lastResetDay: string;
}

const budgets = new Map<string, Budget>();

function getBudget(ruleId: string): Budget {
  if (!budgets.has(ruleId)) {
    budgets.set(ruleId, {
      dailySpendSol: 0,
      executionsThisMinute: 0,
      minuteWindowStart: Date.now(),
      lastResetDay: new Date().toDateString(),
    });
  }
  const b = budgets.get(ruleId)!;

  // Reset daily budget at midnight
  const today = new Date().toDateString();
  if (b.lastResetDay !== today) {
    b.dailySpendSol = 0;
    b.lastResetDay = today;
  }

  // Reset per-minute counter
  if (Date.now() - b.minuteWindowStart > 60_000) {
    b.executionsThisMinute = 0;
    b.minuteWindowStart = Date.now();
  }

  return b;
}

export function recordExecution(ruleId: string, costSol: number) {
  const b = getBudget(ruleId);
  b.dailySpendSol += costSol;
  b.executionsThisMinute++;
}

// -- Tip Oracle --
export function recommendTip(
  network: NetworkSnapshot,
  rule: PolicyRule,
  opportunityScore: number,
): number {
  // Base from regime
  const base = network.tipP75;

  // Leader proximity multiplier
  const slotsToLeader = network.slotsToLeader ?? 10;
  const leaderMult = slotsToLeader <= 2 ? 1.3 : slotsToLeader <= 5 ? 1.15 : 1.0;

  // Urgency from opportunity score
  const urgencyMult = opportunityScore > 85 ? 1.2 : opportunityScore > 70 ? 1.1 : 1.0;

  // Regime adjustment
  const regimeMult =
    network.regime === "critical" ? 1.5 :
    network.regime === "hot" ? 1.2 :
    network.regime === "warm" ? 1.05 : 0.9;

  const recommended = Math.round(base * leaderMult * urgencyMult * regimeMult);

  // Hard cap from policy
  return Math.min(recommended, rule.limits.maxTipLamports);
}

// -- Core Policy Evaluator --
export function evaluatePolicy(
  event: SentryEvent,
  network: NetworkSnapshot,
  mode: ExecutionMode,
  walletBalanceSol?: number,
): PolicyEvaluation {
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];

  // Observe mode: never execute
  if (mode === "observe") {
    return {
      decision: "blocked",
      blockReason: "execution_mode_observe",
      passedChecks: [],
      failedChecks: ["Execution mode is OBSERVE"],
      recommendedTip: network.tipP75,
      recommendedRoute: "beam",
      opportunityScore: 0,
      maxTip: 0,
      circuitBreakerState: checkCircuitBreaker(),
    };
  }

  // Circuit breaker
  const cbState = checkCircuitBreaker();
  if (cbState === "open") {
    return {
      decision: "blocked",
      blockReason: "circuit_breaker_tripped",
      passedChecks,
      failedChecks: [`Circuit breaker OPEN: ${circuitBreaker.reason ?? "too many failures"}`],
      recommendedTip: network.tipP75,
      recommendedRoute: "beam",
      opportunityScore: 0,
      maxTip: 0,
      circuitBreakerState: cbState,
    };
  }

  // Find matching rule
  const matchingRule = activeRules.find(
    r => r.enabled && r.eventTypes.includes(event.type)
  );

  if (!matchingRule) {
    failedChecks.push(`No policy rule matches event type: ${event.type}`);
    return {
      decision: "blocked",
      blockReason: "policy_not_matched",
      passedChecks,
      failedChecks,
      recommendedTip: network.tipP75,
      recommendedRoute: "beam",
      opportunityScore: 0,
      maxTip: 0,
      circuitBreakerState: cbState,
    };
  }

  passedChecks.push(`Policy matched: ${matchingRule.name}`);

  // Score opportunity
  const opportunityScore = scoreOpportunity(event, network);
  event.opportunityScore = opportunityScore;

  // Check: opportunity score
  const minScore = matchingRule.conditions.minOpportunityScore ?? 50;
  if (opportunityScore < minScore) {
    failedChecks.push(`Opportunity score ${opportunityScore} below threshold ${minScore}`);
    return {
      decision: "blocked",
      blockReason: "opportunity_score_too_low",
      passedChecks,
      failedChecks,
      recommendedTip: network.tipP75,
      recommendedRoute: "beam",
      opportunityScore,
      maxTip: matchingRule.limits.maxTipLamports,
      circuitBreakerState: cbState,
    };
  }
  passedChecks.push(`Opportunity score: ${opportunityScore}`);

  // Check: congestion
  const maxCongestion = matchingRule.conditions.maxCongestionScore ?? 80;
  const congestion = network.congestionScore ?? 0;
  if (congestion > maxCongestion) {
    failedChecks.push(`Network congestion ${congestion} exceeds max ${maxCongestion}`);
    return {
      decision: "blocked",
      blockReason: "network_congestion_too_high",
      passedChecks,
      failedChecks,
      recommendedTip: network.tipP75,
      recommendedRoute: "beam",
      opportunityScore,
      maxTip: matchingRule.limits.maxTipLamports,
      circuitBreakerState: cbState,
    };
  }
  passedChecks.push(`Congestion: ${congestion}/100`);

  // Check: budget (per-minute rate)
  const budget = getBudget(matchingRule.id);
  if (budget.executionsThisMinute >= matchingRule.limits.maxExecutionsPerMinute) {
    failedChecks.push(`Rate limit: ${budget.executionsThisMinute}/${matchingRule.limits.maxExecutionsPerMinute} per minute`);
    return {
      decision: "blocked",
      blockReason: "budget_exhausted",
      passedChecks,
      failedChecks,
      recommendedTip: network.tipP75,
      recommendedRoute: "beam",
      opportunityScore,
      maxTip: matchingRule.limits.maxTipLamports,
      budgetRemainingSol: matchingRule.limits.maxDailySpendSol - budget.dailySpendSol,
      circuitBreakerState: cbState,
    };
  }
  passedChecks.push(`Rate: ${budget.executionsThisMinute}/${matchingRule.limits.maxExecutionsPerMinute} per min`);

  // Check: daily spend
  if (budget.dailySpendSol >= matchingRule.limits.maxDailySpendSol) {
    failedChecks.push(`Daily spend cap reached: ${budget.dailySpendSol.toFixed(4)}/${matchingRule.limits.maxDailySpendSol} SOL`);
    return {
      decision: "blocked",
      blockReason: "budget_exhausted",
      passedChecks,
      failedChecks,
      recommendedTip: network.tipP75,
      recommendedRoute: "beam",
      opportunityScore,
      maxTip: matchingRule.limits.maxTipLamports,
      budgetRemainingSol: 0,
      circuitBreakerState: cbState,
    };
  }
  passedChecks.push(`Daily spend: ${budget.dailySpendSol.toFixed(4)}/${matchingRule.limits.maxDailySpendSol} SOL`);

  // Check: wallet balance
  if (walletBalanceSol !== undefined && walletBalanceSol < 0.01) {
    failedChecks.push(`Wallet balance too low: ${walletBalanceSol.toFixed(4)} SOL`);
    return {
      decision: "blocked",
      blockReason: "wallet_balance_insufficient",
      passedChecks,
      failedChecks,
      recommendedTip: network.tipP75,
      recommendedRoute: matchingRule.route === "auto" ? "beam" : matchingRule.route,
      opportunityScore,
      maxTip: matchingRule.limits.maxTipLamports,
      circuitBreakerState: cbState,
    };
  }
  if (walletBalanceSol !== undefined) {
    passedChecks.push(`Wallet balance: ${walletBalanceSol.toFixed(4)} SOL`);
  }

  // Compute tip
  const recommendedTip = recommendTip(network, matchingRule, opportunityScore);
  passedChecks.push(`Tip: ${recommendedTip.toLocaleString()} lamports`);

  // Select route
  const recommendedRoute: "beam" | "jito" | "rpc" =
    matchingRule.route === "auto"
      ? (network.beamHealthy ? "beam" : "jito")
      : matchingRule.route;
  passedChecks.push(`Route: ${recommendedRoute.toUpperCase()}`);

  // Shadow mode: evaluate but don't execute
  if (mode === "shadow") {
    return {
      decision: "shadow",
      passedChecks,
      failedChecks,
      recommendedTip,
      recommendedRoute,
      opportunityScore,
      maxTip: matchingRule.limits.maxTipLamports,
      budgetRemainingSol: matchingRule.limits.maxDailySpendSol - budget.dailySpendSol,
      circuitBreakerState: cbState,
    };
  }

  // All checks passed -- ALLOWED
  return {
    decision: "allowed",
    passedChecks,
    failedChecks,
    recommendedTip,
    recommendedRoute,
    opportunityScore,
    maxTip: matchingRule.limits.maxTipLamports,
    budgetRemainingSol: matchingRule.limits.maxDailySpendSol - budget.dailySpendSol,
    circuitBreakerState: cbState,
  };
}

// -- Failure Taxonomy + Recovery --
export function classifyFailure(error: string, retriesAttempted: number): import("./types").FailureAnalysis {
  const msg = error.toLowerCase();

  if (msg.includes("blockhash") || msg.includes("expired")) {
    return {
      class: "expired_blockhash",
      recovery: "refresh_blockhash_and_retry",
      retryable: true,
      description: "Transaction blockhash expired before confirmation",
      retriesAttempted,
    };
  }
  if (msg.includes("tip") || msg.includes("fee") || msg.includes("below minimum")) {
    return {
      class: "fee_too_low",
      recovery: "increase_tip_and_retry",
      retryable: true,
      description: "Tip was below the Beam/Jito minimum floor",
      retriesAttempted,
    };
  }
  if (msg.includes("rate") || msg.includes("429") || msg.includes("too many")) {
    return {
      class: "rate_limited",
      recovery: "backoff_and_retry",
      retryable: true,
      description: "Provider returned rate limit response",
      retriesAttempted,
    };
  }
  if (msg.includes("simul") || msg.includes("simulation")) {
    return {
      class: "simulation_failed",
      recovery: "abort_do_not_retry",
      retryable: false,
      description: "Transaction failed simulation -- instruction error",
      retriesAttempted,
    };
  }
  if (msg.includes("insufficient") || msg.includes("balance") || msg.includes("funds")) {
    return {
      class: "insufficient_funds",
      recovery: "abort_do_not_retry",
      retryable: false,
      description: "Insufficient SOL balance for tip + fees",
      retriesAttempted,
    };
  }
  if (msg.includes("compute") || msg.includes("budget")) {
    return {
      class: "compute_exceeded",
      recovery: "abort_do_not_retry",
      retryable: false,
      description: "Transaction exceeded compute budget",
      retriesAttempted,
    };
  }
  if (msg.includes("bundle")) {
    return {
      class: "bundle_failed",
      recovery: "switch_route_and_retry",
      retryable: true,
      description: "Bundle was rejected by the block engine",
      retriesAttempted,
    };
  }
  if (msg.includes("stream") || msg.includes("disconnect") || msg.includes("connection")) {
    return {
      class: "stream_disconnect",
      recovery: "reconnect_stream",
      retryable: true,
      description: "Yellowstone stream connection lost",
      retriesAttempted,
    };
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return {
      class: "timeout",
      recovery: "refresh_blockhash_and_retry",
      retryable: true,
      description: "Transaction confirmation timed out",
      retriesAttempted,
    };
  }

  return {
    class: "unknown",
    recovery: "backoff_and_retry",
    retryable: retriesAttempted < 2,
    description: `Unclassified error: ${error.slice(0, 120)}`,
    retriesAttempted,
  };
}
