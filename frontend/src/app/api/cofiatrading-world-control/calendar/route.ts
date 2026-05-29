import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * calendar — events à venir. Fallback Abidjan :8430/api/calendar/upcoming COUPÉ 20260529.
 * Aucune source non-Abidjan d'events "upcoming" n'existe encore localement → GAP honnête (§35).
 * Parité complète = backend NY (ou source locale Google Calendar) requis. Pas de pipe :8430.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      sourceTag: "CALENDAR_GAP_NO_ABIDJAN_20260529",
      gap: "events à venir : seule source historique = Abidjan :8430 (coupé). Backend NY / Google Calendar local requis pour parité.",
      events: [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
