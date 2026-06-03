import { NextResponse } from "next/server";

import { SOURCE_TAG, asString, sanitizeText } from "./_lib/schema";
import { type ParsedRequest } from "./_lib/runtime";
import { parseRequest } from "./_lib/packetWriters";
import {
  recordAgentReply,
  proxyConversationVoice,
  proxyConversationPhoto,
  approvePacket,
  rejectPacket,
} from "./_lib/actions";
import { proxyConversationSend, ingestCommand, markTakeover } from "./_lib/conversation";
import { submitConsolePacket, handleConsoleGet } from "./_lib/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Couche route mince : aiguillage des requêtes + délégation. Toute la logique métier
// vit dans ./_lib/* (runtime, fsUtils, packetWriters, threads, conversation, crm, actions, handlers).
export async function POST(request: Request) {
  let parsed: ParsedRequest;
  try {
    parsed = await parseRequest(request);
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_PACKET_BODY", sourceTag: SOURCE_TAG }, { status: 400 });
  }

  const body = parsed.body;
  const action = sanitizeText(asString(body.action), 80);

  // ── Aiguillage des actions ──────────────────────────────────────────────────
  if (action === "agent_reply") return recordAgentReply(body);
  if (action === "conversation_send") return proxyConversationSend(body);
  if (action === "ingest_command") return ingestCommand(body);
  if (action === "conversation_send_voice") return proxyConversationVoice(body);
  if (action === "conversation_send_photo") return proxyConversationPhoto(body);
  if (action === "approve_packet") return approvePacket(body);
  if (action === "reject_packet") return rejectPacket(body);
  if (action === "set_takeover") {
    const uid = sanitizeText(asString(body.uid), 40);
    if (!uid) return NextResponse.json({ ok: false, error: "MISSING_UID", sourceTag: SOURCE_TAG }, { status: 400 });
    const on = body.on !== false; // défaut true
    await markTakeover(uid, on);
    return NextResponse.json({ ok: true, uid, takeover: on, sourceTag: SOURCE_TAG });
  }

  // ── Défaut : soumission d'un packet (validation de sécurité + construction) ──
  return submitConsolePacket(parsed);
}

export async function GET(request: Request) {
  return handleConsoleGet(request);
}
