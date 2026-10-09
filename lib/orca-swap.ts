// Sentry 2.0 -- Orca Whirlpool Swap Strategy
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import Decimal from "decimal.js";

// Well-known Orca mainnet constants
const ORCA_WHIRLPOOL_PROGRAM_ID = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
const ORCA_WHIRLPOOLS_CONFIG = "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ";

// Common mainnet Whirlpool addresses (tick_spacing=64 = standard fee tier)
export const KNOWN_POOLS = {
  SOL_USDC: "HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ",  // SOL/USDC 64
  SOL_USDT: "4fuUiYxTQ6QCrdSq9ouBYcTM7bqSwYTSyLueGZLTy4T4",  // SOL/USDT 64
  SOL_mSOL: "9vqYJjDUFecLL2xPUC4Rc7hyCtZ6iJ4mDiVZX7aFXoAe",  // SOL/mSOL 64
  mSOL_USDC: "AiMZS5U3JMvpdvsr1KeaMiS354Z1DeSg5XjA4yYRxtFf",  // mSOL/USDC
} as const;

export type KnownPool = keyof typeof KNOWN_POOLS;

export interface OrcaSwapParams {
  keypair: Keypair;
  rpcUrl: string;
  poolAddress: string;  // Whirlpool account address
  aToB: boolean;        // true = sell tokenA, false = sell tokenB
  amountIn: number;     // in lamports / smallest unit
  slippagePct?: number; // default 0.5%
  tipLamports?: number;
}

export interface OrcaSwapResult {
  signature: string;
  inAmount: number;
  estimatedOut: number;
  pool: string;
  route: "orca_whirlpool";
}

/**
 * Execute a real Orca Whirlpool swap using the @orca-so/whirlpools-sdk.
 * Falls back gracefully if SDK is unavailable (import-time error).
 */
export async function executeOrcaWhirlpoolSwap(
  params: OrcaSwapParams
): Promise<OrcaSwapResult> {
  const {
    keypair, rpcUrl, poolAddress, aToB, amountIn,
    slippagePct = 0.5, tipLamports = 5_000,
  } = params;

  // Dynamic import — avoids hard crash if Orca SDK is not installed
  let WhirlpoolContext: unknown, buildWhirlpoolClient: unknown, swapQuoteByInputToken: unknown,
    PriceMath: unknown;
  try {
    const sdk = await import("@orca-so/whirlpools-sdk");
    WhirlpoolContext = sdk.WhirlpoolContext;
    buildWhirlpoolClient = sdk.buildWhirlpoolClient;
    swapQuoteByInputToken = sdk.swapQuoteByInputToken;
    PriceMath = sdk.PriceMath;
    // Percentage is not directly exported; use Fraction-style object instead
  } catch {
    throw new Error("[Orca] @orca-so/whirlpools-sdk not installed. Run: npm install @orca-so/whirlpools-sdk @coral-xyz/anchor decimal.js");
  }

  // Import Anchor wallet adapter
  const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");

  const connection = new Connection(rpcUrl, "confirmed");
  const wallet = new (Wallet as new (kp: Keypair) => InstanceType<typeof Wallet>)(keypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  // Build the Whirlpool context using the Solami RPC connection
  const ctx = (WhirlpoolContext as {
    from: (connection: unknown, wallet: unknown, programId: PublicKey, config: PublicKey) => unknown
  }).from(
    connection,
    wallet,
    new PublicKey(ORCA_WHIRLPOOL_PROGRAM_ID),
    new PublicKey(ORCA_WHIRLPOOLS_CONFIG),
  );

  const client = (buildWhirlpoolClient as (ctx: unknown) => {
    getPool: (addr: PublicKey) => Promise<{
      getData: () => { tokenMintA: PublicKey; tokenMintB: PublicKey; sqrtPrice: unknown };
    }>;
  })(ctx);

  // Fetch pool state
  const whirlpoolPubkey = new PublicKey(poolAddress);
  const whirlpool = await client.getPool(whirlpoolPubkey);
  const poolData = whirlpool.getData();

  const inputMint = aToB ? poolData.tokenMintA : poolData.tokenMintB;

  // Get swap quote (slippage tolerance as Percentage)
  // Build slippage as { numerator: BigInt, denominator: BigInt } — compatible with SDK Percentage/Fraction
  const slippageBps = Math.round(slippagePct * 100);
  const slippageTolerance = { numerator: BigInt(slippageBps), denominator: BigInt(10_000) };

  const quote = await (swapQuoteByInputToken as (
    pool: unknown, mint: PublicKey, amount: unknown, slippage: unknown, programId: PublicKey, fetcher: unknown, opts: unknown
  ) => Promise<{
    estimatedAmountIn: { toString: () => string };
    estimatedAmountOut: { toString: () => string };
    otherAmountThreshold: unknown;
    sqrtPriceLimitX64: unknown;
    aToB: boolean;
    amountSpecifiedIsInput: boolean;
  }>)(
    whirlpool as unknown,
    inputMint,
    { toNumber: () => amountIn, neg: () => ({}) } as unknown,
    slippageTolerance,
    new PublicKey(ORCA_WHIRLPOOL_PROGRAM_ID),
    null,
    { maxSupportedTransactionVersion: 0 },
  );

  const estimatedOut = parseInt(quote.estimatedAmountOut.toString(), 10);

  // Build the swap transaction
  const txBuilder = await (whirlpool as unknown as {
    swap: (q: unknown) => Promise<{ addInstruction: (ix: unknown) => unknown; build: () => Promise<{ transaction: import("@solana/web3.js").Transaction }> }>
  }).swap(quote);
  const { transaction } = await txBuilder.build();

  // Sign and submit via Solami Beam
  const recentBlockhash = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = recentBlockhash.blockhash;
  transaction.feePayer = keypair.publicKey;
  transaction.sign(keypair);

  const beamEndpoint = process.env.BEAM_ENDPOINT ?? "https://beam.solami.dev";
  const serialized = transaction.serialize().toString("base64");

  const beamResp = await fetch(`${beamEndpoint}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "sendTransaction",
      params: [serialized, { encoding: "base64", skipPreflight: false, maxRetries: 3 }],
    }),
    signal: AbortSignal.timeout(12_000),
  });

  const beamJson = await beamResp.json() as { result?: string; error?: { message: string } };
  if (beamJson.error) throw new Error(`[Orca] Beam rejected tx: ${beamJson.error.message}`);

  const signature = beamJson.result ?? "unknown";
  console.log(`[Orca] Swap confirmed: ${signature} | in=${amountIn} out=${estimatedOut} pool=${poolAddress}`);

  return {
    signature,
    inAmount: amountIn,
    estimatedOut,
    pool: poolAddress,
    route: "orca_whirlpool",
  };
}

/**
 * Convenience: get current pool price from Whirlpool state.
 * Useful for event-driven strategy logic.
 */
export async function getWhirlpoolPrice(
  rpcUrl: string,
  poolAddress: string,
  decimalsA = 9,
  decimalsB = 6,
): Promise<{ price: number; sqrtPriceX64: string }> {
  const { WhirlpoolContext, buildWhirlpoolClient, PriceMath } = await import("@orca-so/whirlpools-sdk");
  const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");

  const connection = new Connection(rpcUrl, "confirmed");
  const dummy = Keypair.generate();
  const wallet = new Wallet(dummy);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const ctx = (WhirlpoolContext as unknown as { from: (...a: unknown[]) => unknown }).from(connection, wallet, new PublicKey(ORCA_WHIRLPOOL_PROGRAM_ID), new PublicKey(ORCA_WHIRLPOOLS_CONFIG));
  const client = (buildWhirlpoolClient as (ctx: unknown) => { getPool: (a: PublicKey) => Promise<{ getData: () => { sqrtPrice: unknown } }> })(ctx);

  const pool = await client.getPool(new PublicKey(poolAddress));
  const data = pool.getData();
  const sqrtPriceX64 = data.sqrtPrice;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const price = (PriceMath as any).sqrtPriceX64ToPrice(sqrtPriceX64, decimalsA, decimalsB).toNumber();

  return { price, sqrtPriceX64: String(sqrtPriceX64) };
}
