import { NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GOOGLE_360 = "/Users/burakokyay/.openclaw/state/company_os/google_360_snapshot.json";

type GoogleComponent = {
  tool?: string;
  status?: string;
  source?: string;
  summary?: string;
  data_volume?: Record<string, unknown> | null;
  proof_ref?: Record<string, unknown> | null;
  next_action?: string;
};

type Google360 = {
  ok?: boolean;
  source?: string;
  run_utc?: string;
  status?: string;
  account?: { email?: string; domain?: string };
  components?: GoogleComponent[];
};

type Google360Read = {
  data: Google360 | null;
  totalLines: number | null;
  fileMtimeUtc: string | null;
};

const readGoogle360 = async (): Promise<Google360Read> => {
  try {
    const raw = await readFile(GOOGLE_360, "utf8");
    const fileStat = await stat(GOOGLE_360);
    return {
      data: JSON.parse(raw) as Google360,
      totalLines: raw.split(/\r?\n/).length,
      fileMtimeUtc: fileStat.mtime.toISOString(),
    };
  } catch {
    return { data: null, totalLines: null, fileMtimeUtc: null };
  }
};

const ageSeconds = (iso: string | undefined | null): number | null => {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 1000));
};

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * calendar — etat Google Calendar depuis le snapshot Google Workspace local.
 * On ne fabrique pas d'events : si Google retourne 0 events, on affiche 0,
 * mais la maison Calendar peut quand meme vivre comme "read bounded OK".
 */
export async function GET() {
  const googleRead = await readGoogle360();
  const google = googleRead.data;
  const calendar = google?.components?.find((component) => component.tool === "calendar");
  if (!calendar) {
    return NextResponse.json(
      {
        ok: false,
        sourceTag: "CALENDAR_WORKSPACE_SNAPSHOT_MISSING_20260601",
        status: "UNKNOWN",
        gap: `calendar absent de ${GOOGLE_360}`,
        freshness: "SOURCE_MISSING",
        totalLines: googleRead.totalLines,
        fileMtimeUtc: googleRead.fileMtimeUtc,
        events: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const eventsReturned = Number(calendar.data_volume?.events_returned ?? 0);
  const proofAgeSec = numeric(calendar.proof_ref?.age_sec);
  const runAgeSec = ageSeconds(google?.run_utc);
  const staleProofRef = proofAgeSec !== null && proofAgeSec > 86_400;
  const staleRun = runAgeSec !== null && runAgeSec > 600;
  const ok = calendar.status === "LIVE_OK" && !staleProofRef && !staleRun;
  const freshness =
    staleProofRef ? "RUN_OK_PROOF_REF_STALE" :
    staleRun ? "RUN_STALE" :
    ok ? "FRESH" :
    "UNKNOWN";
  const status = ok ? "LIVE" : staleProofRef ? "WATCH_STALE_PROOF_REF" : staleRun ? "WATCH_STALE_RUN" : calendar.status ?? "UNKNOWN";
  return NextResponse.json(
    {
      ok,
      sourceTag: "CALENDAR_GOOGLE_WORKSPACE_360_20260601",
      status,
      account: google?.account ?? null,
      runUtc: google?.run_utc ?? null,
      runAgeSec,
      proofAgeSec,
      freshness,
      totalLines: googleRead.totalLines,
      fileMtimeUtc: googleRead.fileMtimeUtc,
      summary: calendar.summary ?? null,
      eventsReturned: Number.isFinite(eventsReturned) ? eventsReturned : 0,
      emptyState: eventsReturned === 0 ? "NO_EVENTS_RETURNED_BY_BOUNDED_READ" : null,
      proof: {
        source: calendar.source ?? google?.source ?? "GOOGLE_360",
        snapshotPath: GOOGLE_360,
        proofRef: calendar.proof_ref ?? null,
      },
      nextAction: calendar.next_action ?? null,
      events: [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
