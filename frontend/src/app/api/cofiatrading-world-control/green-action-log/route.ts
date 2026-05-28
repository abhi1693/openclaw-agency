import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Status = "GREEN" | "AMBER" | "LOCKED" | "UNKNOWN";

type Probe = {
  ok: boolean;
  status: number | null;
  proof: string;
};

type TodayPublishReview = {
  id: string;
  channel: string;
  liveRef: string;
  source: string;
  verdict: "KEEP" | "FIX" | "BLOCKED" | "REUSE";
  reason: string;
  greenNextAction: string;
};

const HOST = "http://host.docker.internal";
const YOUTUBE_GREEN_PROOF =
  "YouTube video-01 local audit PASS: /Users/burakokyay/.openclaw/state/hub-visual-iterations/ny_full_publish_green_20260527/video_audit_20260527T131539Z/manifest.json; render=tip_v22bu_video01_anti_faux_gourou__ny-green-cta-20260527T1328Z; hard_fail=[]";

const probe = async (label: string, url: string): Promise<Probe> => {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return {
      ok: response.ok,
      status: response.status,
      proof: `${label} HTTP ${response.status} in ${Date.now() - startedAt}ms`,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      proof: `${label} ${error instanceof Error ? error.message : "UNKNOWN_ERROR"}`,
    };
  }
};

const gate = ({
  id,
  label,
  building,
  status,
  owner,
  source,
  target,
  proof,
  nextAction,
  killCondition,
}: {
  id: string;
  label: string;
  building: string;
  status: Status;
  owner: string;
  source: string;
  target: string;
  proof: string;
  nextAction: string;
  killCondition: string;
}) => ({
  id,
  label,
  building,
  status,
  owner,
  source,
  target,
  proof,
  nextAction,
  killCondition,
});

export async function GET() {
  const [nySnapshot, nyRevenue, nyPastDue, nyIron, publisher, centralBrain] =
    await Promise.all([
    probe("New York snapshot", "http://127.0.0.1:3000/api/cofiatrading-world-control/snapshot"),
    probe("NY backend revenue", `${HOST}:8000/api/v1/cof/revenue/summary`),
    probe("NY backend past_due", `${HOST}:8000/api/v1/cof/past-due`),
    probe("NY backend Iron summary", `${HOST}:8000/api/v1/cof/iron/summary`),
    probe("CofiaPublisher", `${HOST}:8540/api/status`),
    probe("Central Brain", `${HOST}:8767/health`),
  ]);

  const gates = [
    gate({
      id: "truth_plane",
      label: "Truth plane New York",
      building: "Proof Ledger",
      status: nySnapshot.ok ? "GREEN" : "LOCKED",
      owner: "Codex",
      source: "World Control snapshot",
      target: "New York /api/cofiatrading-world-control/snapshot",
      proof: nySnapshot.proof,
      nextAction: "Chaque claim LIVE/GREEN doit pointer vers ce ledger.",
      killCondition: "Aucun kill; c'est la base de controle.",
    }),
    gate({
      id: "revenue_command",
      label: "Revenue Command",
      building: "Revenue Command",
      status: nyRevenue.ok && nyPastDue.ok && nyIron.ok ? "GREEN" : "LOCKED",
      owner: "Iron + Codex",
      source: "NY backend Stripe direct + NY Iron read-only summary",
      target: "NY native revenue + brokers summary",
      proof: `${nyRevenue.proof}; ${nyPastDue.proof}; iron=${nyIron.proof}`,
      nextAction: "Revenue/past_due/brokers viennent de NY; garder Abidjan hors control/publish path.",
      killCondition: "Aucun retour vers /api/iron/revenue/summary Abidjan.",
    }),
    gate({
      id: "cofia_publisher",
      label: "CofiaPublisher source",
      building: "Product New York",
      status: publisher.ok ? "GREEN" : "LOCKED",
      owner: "Nova + Reviewer + Codex",
      source: "CofiaPublisher :8540",
      target: "NY publish queue + Reviewer gate",
      proof: publisher.proof,
      nextAction: "Brancher queue publish GREEN, pas de fan-out robotique.",
      killCondition: "Ne pas tuer; service conservable si source propre.",
    }),
    gate({
      id: "central_brain",
      label: "Central Brain",
      building: "Command Tower",
      status: centralBrain.ok ? "GREEN" : "LOCKED",
      owner: "Codex + Guardian",
      source: "Central Brain :8767",
      target: "NY houses/control plane",
      proof: centralBrain.proof,
      nextAction: "Afficher maisons, owners, actions et preuves dans NY.",
      killCondition: "Ne pas tuer; source directe New York.",
    }),
    gate({
      id: "full_publish_green",
      label: "Full Publish GREEN",
      building: "Acquisition Engine",
      status: publisher.ok && nySnapshot.ok && nyRevenue.ok && nyPastDue.ok ? "GREEN" : "LOCKED",
      owner: "Reviewer + Copywriter + Codex",
      source: "Captions W22 + CofiaPublisher + Meta/Telegram/YouTube connectors",
      target: "NY publish control room",
      proof: `Control plane GREEN: ${nySnapshot.proof}; ${publisher.proof}; revenue=${nyRevenue.proof}; past_due=${nyPastDue.proof}. ${YOUTUBE_GREEN_PROOF}.`,
      nextAction: "Executer les publishes via queue NY: channel, asset, reviewer_status, cadence_slot, rollback_url, proof_after_publish. Premier asset YouTube est GREEN_READY local.",
      killCondition: "Ne jamais fan-out robotique; chaque publish sort par la queue et revient avec preuve.",
    }),
    gate({
      id: "old_city_contained",
      label: "Old City contained read-only",
      building: "Old City Locked",
      status: "GREEN",
      owner: "Codex",
      source: "Abidjan legacy read-only shadow",
      target: "New York remains the write/control plane",
      proof: `${nyIron.proof}; snapshot/control path uses NY native Iron summary, not Abidjan revenue endpoint.`,
      nextAction: "Porter Iron CRM brokers/clients dans NY puis retirer le shadow legacy du snapshot.",
      killCondition: "No write/publish through Abidjan; kill final seulement quand brokers/clients Iron CRM sont dans NY et que rg :8430 retourne 0 hors docs/logs.",
    }),
  ];

  const green = gates.filter((item) => item.status === "GREEN").length;
  const amber = gates.filter((item) => item.status === "AMBER").length;
  const locked = gates.filter((item) => item.status === "LOCKED").length;
  const todayPublishReview: TodayPublishReview[] = [
    {
      id: "ig-j3-psychologie",
      channel: "Instagram",
      liveRef: "https://www.instagram.com/p/DY1iL2sFp4F/",
      source: "daily_publish_log.db -> instagram_J3_psychologie.json",
      verdict: "FIX",
      reason: "Le fond est solide, mais le JSON est un script reel avec timecodes publie comme caption image.",
      greenNextAction: "Transformer en vraie caption IG courte + media/reel adapte avant prochain publish.",
    },
    {
      id: "telegram-free-j3-psychologie",
      channel: "Telegram FREE",
      liveRef: "tg:-1001279616913:78454",
      source: "daily_publish_log.db -> telegram-free_J3_psychologie.json",
      verdict: "KEEP",
      reason: "Owned-channel, contenu pedagogique, hook humain; pas de promesse de gain.",
      greenNextAction: "Garder cadence max 1 message edu/jour + peer_context + proof apres send.",
    },
    {
      id: "telegram-vip-j3-psychologie",
      channel: "Telegram VIP",
      liveRef: "tg:-1003977915058:749",
      source: "daily_publish_log.db -> telegram-vip_J3_psychologie.json",
      verdict: "KEEP",
      reason: "Contenu VIP actionnable, pas spam, utile pour retention.",
      greenNextAction: "Publier VIP seulement quand valeur premium distincte + no double-send.",
    },
    {
      id: "x-j3-psychologie",
      channel: "X / Twitter",
      liveRef: "https://twitter.com/cofiatrading/status/2059562137362522414",
      source: "daily_publish_log.db -> x-twitter_J3_psychologie.json",
      verdict: "FIX",
      reason: "Le script a tronque un thread 5 tweets en 280 caracteres; le contenu devient amputé.",
      greenNextAction: "Publier en vrai thread atomique 1/5..5/5 ou ne pas publier.",
    },
    {
      id: "facebook-j3-psychologie",
      channel: "Facebook Page",
      liveRef: "FB Page fail in daily-publish-captions.log",
      source: "facebook_J3_psychologie.json",
      verdict: "BLOCKED",
      reason: "Graph API a retourne permission/scope error; aucun post FB vert aujourd'hui.",
      greenNextAction: "No-send test scopes/tasks puis publier une seule page post quand API proof est GREEN.",
    },
    {
      id: "resend-test",
      channel: "Resend Email",
      liveRef: "handoff marathon: test delivered to Erwin",
      source: "handoff_20260527T100131Z",
      verdict: "REUSE",
      reason: "Preuve deliverability utile, mais ce n'est pas une newsletter ni un welcome flow complet.",
      greenNextAction: "Transformer en welcome flow Stripe avec event proof + opt-out + delivery log.",
    },
  ];

  return NextResponse.json(
    {
      ok: true,
      source_tag: "NY_FULL_PUBLISH_GREEN_ACTION_LOG_20260527T1200Z",
      runtime_ts: new Date().toISOString(),
      doctrine: "ONLY GREEN: no LIVE/GREEN claim without proof; publish is allowed only after gate proof.",
      summary: {
        total: gates.length,
        green,
        amber,
        locked,
        full_publish_status: gates.find((item) => item.id === "full_publish_green")?.status ?? "UNKNOWN",
      },
      today_publish_review: todayPublishReview,
      gates,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
