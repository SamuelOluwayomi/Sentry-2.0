// Sentry 2.0 -- Shared Type Definitions
// The single source of truth for all cross-layer data shapes.

export type EventSource = "yellowstone" | "blur" | "rpc" | "synthetic";

export type EventType =
  | "swap"
  | "liquidity_change"
  | "token_launch"
  | "pool_creation"
  | "large_transfer"
  | "program_activity"
  | "account_change"
  | "leader_change"
  | "congestion_spike"
  | "fault_injection"
  | "unknown";

export type SentryEvent = {
  id: string;
  source: EventSource;
  type: EventType;
  slot: number;
  receivedAt: string;
  raw?: unknown;
  decoded: {
    pool?: string;
    tokenA?: string;
    tokenB?: string;
    liquidityDeltaUsd?: number;
    volumeDeltaUsd?: number;
    priceUsd?: number;
    signature?: string;
    program?: string;
    account?: string;
    transferAmountSol?: number;
    description?: string;
    faultType?: FaultType;
  };
  opportunityScore?: number;
  duplicate?: boolean;
};

export type NetworkRegime = "cold" | "warm" | "hot" | "critical";

export type NetworkSnapshot = {
  capturedAt: string;
  slot: number;
  blockHeight?: number;
  blockhash?: string;
  currentLeader?: string;
  nextJitoLeader?: string;
  slotsToLeader?: number;
  leaderRegion?: string;
  tipP25: number;
  tipP50: number;
  tipP75: number;
  tipP95: number;
  tipEma?: number;
  tipTrend?: "rising" | "falling" | "stable";
  regime: NetworkRegime;
  confirmationLatencyMs?: number;
  recentFailureRate?: number;
  streamLagMs?: number;
  congestionScore?: number;
  beamHealthy: boolean;
  jitoHealthy: boolean;
  yellowstoneHealthy: boolean;
  blurHealthy: boolean;
  rpcHealthy: boolean;
};

export type PolicyDecision = "allowed" | "blocked" | "shadow";

export type BlockReason =
  | "opportunity_score_too_low"
  | "network_congestion_too_high"
  | "tip_exceeds_maximum"
  | "stream_unhealthy"
  | "circuit_breaker_tripped"
  | "budget_exhausted"
  | "cooldown_active"
  | "simulation_failed"
  | "policy_not_matched"
  | "wallet_balance_insufficient"
  | "execution_mode_shadow"
  | "execution_mode_observe";

export type PolicyEvaluation = {
  decision: PolicyDecision;
  blockReason?: BlockReason;
  passedChecks: string[];
  failedChecks: string[];
  recommendedTip: number;
  recommendedRoute: "beam" | "jito" | "rpc";
  opportunityScore: number;
  maxTip: number;
  budgetRemainingSol?: number;
  circuitBreakerState?: CircuitBreakerState;
};

export type PolicyRule = {
  id: string;
  name: string;
  enabled: boolean;
  eventTypes: EventType[];
  conditions: {
    minLiquidityDeltaUsd?: number;
    maxCongestionScore?: number;
    minOpportunityScore?: number;
    maxTipLamports?: number;
    requireLeaderWindow?: boolean;
    maxFailureRate?: number;
  };
  limits: {
    maxTipLamports: number;
    maxRetriesPerEvent: number;
    maxExecutionsPerMinute: number;
    maxDailySpendSol: number;
  };
  route: "beam" | "jito" | "auto";
};

export type TipRecommendation = {
  lamports: number;
  tier: "p25" | "p50" | "p75" | "p95";
  regime: NetworkRegime;
  leaderMultiplier: number;
  urgencyMultiplier: number;
  emaBaseline: number;
  reasoning: string;
};

export type RouteScore = {
  route: "beam" | "jito" | "rpc";
  score: number;
  submissions: number;
  landingRate: number;
  medianLatencyMs: number;
  lastUsed?: string;
  healthy: boolean;
};

export type ActionResult = {
  route: "beam" | "jito" | "rpc";
  signature: string;
  bundleId: string;
  tipLamports: number;
  tipAccount: string;
  submittedAt: string;
  simulationPassed: boolean;
  simulationError?: string;
};

export type LifecycleStage =
  | "submitted"
  | "processed"
  | "confirmed"
  | "finalized"
  | "failed";

export type LifecycleEvent = {
  stage: LifecycleStage;
  timestamp: string;
  slot?: number;
  source: "yellowstone" | "rpc" | "timeout";
};

export type FailureClass =
  | "expired_blockhash"
  | "fee_too_low"
  | "rate_limited"
  | "simulation_failed"
  | "insufficient_funds"
  | "compute_exceeded"
  | "bundle_failed"
  | "stream_disconnect"
  | "rpc_unavailable"
  | "policy_rejected"
  | "timeout"
  | "on_chain_error"
  | "unknown";

export type RecoveryAction =
  | "refresh_blockhash_and_retry"
  | "increase_tip_and_retry"
  | "switch_route_and_retry"
  | "backoff_and_retry"
  | "abort_do_not_retry"
  | "reconnect_stream";

export type FailureAnalysis = {
  class: FailureClass;
  recovery: RecoveryAction;
  retryable: boolean;
  description: string;
  retriesAttempted: number;
};

export type FaultType =
  | "expired_blockhash"
  | "low_tip"
  | "zero_tip"
  | "rpc_failure"
  | "stream_disconnect"
  | "rate_limit"
  | "simulation_failure";

export type CircuitBreakerState = "closed" | "open" | "half_open";

export type CircuitBreaker = {
  state: CircuitBreakerState;
  reason?: string;
  trippedAt?: string;
  recoveryAt?: string;
  failureCount: number;
  successCount: number;
};

export type ExecutionMode = "observe" | "shadow" | "live";

export type ExecutionReceipt = {
  executionId: string;
  mode: ExecutionMode;
  startedAt: string;
  completedAt?: string;
  trigger: SentryEvent;
  networkSnapshot: NetworkSnapshot;
  policyEvaluation: PolicyEvaluation;
  tipRecommendation: TipRecommendation;
  aiRecommendation?: AiRecommendation;
  actionResult?: ActionResult;
  lifecycle: LifecycleEvent[];
  currentStage: LifecycleStage | "pending" | "blocked";
  failureAnalysis?: FailureAnalysis;
  retries: ActionResult[];
  finalStatus: "finalized" | "confirmed" | "failed" | "blocked" | "shadow" | "pending";
  durationMs?: number;
  costSol?: number;
  totalTipLamports?: number;
  signature?: string;
  explorerUrl?: string;
};

export type AiRecommendation = {
  action: "execute" | "hold" | "increase_tip" | "switch_route";
  confidence: number;
  tipMultiplier?: number;
  reasoning: string;
  postmortem?: string;
  model: string;
  generatedAt: string;
};

export type ComponentHealth = {
  name: string;
  status: "healthy" | "degraded" | "down" | "standby";
  latencyMs?: number;
  lastCheckedAt: string;
  detail?: string;
};

export type SystemHealth = {
  overall: "healthy" | "degraded" | "down";
  components: ComponentHealth[];
  eventLagMs?: number;
  streamBacklog?: number;
  currentSlot?: number;
  executionMode: ExecutionMode;
  circuitBreaker: CircuitBreaker;
  checkedAt: string;
};

export type EventBusMessage =
  | { type: "event"; payload: SentryEvent }
  | { type: "receipt"; payload: ExecutionReceipt }
  | { type: "health"; payload: SystemHealth }
  | { type: "network"; payload: NetworkSnapshot }
  | { type: "policy"; payload: PolicyEvaluation }
  | { type: "error"; payload: { message: string; context?: unknown } };
