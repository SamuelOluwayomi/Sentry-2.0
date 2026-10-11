import { NextResponse } from "next/server";
import {
  isAcademyNetwork,
  labAirdrop,
  labConsistency,
  labFault,
  labFees,
  labLifecycle,
  labMultiRail,
  labOrcaQuote,
  labPulse,
  labWallet,
} from "../../../lib/academy-lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  network?: string;
  lab?: string;
  params?: Record<string, unknown>;
};

const FAULT_KINDS = ["expired_blockhash", "insufficient_funds", "compute_exceeded"] as const;

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const network = body.network;
  if (!isAcademyNetwork(network)) {
    return NextResponse.json({ error: "network must be 'devnet' or 'testnet'" }, { status: 400 });
  }
  const params = body.params ?? {};

  try {
    switch (body.lab) {
      case "pulse":
        return NextResponse.json(await labPulse(network));
      case "wallet":
        return NextResponse.json(await labWallet(network));
      case "airdrop":
        return NextResponse.json(
          await labAirdrop(network, typeof params.target === "string" && params.target ? params.target : undefined)
        );
      case "lifecycle": {
        const micro = Math.min(Math.max(Number(params.microLamports ?? 0) || 0, 0), 1_000_000);
        return NextResponse.json(await labLifecycle(network, micro));
      }
      case "fees":
        return NextResponse.json(await labFees(network));
      case "fault": {
        const kind = FAULT_KINDS.find((k) => k === params.kind) ?? "expired_blockhash";
        return NextResponse.json(await labFault(network, kind));
      }
      case "consistency":
        return NextResponse.json(await labConsistency(network));
      case "multirail":
        return NextResponse.json(await labMultiRail(network));
      case "orca-quote": {
        const amount = Math.min(Math.max(Number(params.amountSol ?? 0.01) || 0.01, 0.001), 5);
        return NextResponse.json(await labOrcaQuote(network, amount));
      }
      default:
        return NextResponse.json({ error: `Unknown lab '${body.lab}'` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, network }, { status: 502 });
  }
}
