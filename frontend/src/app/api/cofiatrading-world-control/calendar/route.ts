import { NextResponse } from "next/server";
import { getCofHost } from "../../../../lib/cof-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HOST = getCofHost();
const UPCOMING_URL =
  process.env.COF_CALENDAR_UPCOMING_URL ?? `${HOST}:8430/api/calendar/upcoming`;

type RawEvent = { t?: number; f?: string; r?: string; k?: string; s?: string };

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(UPCOMING_URL, { cache: "no-store", signal: controller.signal });
    const data = await res.json();
    const rawEvents: RawEvent[] = Array.isArray(data?.events) ? data.events : [];
    const events = rawEvents.slice(0, 30).map((e) => ({
      ts: typeof e.t === "number" ? new Date(e.t * 1000).toISOString() : null,
      from: typeof e.f === "string" ? e.f : null,
      role: typeof e.r === "string" ? e.r : null,
      kind: typeof e.k === "string" ? e.k : null,
      summary: typeof e.s === "string" ? e.s : "",
    }));
    return NextResponse.json(
      {
        ok: Boolean(data?.ok) && res.ok,
        sourceTag: data?.source_tag ?? "CALENDAR_UPCOMING_PROXY",
        busPath: data?.bus_path ?? null,
        totalLines: typeof data?.total_lines === "number" ? data.total_lines : null,
        returned: typeof data?.returned === "number" ? data.returned : events.length,
        freshness: typeof data?.freshness === "string" ? data.freshness : "UNKNOWN",
        ageS: typeof data?.age_s === "number" ? data.age_s : null,
        events,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sourceTag: "CALENDAR_UPCOMING_PROXY",
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        events: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timeout);
  }
}
