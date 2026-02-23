import { ChevronLeft, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { cn } from "../lib/utils";
import { WSConnectionStatus } from "../lib/ws-client";

interface H5HeaderProps { title: string; backTo?: string; connectionStatus?: WSConnectionStatus; }

export function H5Header({ title, backTo, connectionStatus }: H5HeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {connectionStatus && connectionStatus !== "connected" && (
        <div className={cn("flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-medium", connectionStatus === "connecting" && "bg-amber-50 text-amber-700", connectionStatus === "reconnecting" && "bg-amber-50 text-amber-700", connectionStatus === "disconnected" && "bg-red-50 text-red-700")}>
          <WifiOff className="h-3 w-3" />
          {connectionStatus === "reconnecting" ? t("status.reconnecting") : t("status.offline")}
        </div>
      )}
      {connectionStatus === "connected" && (
        <div className="flex items-center justify-center gap-1.5 bg-emerald-50 px-4 py-1 text-xs font-medium text-emerald-700">
          <Wifi className="h-3 w-3" />{t("status.connected")}
        </div>
      )}
      <div className="flex h-14 items-center gap-3 px-4">
        {backTo && (
          <Link to={backTo} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200" aria-label={t("header.back")}>
            <ChevronLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="flex-1 truncate text-base font-semibold text-gray-900">{title}</h1>
      </div>
    </header>
  );
}
