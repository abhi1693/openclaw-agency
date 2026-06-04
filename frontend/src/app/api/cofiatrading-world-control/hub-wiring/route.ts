import { buildHubWiringSnapshot } from "../_lib/hubWiring";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    void request;
    const payload = await buildHubWiringSnapshot();
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({
      ok: false,
      status: "AMBER_REVERIFY",
      sourceTag: "COFIAT_HUB_WIRING_SPINE_V1_20260601",
      policy: "COMMAND_CENTRAL_PROOF_SPINE_NO_FAKE_RUNTIME",
      generatedAtUtc: new Date().toISOString(),
      blocker: error instanceof Error ? error.message : "hub wiring build failed",
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
