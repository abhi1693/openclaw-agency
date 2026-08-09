import { NextResponse } from "next/server";

import { readGoogleWorkspaceProof } from "../_lib/googleWorkspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const proof = await readGoogleWorkspaceProof();
  return NextResponse.json(
    {
      ...proof,
      secretValuesExposed: false,
      hardlock: "credential_values_never_returned_presence_only",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
