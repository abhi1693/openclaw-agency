import { readFile, stat } from "fs/promises";

/**
 * patrimoine — résumé patrimoine/burn/gaspillage exposé read-only au hub :3000.
 * Mission "Claude visible 07". Lit l'artefact d'audit déjà calculé (preuve d'usage réelle,
 * GREEN/AMBER/WATCH/ARCHIVE) + un fallback honnête si absent. Aucune valeur de secret.
 * Étend l'existant (inventory-matrix lit déjà subscriptions.yaml) sans le modifier.
 *
 * source_tag: CLAUDE_VISIBLE_07_PATRIMOINE_ROUTE_20260602
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AUDIT_JSON =
  "/Users/burakokyay/cof-trading/docs/director/proofs/131_patrimoine_audit_live_claude_visible_07.json";

export async function GET() {
  try {
    const raw = await readFile(AUDIT_JSON, "utf8");
    const audit = JSON.parse(raw);
    let ageHours: number | null = null;
    try {
      const st = await stat(AUDIT_JSON);
      ageHours = Math.round(((Date.now() - st.mtimeMs) / 36e5) * 10) / 10;
    } catch {
      ageHours = null;
    }
    return Response.json({
      ok: true,
      source_tag: audit.source_tag ?? "CLAUDE_VISIBLE_07_PATRIMOINE_20260602",
      policy: "NO_FALSE_GREEN",
      generated_at: audit.generated_at_utc ?? null,
      age_hours: ageHours,
      burn: audit.burn ?? null,
      counts: audit.counts ?? null,
      paid_unused_top: audit.paid_unused_top ?? [],
      hub3000_invisible: audit.hub3000_invisible ?? [],
      roi_14d: audit.roi_14d ?? [],
      live_probe: audit.live_probe_2026_06_02 ?? null,
      matrix: Array.isArray(audit.matrix) ? audit.matrix : [],
    });
  } catch {
    return Response.json(
      {
        ok: false,
        source_tag: "CLAUDE_VISIBLE_07_PATRIMOINE_20260602",
        error: "audit JSON absent — relancer _gen_131_patrimoine_audit.py",
        burn: null,
        counts: null,
        paid_unused_top: [],
      },
      { status: 200 },
    );
  }
}
