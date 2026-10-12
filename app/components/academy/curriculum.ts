// Sentry Academy -- curriculum content.
// Each lesson follows the same arc: learn the concept, see the on-chain flow,
// check understanding, then run a live lab on devnet or testnet.

export type AcademyView = "home" | "console" | "autonomous" | "intelligence";
export type LabNetwork = "mainnet" | "devnet" | "testnet";

export type LabId =
  | "pulse"
  | "airdrop"
  | "lifecycle"
  | "fees"
  | "fault"
  | "consistency"
  | "orca-quote"
  | "multirail";

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

export interface LabVariant {
  id: string;
  label: string;
  params: Record<string, unknown>;
  hint: string;
}

export interface Lesson {
  id: string;
  view: AcademyView;
  number: string;
  kicker: string;
  title: string;
  summary: string;
  concept: string[];
  flow: { label: string; detail: string }[];
  glossary: GlossaryTerm[];
  quote: { text: string; author: string };
  quiz: QuizQuestion[];
  lab: {
    id: LabId;
    title: string;
    description: string;
    actionLabel: string;
    networks: LabNetwork[];
    spendsSol: boolean;
    stages: string[];
    variants?: LabVariant[];
  };
}

export interface Track {
  view: AcademyView;
  label: string;
  title: string;
  blurb: string;
}

export const TRACKS: Track[] = [
  {
    view: "home",
    label: "Track 01",
    title: "Foundations",
    blurb: "How the Solana clock ticks, what a blockhash is, and how accounts come to exist.",
  },
  {
    view: "console",
    label: "Track 02",
    title: "Transaction Craft",
    blurb: "Build, simulate, send and confirm a real transaction, then price it correctly.",
  },
  {
    view: "autonomous",
    label: "Track 03",
    title: "Resilience",
    blurb: "Break transactions on purpose, classify the failure, and recover automatically.",
  },
  {
    view: "intelligence",
    label: "Track 04",
    title: "Execution Intelligence",
    blurb: "Quote concentrated liquidity and broadcast over multiple rails like a production engine.",
  },
];

export const LESSONS: Lesson[] = [
  // ---------------------------------------------------------------- FOUNDATIONS
  {
    id: "slots-blockhashes",
    view: "home",
    number: "01",
    kicker: "Foundations",
    title: "Slots, Leaders and Blockhashes",
    summary:
      "Solana advances in slots of roughly 400 ms. Each slot has one scheduled leader, and every transaction must reference a recent blockhash that expires.",
    concept: [
      "A slot is the window in which one validator, the leader, may produce a block. Leaders are scheduled in advance for a whole epoch, which is why transactions can be forwarded straight to upcoming leaders instead of a public mempool.",
      "Every transaction embeds a recent blockhash. It acts as a timestamp and replay guard: once roughly 150 blocks have passed, the blockhash expires and validators reject the transaction. This is the single most common reason transactions silently fail.",
      "The same chain can be read at three commitment levels. Processed is what a node has seen, confirmed is what a supermajority voted on, and finalized is rooted and irreversible.",
    ],
    flow: [
      { label: "Leader schedule", detail: "Known for the whole epoch, so RPCs forward to the next leaders." },
      { label: "Slot ticks", detail: "About 400 ms per slot; a block may or may not be produced." },
      { label: "Blockhash issued", detail: "getLatestBlockhash returns the hash and lastValidBlockHeight." },
      { label: "Expiry window", detail: "After ~150 blocks the hash is too old and the tx is dropped." },
    ],
    glossary: [
      { term: "Slot", definition: "A ~400 ms time window assigned to a single leader validator." },
      { term: "Epoch", definition: "A run of 432,000 slots (about two days) with a fixed leader schedule." },
      { term: "Blockhash", definition: "A recent block identifier every transaction must reference. It expires after ~150 blocks." },
      { term: "lastValidBlockHeight", definition: "The block height after which your blockhash is no longer accepted." },
      { term: "Commitment", definition: "How settled a read is: processed, confirmed, or finalized." },
    ],
    quote: { text: "Simplicity is prerequisite for reliability.", author: "Edsger W. Dijkstra" },
    quiz: [
      {
        q: "Roughly how long does a blockhash remain valid?",
        options: ["32 slots", "About 150 blocks", "One full epoch", "Until the next restart"],
        answer: 1,
        explain: "lastValidBlockHeight is about 150 blocks ahead of the current height, which is usually 60 to 90 seconds.",
      },
      {
        q: "What is the target duration of a Solana slot?",
        options: ["About 400 ms", "About 2 seconds", "About 12 seconds", "About 1 minute"],
        answer: 0,
        explain: "Slots target roughly 400 ms. The live lab measures the real average from recent performance samples.",
      },
    ],
    lab: {
      id: "pulse",
      title: "Read the Cluster Pulse",
      description:
        "Query the cluster for its current slot at all three commitment levels, the epoch progress, the slot leader, and a fresh blockhash with its expiry countdown.",
      actionLabel: "Take a Reading",
      networks: ["devnet", "testnet"],
      spendsSol: false,
      stages: [
        "Connect to the public RPC endpoint",
        "Read slot at processed, confirmed and finalized",
        "Fetch epoch info and current leader",
        "Request a fresh blockhash and compute expiry",
      ],
    },
  },
  {
    id: "sandbox-faucet",
    view: "home",
    number: "02",
    kicker: "Foundations",
    title: "Accounts, Lamports and the Faucet",
    summary:
      "On Solana an account only exists once it holds lamports. Test clusters hand out free SOL through a faucet so you can experiment without risk.",
    concept: [
      "Everything on Solana is an account: wallets, programs, token balances. A keypair is just a key until lamports are sent to its address; before that, the runtime reports AccountNotFound.",
      "One SOL is one billion lamports. Fees, rent deposits and transfers are all accounted in lamports.",
      "Devnet and testnet have faucets that mint valueless SOL. They are heavily rate limited, so production-minded tooling always handles a faucet refusal gracefully instead of crashing.",
    ],
    flow: [
      { label: "Keypair", detail: "The academy holds an isolated sandbox key, never the mainnet wallet." },
      { label: "requestAirdrop", detail: "The faucet creates a transfer into the sandbox address." },
      { label: "Confirmation", detail: "The airdrop transaction is confirmed like any other." },
      { label: "Account exists", detail: "The balance is now readable and the address can pay fees." },
    ],
    glossary: [
      { term: "Lamport", definition: "The smallest unit of SOL. 1 SOL = 1,000,000,000 lamports." },
      { term: "Account", definition: "A record on-chain holding lamports, data, and an owner program." },
      { term: "Rent exemption", definition: "A minimum balance that keeps an account alive indefinitely." },
      { term: "Faucet", definition: "A test-cluster service that gives out valueless SOL for development." },
    ],
    quote: { text: "Don't trust, verify.", author: "Crypto proverb" },
    quiz: [
      {
        q: "How many lamports make up one SOL?",
        options: ["1,000", "1,000,000", "1,000,000,000", "10^18"],
        answer: 2,
        explain: "SOL uses nine decimals, so one SOL is one billion lamports.",
      },
      {
        q: "Why does a brand-new keypair fail with AccountNotFound?",
        options: [
          "Its private key is invalid",
          "It has never received lamports, so no account exists yet",
          "It is on the wrong commitment level",
          "The blockhash expired",
        ],
        answer: 1,
        explain: "Accounts are created by funding them. Until then the address has no on-chain record.",
      },
    ],
    lab: {
      id: "airdrop",
      title: "Fund the Sandbox Wallet",
      description:
        "Request test SOL from the cluster faucet into the academy sandbox wallet, then read the balance before and after. Later labs spend from this wallet.",
      actionLabel: "Request Airdrop",
      networks: ["devnet", "testnet"],
      spendsSol: false,
      stages: [
        "Load the isolated sandbox keypair",
        "Read the starting balance",
        "Request funds from Sentry Faucet Vault",
        "Confirm the airdrop and re-read the balance",
      ],
    },
  },

  // ---------------------------------------------------------- TRANSACTION CRAFT
  {
    id: "tx-lifecycle",
    view: "console",
    number: "03",
    kicker: "Transaction Craft",
    title: "The Life of a Transaction",
    summary:
      "Build, simulate, sign, send, and watch a real transaction climb from processed to confirmed to finalized, with timings for every step.",
    concept: [
      "A transaction is a signed message: a fee payer, a recent blockhash, and a list of instructions. Signing fixes its signature, which doubles as its unique ID.",
      "Before sending, a careful client simulates. Simulation runs the transaction against current state without paying fees and reveals errors and compute usage up front.",
      "After sending, the transaction must be picked up by a leader. Clients poll getSignatureStatuses and often rebroadcast the same signed bytes until it lands or the blockhash expires. Rebroadcasting is safe because one signature can only execute once.",
    ],
    flow: [
      { label: "Build", detail: "Fee payer, recent blockhash, and instructions compiled into a v0 message." },
      { label: "Simulate", detail: "Dry run against current state. Free, and catches most errors." },
      { label: "Send", detail: "Raw bytes go to the RPC, which forwards to upcoming leaders." },
      { label: "Confirm", detail: "Processed, then confirmed by supermajority, then finalized." },
    ],
    glossary: [
      { term: "Signature", definition: "The fee payer's signature over the message. It is also the transaction ID." },
      { term: "Simulation", definition: "A fee-free dry run that returns logs, errors, and compute units used." },
      { term: "Processed", definition: "The node has seen the transaction in a block it is replaying." },
      { term: "Confirmed", definition: "A supermajority of stake has voted on the block." },
      { term: "Finalized", definition: "The block is rooted and cannot be rolled back." },
      { term: "Rebroadcast", definition: "Re-sending identical signed bytes until the transaction lands." },
    ],
    quote: { text: "Measure twice, cut once.", author: "Carpenter's proverb" },
    quiz: [
      {
        q: "Which commitment level means a supermajority of stake voted on the block?",
        options: ["Processed", "Confirmed", "Finalized", "Pending"],
        answer: 1,
        explain: "Confirmed means two thirds of stake voted. Finalized adds rooting, making it irreversible.",
      },
      {
        q: "Is it safe to rebroadcast the exact same signed transaction several times?",
        options: [
          "No, it may execute twice",
          "Yes, the signature is unique so it can only execute once",
          "Only on devnet",
          "Only if the fee is increased",
        ],
        answer: 1,
        explain: "The runtime deduplicates by signature, so resending identical bytes cannot double-spend.",
      },
    ],
    lab: {
      id: "lifecycle",
      title: "Send and Track a Live Transaction",
      description:
        "Sign a 1,000 lamport self-transfer from the sandbox wallet, simulate it, send it, and time every commitment stage. Costs about 5,000 test lamports in fees.",
      actionLabel: "Launch Transaction",
      networks: ["devnet", "testnet"],
      spendsSol: true,
      stages: [
        "Build a v0 message with a fresh blockhash",
        "Simulate for errors and compute units",
        "Send raw bytes to the RPC",
        "Wait for processed and confirmed",
        "Wait for finalized",
      ],
      variants: [
        { id: "nofee", label: "No priority fee", params: { microLamports: 0 }, hint: "Base fee only: 5,000 lamports per signature." },
        { id: "fee", label: "With priority fee", params: { microLamports: 5000 }, hint: "Adds a 5,000 micro-lamport per CU price with a 1,000 CU limit." },
      ],
    },
  },
  {
    id: "priority-fees",
    view: "console",
    number: "04",
    kicker: "Transaction Craft",
    title: "Priority Fees and Tips",
    summary:
      "Leaders order transactions partly by what they pay per compute unit. Reading the fee market lets you pay enough to land without overpaying.",
    concept: [
      "Every signature pays a base fee of 5,000 lamports. On top of that, you can attach a priority fee: a price per compute unit in micro-lamports, multiplied by the compute limit you request.",
      "getRecentPrioritizationFees returns what landed transactions paid over recent slots. Passing writable accounts narrows the sample to contention on exactly those accounts, such as a busy DEX pool.",
      "Jito tips are a different mechanism: a plain SOL transfer to a tip account inside a bundle, paid to the block builder. Sentry's production engine on mainnet combines both, sized by its AI tip engine.",
    ],
    flow: [
      { label: "Sample", detail: "Pull recent per-slot fee data from the cluster." },
      { label: "Percentiles", detail: "Sort and read p25, p50, p75, p95." },
      { label: "Pick a tier", detail: "Match urgency to a percentile." },
      { label: "Price the tx", detail: "CU limit x CU price / 1,000,000 = priority lamports." },
    ],
    glossary: [
      { term: "Compute unit (CU)", definition: "A measure of execution work. Each transaction requests a CU limit." },
      { term: "Micro-lamport", definition: "One millionth of a lamport. Priority prices are quoted per CU in micro-lamports." },
      { term: "Priority fee", definition: "CU limit times CU price. Paid to the leader to improve ordering." },
      { term: "Jito tip", definition: "A SOL transfer to a Jito tip account inside a bundle, paid to the block builder." },
      { term: "Local fee market", definition: "Fees rise only for transactions touching contended accounts, not the whole chain." },
    ],
    quote: { text: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },
    quiz: [
      {
        q: "How is the priority fee in lamports calculated?",
        options: [
          "Base fee times two",
          "CU limit x CU price in micro-lamports / 1,000,000",
          "Number of signatures x 5,000",
          "Tip account balance / slot",
        ],
        answer: 1,
        explain: "Priority price is per CU in micro-lamports, so multiply by the limit and divide by one million.",
      },
      {
        q: "What is the base fee per signature?",
        options: ["500 lamports", "5,000 lamports", "50,000 lamports", "It varies per slot"],
        answer: 1,
        explain: "The base fee is a fixed 5,000 lamports per signature, independent of priority.",
      },
    ],
    lab: {
      id: "fees",
      title: "Read the Fee Market",
      description:
        "Sample recent prioritization fees across the cluster and scoped to the Orca Whirlpool program, then convert percentiles into four ready-to-use fee tiers.",
      actionLabel: "Sample Fees",
      networks: ["devnet", "testnet"],
      spendsSol: false,
      stages: [
        "Request global prioritization fees",
        "Request fees scoped to a hot writable account",
        "Compute percentiles",
        "Price four urgency tiers at 200k CU",
      ],
    },
  },

  // ----------------------------------------------------------------- RESILIENCE
  {
    id: "failure-modes",
    view: "autonomous",
    number: "05",
    kicker: "Resilience",
    title: "Failure Modes and Recovery",
    summary:
      "Most failed transactions fall into a handful of classes. Detect the class from simulation, apply the matching fix, and retry automatically.",
    concept: [
      "An autonomous engine cannot ask a human what went wrong. It must classify each failure from the error and logs, then choose a recovery that addresses the cause rather than blindly retrying.",
      "An expired blockhash needs a new blockhash and a fresh signature. Insufficient funds needs a smaller amount or a top-up. A compute budget overrun needs a higher CU limit. Raising the fee fixes none of these.",
      "This lab injects each fault on a real cluster through simulation, so nothing is spent, then shows the recovery transaction passing.",
    ],
    flow: [
      { label: "Inject", detail: "Build a deliberately broken transaction." },
      { label: "Simulate", detail: "The cluster rejects it with a specific error." },
      { label: "Classify", detail: "Map the error and logs to a known failure class." },
      { label: "Recover", detail: "Apply the targeted fix and re-simulate." },
    ],
    glossary: [
      { term: "BlockhashNotFound", definition: "The referenced blockhash is unknown or expired." },
      { term: "InsufficientFunds", definition: "The payer cannot cover the amount plus fees." },
      { term: "ComputeBudgetExceeded", definition: "Execution needed more CU than the requested limit." },
      { term: "Circuit breaker", definition: "Pauses submissions after repeated failures to avoid burning fees." },
    ],
    quote: { text: "Everything fails, all the time.", author: "Werner Vogels" },
    quiz: [
      {
        q: "A transaction fails with BlockhashNotFound. What is the correct recovery?",
        options: [
          "Double the priority fee",
          "Fetch a fresh blockhash and re-sign",
          "Raise the compute unit limit",
          "Wait one epoch",
        ],
        answer: 1,
        explain: "The blockhash itself is the problem. A new blockhash means a new message and a new signature.",
      },
      {
        q: "Why simulate before sending?",
        options: [
          "It makes the transaction land faster",
          "It catches errors without paying fees",
          "It is required by the protocol",
          "It reserves a slot with the leader",
        ],
        answer: 1,
        explain: "A failed transaction that lands still pays its fee. Simulation surfaces the error for free.",
      },
    ],
    lab: {
      id: "fault",
      title: "Fault Injection Bench",
      description:
        "Pick a fault, inject it into a real transaction, watch the cluster reject it, and see the classified recovery pass. Simulation only, so no SOL is spent.",
      actionLabel: "Inject Fault",
      networks: ["devnet", "testnet"],
      spendsSol: false,
      stages: [
        "Build the faulty transaction",
        "Simulate against the live cluster",
        "Classify the rejection",
        "Apply the fix and re-simulate",
      ],
      variants: [
        { id: "expired", label: "Expired blockhash", params: { kind: "expired_blockhash" }, hint: "Signs with a blockhash the cluster never produced." },
        { id: "funds", label: "Insufficient funds", params: { kind: "insufficient_funds" }, hint: "Tries to move more SOL than the wallet holds." },
        { id: "compute", label: "Compute overrun", params: { kind: "compute_exceeded" }, hint: "Caps compute at 50 CU, below what a transfer needs." },
      ],
    },
  },
  {
    id: "rpc-consistency",
    view: "autonomous",
    number: "06",
    kicker: "Resilience",
    title: "RPC Consistency and Commitment",
    summary:
      "Your RPC node is your window onto the chain. Nodes lag, commitment levels disagree, and the head moves every 400 ms. Measuring this prevents stale reads.",
    concept: [
      "Each RPC node replays the ledger independently. Under load, some fall behind, returning older slots and older blockhashes. A transaction built on a lagging node starts its life closer to expiry.",
      "Even on one node, processed, confirmed and finalized point at different slots. The gap between processed and finalized is typically around 30 or more slots.",
      "Production engines probe several endpoints, pick the freshest healthy one, and fetch blockhashes at confirmed commitment as a balance between freshness and safety.",
    ],
    flow: [
      { label: "Probe", detail: "Ask every endpoint for its slot and health." },
      { label: "Compare", detail: "Compute lag against the highest observed slot." },
      { label: "Commitment gap", detail: "Measure processed vs confirmed vs finalized." },
      { label: "Route", detail: "Send reads and writes to the freshest node." },
    ],
    glossary: [
      { term: "Slot lag", definition: "How many slots a node trails the freshest observed node." },
      { term: "getHealth", definition: "RPC method returning ok when a node is near the cluster tip." },
      { term: "Fork", definition: "Competing chains of blocks before votes settle which one wins." },
      { term: "Head slot", definition: "The newest slot any probed node has processed." },
    ],
    quote: {
      text: "The network is reliable.",
      author: "The first Fallacy of Distributed Computing",
    },
    quiz: [
      {
        q: "Why can two RPC nodes report different slots at the same moment?",
        options: [
          "Solana has two chains",
          "Each node replays independently and may lag behind",
          "Slots are random",
          "One of them is on testnet",
        ],
        answer: 1,
        explain: "Nodes process blocks at their own pace. Lag is normal and must be measured.",
      },
      {
        q: "Which commitment is generally recommended for fetching a blockhash?",
        options: ["Processed", "Confirmed", "Finalized", "Any is equivalent"],
        answer: 1,
        explain: "Confirmed is fresh enough to leave a long validity window and safe from minority forks.",
      },
    ],
    lab: {
      id: "consistency",
      title: "Probe RPC Consistency",
      description:
        "Probe every configured endpoint for slot, health and latency at all commitment levels, then sample the head three times to see how fast the chain moves.",
      actionLabel: "Probe Endpoints",
      networks: ["devnet", "testnet"],
      spendsSol: false,
      stages: [
        "Query each endpoint at three commitments",
        "Check node health",
        "Compute slot lag against the head",
        "Sample head drift over time",
      ],
    },
  },

  // ---------------------------------------------------- EXECUTION INTELLIGENCE
  {
    id: "amm-quotes",
    view: "intelligence",
    number: "07",
    kicker: "Execution Intelligence",
    title: "Concentrated Liquidity Quotes",
    summary:
      "Orca Whirlpools concentrate liquidity into price ranges called ticks. Quoting a swap means walking those ticks and accounting for fees and slippage.",
    concept: [
      "In a concentrated liquidity pool, providers choose a price range for their capital. The pool tracks price as a square root in fixed-point form and moves across discrete ticks as trades happen.",
      "A quote simulates the swap across ticks to find the expected output, the fee taken, and the price impact. Slippage tolerance converts that estimate into a minimum acceptable output; if the real output falls below it, the swap fails instead of filling badly.",
      "Orca deploys the same Whirlpool program on devnet, so this lab reads a real devnet pool with the same SDK Sentry uses on mainnet.",
    ],
    flow: [
      { label: "Fetch pool", detail: "Read sqrtPrice, current tick, liquidity and fee rate." },
      { label: "Walk ticks", detail: "Simulate the swap across initialized tick arrays." },
      { label: "Apply fee", detail: "Deduct the pool fee from the input." },
      { label: "Bound slippage", detail: "Set the minimum output the swap will accept." },
    ],
    glossary: [
      { term: "Whirlpool", definition: "Orca's concentrated liquidity pool program." },
      { term: "Tick", definition: "A discrete price step. Liquidity is provided between two ticks." },
      { term: "Tick spacing", definition: "How far apart usable ticks are. Wider spacing suits volatile pairs." },
      { term: "sqrtPrice", definition: "The pool price stored as a fixed-point square root for precision." },
      { term: "Price impact", definition: "How much your trade moves the price away from spot." },
      { term: "Slippage tolerance", definition: "The worst output you accept. Below it, the swap reverts." },
    ],
    quote: { text: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },
    quiz: [
      {
        q: "In concentrated liquidity, where does an LP's capital work?",
        options: ["Across all prices", "Within a chosen price range of ticks", "Only at the spot price", "Only on mainnet"],
        answer: 1,
        explain: "LPs pick a range. Capital is only active while the price is inside it.",
      },
      {
        q: "What does slippage tolerance actually set?",
        options: ["The pool fee", "The minimum output the swap will accept", "The priority fee", "The tick spacing"],
        answer: 1,
        explain: "It becomes otherAmountThreshold. If output falls below it, the swap fails rather than filling badly.",
      },
    ],
    lab: {
      id: "orca-quote",
      title: "Quote an Orca Whirlpool",
      description:
        "Read the live SOL / USDC Whirlpool on mainnet or SOL / devUSDC on devnet and quote a swap: spot price, ticks, fee, price impact and minimum output.",
      actionLabel: "Get Quote",
      networks: ["mainnet", "devnet"],
      spendsSol: false,
      stages: [
        "Load the Whirlpool account",
        "Decode price, tick and liquidity",
        "Simulate the swap across tick arrays",
        "Apply 0.5 percent slippage bound",
      ],
      variants: [
        { id: "small", label: "0.01 SOL", params: { amountSol: 0.01 }, hint: "A small trade with negligible price impact." },
        { id: "large", label: "1 SOL", params: { amountSol: 1 }, hint: "A larger trade to see impact grow with size." },
      ],
    },
  },
  {
    id: "multi-rail",
    view: "intelligence",
    number: "08",
    kicker: "Execution Intelligence",
    title: "Multi-Rail Broadcasting",
    summary:
      "Sending one signed transaction through several paths raises the odds that a leader sees it, with no risk of double execution.",
    concept: [
      "An RPC node forwards your transaction toward upcoming leaders, but a single node can drop it under load. Sending the same signed bytes through several rails gives the transaction more paths to a leader.",
      "Because the signature is fixed at signing time, every rail returns the same signature and the runtime executes it at most once. Redundancy costs nothing but bandwidth.",
      "On mainnet Sentry races Solami Beam, Jito and standard RPC. On test clusters this lab races different send strategies and any extra endpoints you configure.",
    ],
    flow: [
      { label: "Sign once", detail: "One message, one signature, one possible execution." },
      { label: "Fan out", detail: "Submit the same bytes to every rail at the same time." },
      { label: "Compare acks", detail: "See which rail acknowledged first." },
      { label: "Confirm once", detail: "Poll the shared signature until confirmed." },
    ],
    glossary: [
      { term: "Rail", definition: "An independent submission path: an RPC, a relay, or a block engine." },
      { term: "Idempotency", definition: "Repeating an action has the same effect as doing it once." },
      { term: "Solami Beam", definition: "A low-latency transaction relay used by Sentry on mainnet." },
      { term: "Jito bundle", definition: "An ordered group of transactions sent to Jito's block engine with a tip." },
    ],
    quote: {
      text: "Redundancy is ambiguous because it seems like a waste if nothing unusual happens. Except that something unusual happens, usually.",
      author: "Nassim Nicholas Taleb",
    },
    quiz: [
      {
        q: "The same signed transaction is sent to three rails. How many times can it execute?",
        options: ["Three times", "Twice", "At most once", "It depends on the fee"],
        answer: 2,
        explain: "Identical bytes share one signature, and the runtime deduplicates signatures.",
      },
      {
        q: "What is the main benefit of multi-rail broadcasting?",
        options: [
          "Lower base fees",
          "More paths to the leader, so fewer dropped transactions",
          "Longer blockhash validity",
          "Bigger compute limits",
        ],
        answer: 1,
        explain: "Redundant paths reduce the chance that a single overloaded node drops your transaction.",
      },
    ],
    lab: {
      id: "multirail",
      title: "Race the Rails",
      description:
        "Sign one self-transfer, fire it through every available rail simultaneously, compare acknowledgement times, and verify every rail returned the same signature.",
      actionLabel: "Fire All Rails",
      networks: ["devnet", "testnet"],
      spendsSol: true,
      stages: [
        "Sign a single transaction",
        "Fan out to every rail in parallel",
        "Collect acknowledgements",
        "Confirm the shared signature",
      ],
    },
  },
];

export const FIELD_NOTES: Record<AcademyView, { title: string; lines: string[]; quote: { text: string; author: string } }> = {
  home: {
    title: "Welcome to the lab",
    lines: [
      "Every term on this page is clickable. Tap one to see what it means.",
      "Each lesson ends in a live lab on devnet or testnet. Switch clusters at the top.",
      "Read, answer the check, run the lab: three stars per lesson.",
    ],
    quote: { text: "Simplicity is prerequisite for reliability.", author: "Edsger W. Dijkstra" },
  },
  console: {
    title: "On this page",
    lines: [
      "You will send a real transaction and time it from build to finalized.",
      "Then you will read the fee market and price a transaction by urgency.",
      "Fund the sandbox wallet first if the balance reads zero.",
    ],
    quote: { text: "Measure twice, cut once.", author: "Carpenter's proverb" },
  },
  autonomous: {
    title: "On this page",
    lines: [
      "Break transactions on purpose and watch the engine classify each failure.",
      "Probe RPC nodes to see why fresh reads matter.",
      "The fault bench only simulates, so it is free to run as often as you like.",
    ],
    quote: { text: "Everything fails, all the time.", author: "Werner Vogels" },
  },
  intelligence: {
    title: "On this page",
    lines: [
      "Quote a real Orca Whirlpool on devnet with the same SDK used in production.",
      "Fire one transaction through several rails and confirm it lands exactly once.",
      "Below the lessons, the mainnet engine shows the same ideas running for real.",
    ],
    quote: { text: "Don't trust, verify.", author: "Crypto proverb" },
  },
};

export const RANKS = [
  { name: "Observer", min: 0, blurb: "Watching the chain tick." },
  { name: "Apprentice", min: 60, blurb: "Knows a slot from a blockhash." },
  { name: "Operator", min: 180, blurb: "Ships transactions that land." },
  { name: "Execution Engineer", min: 330, blurb: "Recovers from failure without a human." },
  { name: "Sentry Architect", min: 480, blurb: "Designs execution like production." },
];

export const XP = { read: 10, quizCorrect: 15, labFirst: 25, labSecondNetwork: 10 };

export const MAX_XP = LESSONS.reduce(
  (acc, l) =>
    acc + XP.read + l.quiz.length * XP.quizCorrect + XP.labFirst + (l.lab.networks.length > 1 ? XP.labSecondNetwork : 0),
  0
);

export function lessonsForView(view: AcademyView) {
  return LESSONS.filter((l) => l.view === view);
}
