import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChatWindow } from "../components/ChatWindow";
import { useH5Auth } from "../hooks/useH5Auth";

export default function ChatPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useH5Auth();
  const agentId = searchParams.get("agentId") ?? "";
  const agentName = searchParams.get("agentName") ?? t("chat.defaultAgentName");

  useEffect(() => { if (!isAuthenticated) void navigate("/login", { replace: true }); }, [isAuthenticated, navigate]);
  useEffect(() => { if (isAuthenticated && !agentId) void navigate("/sessions", { replace: true }); }, [isAuthenticated, agentId, navigate]);

  if (!isAuthenticated || !agentId) return null;

  return (
    <div className="flex h-full flex-col">
      <ChatWindow agentId={agentId} agentName={agentName} sessionId={sessionId} />
    </div>
  );
}
