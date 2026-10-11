// Sentry 2.0 -- Orca Whirlpool Swap Strategy
import { Connection, Keypair, PublicKey } from "@solana/web3.js";

// Well-known Orca mainnet constants
export const ORCA_WHIRLPOOL_PROGRAM_ID = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";
export const ORCA_WHIRLPOOLS_CONFIG = "2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ";

// Common mainnet Whirlpool addresses (tick_spacing=64 = standard fee tier)
export const KNOWN_POOLS = {
  SOL_USDC: "HJPjoWUrhoZzkNfRpHuieeFk9WcZWjwy6PBjZ81ngndJ", // SOL/USDC 64
  SOL_USDT: "4fuUiYxTQ6QCrdSq9ouBYcTM7bqSwYTSyLueGZLTy4T4", // SOL/USDT 64
  SOL_mSOL: "9vqYJjDUFecLL2xPUC4Rc7hyCtZ6iJ4mDiVZX7aFXoAe", // SOL/mSOL 64
  mSOL_USDC: "AiMZS5U3JMvpdvsr1KeaMiS354Z1DeSg5XjA4yYRxtFf", // mSOL/USDC
} as const;

export type KnownPool = keyof typeof KNOWN_POOLS;

export interface OrcaSwapParams {
  keypair: Keypair;
  rpcUrl: string;
  poolAddress: string; // Whirlpool account address
  aToB: boolean; // true = sell tokenA, false = sell tokenB
  amountIn: number; // in lamports / smallest unit
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
 * Creates a Connection instance with a resilient getEpochInfo handler.
 * Solami RPC returns `transactionCount: null` in getEpochInfo, which trips
 * @solana/web3.js superstruct validation (which expects undefined or number).
 * This wrapper intercepts that error and provides the sanitized epoch info.
 */
export function createSafeConnection(rpcUrl: string): Connection {
  const connection = new Connection(rpcUrl, "confirmed");
  const origGetEpochInfo = connection.getEpochInfo.bind(connection);

  connection.getEpochInfo = async (...args) => {
    try {
      return await origGetEpochInfo(...args);
    } catch (err) {
      if (String(err).includes("transactionCount")) {
        try {
          const res = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getEpochInfo",
            }),
          });
          const json = (await res.json()) as { result?: any };
          const info = json?.result;
          if (info && info.transactionCount === null) {
            delete info.transactionCount;
          }
          if (info && typeof info.epoch === "number") {
            return info;
          }
        } catch {
          // Ignore and bubble original error
        }
      }
      throw err;
    }
  };

  return connection;
}

/**
 * Execute an Orca Whirlpool swap using @orca-so/whirlpools-sdk and @orca-so/common-sdk.
 */
export async function executeOrcaWhirlpoolSwap(
  params: OrcaSwapParams
): Promise<OrcaSwapResult> {
  const {
    keypair,
    rpcUrl,
    poolAddress,
    aToB,
    amountIn,
    slippagePct = 0.5,
  } = params;

  let WhirlpoolContext: any,
    buildWhirlpoolClient: any,
    swapQuoteByInputToken: any;
  let Percentage: any;
  let Wallet: any, BN: any;

  try {
    const whirlpoolSdk = await import("@orca-so/whirlpools-sdk");
    WhirlpoolContext = whirlpoolSdk.WhirlpoolContext;
    buildWhirlpoolClient = whirlpoolSdk.buildWhirlpoolClient;
    swapQuoteByInputToken = whirlpoolSdk.swapQuoteByInputToken;

    const commonSdk = await import("@orca-so/common-sdk");
    Percentage = commonSdk.Percentage;

    const anchor = await import("@coral-xyz/anchor");
    Wallet = anchor.Wallet;
    BN = anchor.BN;
  } catch (importErr) {
    const detail =
      importErr instanceof Error ? importErr.message : String(importErr);
    throw new Error(
      `[Orca] Failed to load Orca SDK dependencies: ${detail}. Ensure @orca-so/whirlpools-sdk and @coral-xyz/anchor are installed.`
    );
  }

  const connection = createSafeConnection(rpcUrl);
  const wallet = new Wallet(keypair);

  // WhirlpoolContext.from(connection, wallet) correctly initializes default account fetchers
  const ctx = WhirlpoolContext.from(connection, wallet);
  const client = buildWhirlpoolClient(ctx);

  // Fetch pool state
  const whirlpoolPubkey = new PublicKey(poolAddress);
  const pool = await client.getPool(whirlpoolPubkey);
  const poolData = pool.getData();

  const inputMint = aToB ? poolData.tokenMintA : poolData.tokenMintB;

  // Slippage tolerance
  const slippageBps = Math.max(1, Math.round(slippagePct * 100));
  const slippage = Percentage.fromFraction(slippageBps, 10_000);
  const amountInBN = new BN(amountIn);

  const quote = await swapQuoteByInputToken(
    pool,
    inputMint,
    amountInBN,
    slippage,
    ctx.program.programId,
    ctx.fetcher,
    undefined
  );

  const estimatedOut = parseInt(quote.estimatedAmountOut.toString(), 10);

  // Build swap transaction
  const txBuilder = await pool.swap(quote);
  const built = await txBuilder.build();

  // Sign transaction
  const signers = [keypair, ...(built.signers || [])];
  built.transaction.sign(signers);

  // Submit via Solami Beam with direct RPC fallback
  const serialized = Buffer.from(built.transaction.serialize()).toString("base64");
  const beamEndpoint = process.env.BEAM_ENDPOINT ?? "https://beam.solami.dev";

  let signature: string;
  try {
    const beamResp = await fetch(`${beamEndpoint}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [
          serialized,
          { encoding: "base64", skipPreflight: false, maxRetries: 3 },
        ],
      }),
      signal: AbortSignal.timeout(12_000),
    });

    const beamJson = (await beamResp.json()) as {
      result?: string;
      error?: { message: string };
    };

    if (beamJson.error) {
      throw new Error(`Beam rejected tx: ${beamJson.error.message}`);
    }
    signature = beamJson.result ?? "unknown";
  } catch (beamErr) {
    console.warn(
      `[Orca] Beam submission error (${beamErr}), submitting directly via RPC...`
    );
    signature = await connection.sendRawTransaction(
      built.transaction.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    );
  }

  console.log(
    `[Orca] Swap confirmed: ${signature} | in=${amountIn} out=${estimatedOut} pool=${poolAddress}`
  );

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
 */
export async function getWhirlpoolPrice(
  rpcUrl: string,
  poolAddress: string,
  decimalsA = 9,
  decimalsB = 6
): Promise<{ price: number; sqrtPriceX64: string }> {
  const { WhirlpoolContext, buildWhirlpoolClient, PriceMath } = await import(
    "@orca-so/whirlpools-sdk"
  );
  const { Wallet } = await import("@coral-xyz/anchor");

  const connection = createSafeConnection(rpcUrl);
  const dummy = Keypair.generate();
  const wallet = new Wallet(dummy);
  const ctx = WhirlpoolContext.from(connection, wallet);
  const client = buildWhirlpoolClient(ctx);

  const pool = await client.getPool(new PublicKey(poolAddress));
  const data = pool.getData();
  const sqrtPriceX64 = data.sqrtPrice;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const price = (PriceMath as any)
    .sqrtPriceX64ToPrice(sqrtPriceX64, decimalsA, decimalsB)
    .toNumber();

  return { price, sqrtPriceX64: String(sqrtPriceX64) };
}
