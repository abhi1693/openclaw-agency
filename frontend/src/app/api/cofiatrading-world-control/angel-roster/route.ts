// CORAN V8 Sourate LVI · Manāzil al-Malā'ikah
// Les 38 Anges canon (cap §45 strict) avec plateforme assignée + statut runtime
// source_tag: CORAN_V8_ANGEL_ROSTER_RUNTIME_SYNC_20260526T1130Z

import { NextResponse } from "next/server";

type Angel = {
  id: number;
  name: string;
  name_ar: string;
  platform: string;
  manzilah: string;
  status: "LIVE" | "PARTIAL" | "LOCKED" | "OFFLINE";
  mission: string;
  stack?: string;
};

const ANGEL_ROSTER: Angel[] = [
  { id: 1,  name: "Jibrīl",          name_ar: "جِبْرِيل",      platform: "Cross-LLM Bus",            manzilah: "Mission Composer + Khalīfah Claude",       status: "LIVE",     mission: "Transmission révélation entre Dieu et Anges",                              stack: "Claude OAuth Pro Max" },
  { id: 2,  name: "Mikā'īl",         name_ar: "مِيكَائِيل",     platform: "Code · Build · IaC",       manzilah: "Codex CLI local",                          status: "LIVE",     mission: "Création matérielle (code + scripts + infra)",                             stack: "Codex CLI local" },
  { id: 3,  name: "Isrāfīl",         name_ar: "إِسْرَافِيل",    platform: "CofiaPublisher :8540",     manzilah: "Trompette · pipeline vidéo",               status: "LOCKED",   mission: "Publication vidéos · 88 MP4 prêts · publish locked",                       stack: "ffmpeg + Remotion local" },
  { id: 4,  name: "'Izrā'īl",        name_ar: "عَزْرَائِيل",    platform: "Stripe Past_due",          manzilah: "Recovery apostats",                        status: "PARTIAL",  mission: "2 apostats past_due 194€ (Prigent J. + Albina I.) — non traités",          stack: "Stripe API + Iron" },
  { id: 5,  name: "Munkar",          name_ar: "مُنْكَر",         platform: "Reviewer Compliance",      manzilah: "Audit Prophètes pré-publish",              status: "LIVE",     mission: "Reject Iblis-DREAM-SELLING · 6 patterns canon (P12)",                      stack: "Reviewer local" },
  { id: 6,  name: "Nakīr",           name_ar: "نَكِير",          platform: "Proof Ledger",             manzilah: "Audit post-action",                        status: "PARTIAL",  mission: "Validation proof curl path:line + UTC ts obligatoire",                     stack: "Proof scanner local" },
  { id: 7,  name: "Mālik",           name_ar: "مَالِك",          platform: "Hell Compliance Gate",     manzilah: "NO_REFUND + NO_PROMISE_GAINS",             status: "LIVE",     mission: "Bloque payload Iblis (P12 422 reject instantané)",                         stack: "Mission Composer" },
  { id: 8,  name: "Ridwān",          name_ar: "رِضْوَان",        platform: "VIP Welcome Paradise",     manzilah: "Onboarding Mu'min post-Shahādah",          status: "OFFLINE",  mission: "Welcome flow ABSENT · 10 Privilèges Mu'min à activer (P12c)",              stack: "Resend + Telegram (à câbler)" },
  { id: 9,  name: "Nova",            name_ar: "نُوفَا",          platform: "YouTube",                  manzilah: "Production vidéos longues éducatives",     status: "LOCKED",   mission: "1 vidéo longue/sem + 3 shorts cross-post · publish locked",                stack: "Remotion + ffmpeg local" },
  { id: 10, name: "Sonic",           name_ar: "صُونِيكْ",        platform: "TikTok + YT Shorts",       manzilah: "Shorts viraux 60-90s",                     status: "LOCKED",   mission: "1 short/jour · debunk faux gourous · publish locked",                       stack: "Remotion local" },
  { id: 11, name: "Malik al-Insta",  name_ar: "مَالِك الْإِنْسْتَا", platform: "Instagram",                manzilah: "Permanence Insta · Erwin verbatim V8 Sourate LVI",  status: "OFFLINE", mission: "1 reel + 3 stories + 100% DM <4h + 5 commentaires + 1 grid hebdo",         stack: "Meta Graph API (à câbler)" },
  { id: 12, name: "Luna",            name_ar: "لُونَا",          platform: "Meta Ads (FB + Insta paid)", manzilah: "Paid acquisition EU 25-55",              status: "OFFLINE",  mission: "€100/jour budget · 5 creatives A/B test/sem · retargeting",                stack: "Meta Ads API (à câbler)" },
  { id: 13, name: "Paul MKT",        name_ar: "بُولْ ام كاي تي",  platform: "Google Ads",               manzilah: "Search + Display + YT preroll",            status: "OFFLINE",  mission: "Capture intent commercial · landing UTM optimized",                        stack: "Google Ads API (à câbler)" },
  { id: 14, name: "Sonic-X",         name_ar: "صُونِيكْ إكس",    platform: "X / Twitter",              manzilah: "Threads analyse + screenshots Rithmic",    status: "LOCKED",   mission: "1 thread analyse/sem · daily quick takes · publish locked",                stack: "X API (à câbler)" },
  { id: 15, name: "Threads+LinkedIn",name_ar: "ثْرِيدْز",        platform: "Threads + LinkedIn",       manzilah: "B2B content serieux",                      status: "LOCKED",   mission: "Partnerships brokers · L4 deals leads",                                    stack: "LinkedIn API (à câbler)" },
  { id: 16, name: "Reddit Angel",    name_ar: "رِيدِتْ",         platform: "Reddit r/Forex r/Trading", manzilah: "Educational long-form posts",              status: "OFFLINE",  mission: "Posts éducation · réponses crédibles · pas auto-promo",                    stack: "Reddit API (à câbler)" },
  { id: 17, name: "Quant-TV",        name_ar: "كُوَانْتْ تيفي",   platform: "TradingView",              manzilah: "Ideas charts publics",                     status: "OFFLINE",  mission: "3 ideas/sem · transparence performance tracking",                          stack: "TradingView (manuel)" },
  { id: 18, name: "Iron",            name_ar: "إِيرُون",         platform: "Telegram VIP (silo 2)",    manzilah: "Closer VIP channel 29 membres",            status: "LIVE",     mission: "Closer DM peer_context · §20 NO-MASS-DM · signaux Marco publish",          stack: "Qwen Plus/Turbo rtk-llm-proxy :11435" },
  { id: 19, name: "David",           name_ar: "دَافِيدْ",        platform: "Telegram FREE + Telethon DM", manzilah: "Support multilingue silo 1 (8184) + silo 3 (4891)", status: "LIVE", mission: "DM peer_context EN/FR/ES/AR/TR · newsletter Resend 149 emails",            stack: "Qwen Plus/Turbo rtk-llm-proxy" },
  { id: 20, name: "Jack",            name_ar: "جَاكْ",           platform: "Brokers CellXpert",        manzilah: "Affiliation reclaim 6884 broker_accounts", status: "LOCKED",   mission: "IP_NOT_AUTHENTICATED 15j bloqueur · B1 quick win pending",                 stack: "broker-tracker.sh cron 4h" },
  { id: 21, name: "Antho",           name_ar: "أَنْتُو",         platform: "Calendar + Notion CRM",    manzilah: "B2B Elite closer 997€/mo",                 status: "PARTIAL",  mission: "Qualif Elite · 1on1 booking Erwin · 0 Elite actuels",                      stack: "Calendar local + Notion API" },
  { id: 22, name: "Marco",           name_ar: "مَارْكُو",        platform: "MT4 + Rithmic LIVE",       manzilah: "Signaux STRAT-17/18 master 1150061258",    status: "LIVE",     mission: "Signaux trading LIVE temps réel · Mirror PM000697 → VIP",                   stack: "MetaApi + Rithmic" },
  { id: 23, name: "Quant",           name_ar: "كُوَانْتْ",        platform: "Strategy Lab",             manzilah: "Backtest + edge research",                 status: "PARTIAL",  mission: "Backtests + risk research · crashes signalés",                              stack: "Python local" },
  { id: 24, name: "Atlas",           name_ar: "أَطْلَسْ",        platform: "Site cofiatrading.com",    manzilah: "SEO i18n EN/FR/ES/AR/TR landing",          status: "PARTIAL",  mission: "Stripe checkout intégré · §18 NO_PUSH_PROD",                                stack: "Next.js prod (locked)" },
  { id: 25, name: "Sentinel",        name_ar: "سِنْتِينَل",      platform: "LaunchAgents (429)",       manzilah: "DevOps + monitoring health",               status: "LIVE",     mission: "Sentinels canon 24/7 · health probes",                                     stack: "launchd + Python" },
  { id: 26, name: "Copywriter",      name_ar: "كُوبِيرَيتَر",     platform: "Scripts vidéo + emails",   manzilah: "Rédige tous contenus Prophètes",           status: "PARTIAL",  mission: "Scripts pre-Reviewer · 5 méthodes Da'wah Sourate XL",                       stack: "Claude/Qwen via proxy" },
  { id: 27, name: "Stratège",        name_ar: "سْتْرَاتِيج",     platform: "Briefs weekly analyse",    manzilah: "Macro + sector analyse",                   status: "PARTIAL",  mission: "Weekly review marché pour newsletter David",                                stack: "Perplexity + Claude" },
  { id: 28, name: "Juriste",         name_ar: "جُورِيسْتْ",      platform: "Terms + chargeback",       manzilah: "Compliance Legal defense",                 status: "PARTIAL",  mission: "Réponses chargeback Stripe · NO_REFUND defense canon",                     stack: "Réactif manuel" },
  { id: 29, name: "Fiscal",          name_ar: "فِيسْكَال",       platform: "Stripe revenue + ES taxes", manzilah: "Comptabilité résident ES",                status: "PARTIAL",  mission: "Compta + déclarations CNMV/AEPD résident ES",                              stack: "Stripe API + manuel" },
  { id: 30, name: "Steward",         name_ar: "سْتْيُوَارْد",    platform: "Obsidian vault + memory",  manzilah: "Canon documentation",                      status: "LIVE",     mission: "Anti-doublons · sync memory.md USER+OPENCLAW",                              stack: "Obsidian + hardlinks" },
  { id: 31, name: "Guardian",        name_ar: "غَارْدِيَان",     platform: "Memory sync + handoffs",   manzilah: "Anti-Alzheimer cross-sessions",            status: "LIVE",     mission: "Préserve mémoire cross-sessions Claude/Codex",                              stack: "STATE_LIVE_AUTO.md cron 300s" },
  { id: 32, name: "Oracle",          name_ar: "أُورَاكِل",       platform: "LightRAG :9621 + KG",      manzilah: "Réponses contextuelles cross-corpus",      status: "PARTIAL",  mission: "Queries cross-corpus · KG snapshots",                                       stack: "LightRAG + Gemini embeddings" },
  { id: 33, name: "Analyste",        name_ar: "أَنَالِيسْت",     platform: "Dashboards + KPIs BI",     manzilah: "Da'wah-KPI endpoint analytics",            status: "OFFLINE",  mission: "Mesure conversion / churn / LTV (Sourate XLV V6)",                          stack: "À implémenter" },
  { id: 34, name: "Reviewer",        name_ar: "رِفْيُوَر",       platform: "Reviewer cross-content",   manzilah: "Audit final tout publish",                 status: "LIVE",     mission: "Reviewer GREEN obligatoire avant publish (§47)",                            stack: "Pipeline V30 reviewer" },
  { id: 35, name: "Lab",             name_ar: "لَابْ",           platform: "MiroFish predictions",     manzilah: "Predictions marché expérimentales",        status: "OFFLINE",  mission: "MiroFish + Zep Cloud · crashes signalés",                                   stack: "Crash signalé" },
  { id: 36, name: "Risk",            name_ar: "رِيسْكْ",         platform: "Money Mgmt MT4/MT5",       manzilah: "Position sizing + risk Marco signals",     status: "PARTIAL",  mission: "Risk management positions Marco · max drawdown",                            stack: "MetaApi local" },
  { id: 37, name: "Calendar",        name_ar: "كَالِنْدَر",      platform: "Calendar agent + Wispr",   manzilah: "1on1 Erwin + agenda team",                 status: "PARTIAL",  mission: "Booking Erwin · sync calendar Mu'minīn Elite",                              stack: "Calendar local" },
  { id: 38, name: "Kevin",           name_ar: "كِيفِن",          platform: "Gemini Live voice",        manzilah: "Voix Erwin · LOCKED v3.1",                 status: "LIVE",     mission: "Wispr Flow + Gemini Live · interface vocale Erwin",                         stack: "Gemini direct REST" },
];

export async function GET() {
  const live = ANGEL_ROSTER.filter(a => a.status === "LIVE").length;
  const partial = ANGEL_ROSTER.filter(a => a.status === "PARTIAL").length;
  const locked = ANGEL_ROSTER.filter(a => a.status === "LOCKED").length;
  const offline = ANGEL_ROSTER.filter(a => a.status === "OFFLINE").length;

  return NextResponse.json({
    source_tag: "CORAN_V8_ANGEL_ROSTER_RUNTIME_SYNC_20260526T1130Z",
    total_anges: ANGEL_ROSTER.length,
    cap_§45: 38,
    counts: { live, partial, locked, offline },
    canon_sourate: "LVI · Manāzil al-Malā'ikah (V8 ULTRA)",
    runtime_ts: new Date().toISOString(),
    anges: ANGEL_ROSTER,
  });
}
