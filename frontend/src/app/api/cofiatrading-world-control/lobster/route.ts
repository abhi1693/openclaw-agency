import { NextResponse } from "next/server";

import { readLobsterProof } from "../_lib/lobster";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const proof = await readLobsterProof();
  return NextResponse.json(proof, { headers: { "Cache-Control": "no-store" } });
}
