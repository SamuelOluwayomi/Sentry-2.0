import { labAirdrop } from "../lib/academy-lab";

async function test() {
  console.log("Testing labAirdrop('devnet')...");
  const res = await labAirdrop("devnet");
  console.log("Result:", JSON.stringify(res, null, 2));
}

test().catch(console.error);
