import { LogOut } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { H5Header } from "../components/H5Header";
import { ChatSession, SessionList } from "../components/SessionList";
import { useH5Auth } from "../hooks/useH5Auth";

export default function SessionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useH5Auth();
  const sessions: ChatSession[] = [];

  useEffect(() => { if (!isAuthenticated) void navigate("/login", { replace: true }); }, [isAuthenticated, navigate]);

  const handleLogout = () => { logout(); void navigate("/login", { replace: true }); };

  if (!isAuthenticated || !user) return null;

  return (
    <div className="flex h-full flex-col">
      <H5Header title={t("sessions.title")} />
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <p className="text-sm text-gray-500">{t("sessions.loggedInAs", { username: user.display_name ?? user.username })}</p>
        <button onClick={handleLogout} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 active:text-gray-900" aria-label={t("sessions.logout")}>
          <LogOut className="h-3.5 w-3.5" />{t("sessions.logout")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto"><SessionList sessions={sessions} /></div>
    </div>
  );
}
