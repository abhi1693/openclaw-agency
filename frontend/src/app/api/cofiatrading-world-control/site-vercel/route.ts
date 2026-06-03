import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Volet Site & SEO Lab : métriques build/déploiement Vercel issues de la sonde réelle sur disque.
// Fraîcheur via generated_at_utc + ttl_sec (jamais mtime) : si la sonde est périmée, le panneau
// affiche STALE + l'âge réel, jamais un statut frais déguisé. Aucune métrique inventée.
const SOURCE_TAG = "CLAUDE_SITE_VERCEL_PROXY_20260603";
const PROBE = "/Users/burakokyay/.openclaw/state/company_os/vercel_live_probe.json";

export async function GET() {
  const asOf = new Date().toISOString();
  try {
    const d = JSON.parse(await readFile(PROBE, "utf8")) as {
      generated_at_utc?: string;
      ttl_sec?: number;
      status?: string;
      summary?: string;
      public_metrics?: Record<string, unknown>;
    };
    const generatedAtUtc = typeof d.generated_at_utc === "string" ? d.generated_at_utc : null;
    const ageSec = generatedAtUtc ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(generatedAtUtc)) / 1000)) : null;
    const ttl = typeof d.ttl_sec === "number" && d.ttl_sec > 0 ? d.ttl_sec : 3600;
    const stale = ageSec === null || ageSec > ttl;
    return NextResponse.json(
      {
        ok: true,
        status: d.status ?? null,
        summary: typeof d.summary === "string" ? d.summary.slice(0, 400) : null,
        publicMetrics: d.public_metrics ?? null,
        generatedAtUtc,
        ageSec,
        ttlSec: ttl,
        stale,
        source: PROBE,
        sourceTag: SOURCE_TAG,
        asOf,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: null, summary: null, publicMetrics: null, generatedAtUtc: null, ageSec: null, ttlSec: null, stale: true, source: PROBE, error: error instanceof Error ? error.message : "read_failed", sourceTag: SOURCE_TAG, asOf },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
