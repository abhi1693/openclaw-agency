"use client";

import { useTranslation } from "@/lib/i18n";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { ChatWindow } from "@/components/h5/ChatWindow";
import { useH5Auth } from "@/hooks/useH5Auth";

/**
 * H5 conversation view.
 *
 * Route: /h5/chat/[sessionId]
 *
 * Query params (used when navigating from the session list):
 *   - agentId: the agent to chat with
 *   - agentName: display name for the agent
 *
 * On mobile this takes up the full screen.
 * On desktop it is shown as the right panel of the split-panel layout.
 */
export default function H5ConversationPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useH5Auth();

  const sessionId = params.sessionId as string;
  const agentId = searchParams.get("agentId") ?? "";
  const agentName = searchParams.get("agentName") ?? t("h5.chat.defaultAgentName");

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/h5/login");
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) return null;

  if (!agentId) {
    // No agentId provided — go back to session list
    router.replace("/h5/chat");
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      <ChatWindow
        agentId={agentId}
        agentName={agentName}
        sessionId={sessionId}
      />
    </div>
  );
}
