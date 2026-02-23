"use client";

import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { H5Header } from "@/components/h5/H5Header";
import { ChatSession, SessionList } from "@/components/h5/SessionList";
import { useH5Auth } from "@/hooks/useH5Auth";

/**
 * H5 Chat session list page.
 *
 * On mobile: full-screen session list.
 * On desktop (md+): left panel in a split-panel layout alongside the chat window.
 *
 * Sessions are derived from the user's agent assignments returned by auth_ok.
 * In a future iteration these can be fetched from /api/v1/h5/auth/me.
 */
export default function H5ChatListPage() {
  const t = useTranslations("h5");
  const router = useRouter();
  const { user, isAuthenticated, logout } = useH5Auth();
  const sessions: ChatSession[] = [];

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/h5/login");
    }
  }, [isAuthenticated, router]);

  // Sessions will be populated from /api/v1/h5/auth/me assignments
  // once M3 endpoints are integrated. Currently empty until assigned.

  const handleLogout = () => {
    logout();
    router.replace("/h5/login");
  };

  if (!isAuthenticated || !user) return null;

  return (
    <div className="flex h-full flex-col">
      <H5Header title={t("sessions.title")} />

      {/* Logout button */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <p className="text-sm text-muted">
          {t("sessions.loggedInAs", { username: user.display_name ?? user.username })}
        </p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1 text-xs text-muted hover:text-strong"
          aria-label={t("sessions.logout")}
        >
          <LogOut className="h-3.5 w-3.5" />
          {t("sessions.logout")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SessionList sessions={sessions} />
      </div>
    </div>
  );
}
