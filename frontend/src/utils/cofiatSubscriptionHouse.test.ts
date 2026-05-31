/* Tests dispatch abonnement → maison (vrais noms d'abonnements COFIAT). */
import { describe, it, expect } from "vitest";
import { classifySubscriptionHouse } from "./cofiatSubscriptionHouse";

describe("classifySubscriptionHouse", () => {
  const cases: Array<[string, string]> = [
    ["Apex Trader Funding (Combat Account)", "mt4_signal_tower"],
    ["Databento Standard GLBX.MDP3", "mt4_signal_tower"],
    ["TradingView Premium", "mt4_signal_tower"], // "premium" NE doit PAS l'envoyer en revenue
    ["Bookmap (lifetime license $2000)", "mt4_signal_tower"],
    ["ATAS X", "mt4_signal_tower"],
    ["Anthropic Claude Pro Max (20×)", "central_brain"],
    ["OpenRouter", "central_brain"],
    ["Perplexity Pro", "central_brain"],
    ["OpenAI Codex CLI", "central_brain"],
    ["Adobe Creative Cloud (suite complète)", "assets_warehouse"],
    ["Canva Pro", "assets_warehouse"],
    ["Figma Desktop", "assets_warehouse"],
    ["ElevenLabs Pro", "assets_warehouse"],
    ["HeyGen Creator", "youtube_studio"],
    ["Remotion", "youtube_studio"],
    ["CapCut Pro", "youtube_studio"],
    ["TikTok LIVE Studio", "youtube_studio"], // "live" → vidéo, PAS social
    ["YouTube", "youtube_studio"],
    ["Notion Plus", "obsidian_library"],
    ["Obsidian Max (Sync + Publish + Catalyst Insider)", "obsidian_library"],
    ["Google Workspace Business Standard", "obsidian_library"],
    ["iCloud+ (Apple)", "obsidian_library"],
    ["Linear Plus", "paperclip_factory"],
    ["Linear Desktop", "paperclip_factory"],
    ["GitHub Pro", "site_seo_lab"],
    ["Vercel Pro", "site_seo_lab"],
    ["Supabase Pro", "site_seo_lab"],
    ["Cloudflare", "site_seo_lab"],
    ["Sentry Team", "site_seo_lab"],
    ["Domaine cofiatrading.com", "site_seo_lab"],
    ["Docker (Docker Desktop / Hub)", "openclaw_agent_barracks"],
    ["Warp Terminal", "openclaw_agent_barracks"],
    ["n8n Cloud Pro", "openclaw_agent_barracks"],
    ["OpenClaw (framework local)", "openclaw_agent_barracks"],
    ["Telegram Premium", "vip_gate"], // social, PAS revenue
    ["Twitter / X Premium Pro (Verified Organizations)", "vip_gate"],
    ["Instagram (Meta Graph API)", "vip_gate"],
    ["Meta Ads (Facebook + Instagram)", "vip_gate"],
    ["VIP (€97/mois)", "iron_office"],
    ["PREMIUM (€297/mois pivot prévu)", "iron_office"], // tier revenue → fallback revenue
    ["ELITE (€997/mois pivot prévu)", "iron_office"],
    ["Resend", "iron_office"],
  ];

  it.each(cases)("classe %s → %s", (name, expected) => {
    expect(classifySubscriptionHouse(name)).toBe(expected);
  });

  it("défaut = iron_office pour un nom non classé", () => {
    expect(classifySubscriptionHouse("Truc Inconnu XYZ")).toBe("iron_office");
  });
});
