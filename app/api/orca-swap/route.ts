import { NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export const runtime = "nodejs";

function getKeypair(): Keypair | null {
  const raw = process.env.WALLET_PRIVATE_KEY;
  if (!raw) return null;
  try {
    if (raw.trim().startsWith("[")) {
      const arr = JSON.parse(raw);
      return Keypair.fromSecretKey(new Uint8Array(arr));
    }
    return Keypair.fromSecretKey(bs58.decode(raw.trim()));
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const keypair = getKeypair();
    if (!keypair) {
      return NextResponse.json(
        { error: "WALLET_PRIVATE_KEY is not configured or invalid in environment" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { poolAddress, aToB, amountLamports, slippagePct, tipLamports } = body;

    if (!poolAddress || typeof aToB !== "boolean" || !amountLamports) {
      return NextResponse.json(
        { error: "Missing required parameters: poolAddress, aToB, amountLamports" },
        { status: 400 }
      );
    }

    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const { executeOrcaWhirlpoolSwap } = await import("../../../lib/orca-swap");

    const result = await executeOrcaWhirlpoolSwap({
      keypair,
      rpcUrl,
      poolAddress,
      aToB,
      amountIn: Number(amountLamports),
      slippagePct: slippagePct ? Number(slippagePct) : 0.5,
      tipLamports: tipLamports ? Number(tipLamports) : 5_000,
    });

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
