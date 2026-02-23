"use client";

import { ChevronLeft, Wifi, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { WSConnectionStatus } from "@/lib/ws-client";

interface H5HeaderProps {
  title: string;
  backHref?: string;
  connectionStatus?: WSConnectionStatus;
}

export function H5Header({
  title,
  backHref,
  connectionStatus,
}: H5HeaderProps) {
  const t = useTranslations("h5");

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-app">
      {connectionStatus && connectionStatus !== "connected" && (
        <div
          className={cn(
            "flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-medium",
            connectionStatus === "connecting" && "bg-amber-50 text-amber-700",
            connectionStatus === "reconnecting" &&
              "bg-amber-50 text-amber-700",
            connectionStatus === "disconnected" && "bg-red-50 text-red-700",
          )}
        >
          <WifiOff className="h-3 w-3" />
          {connectionStatus === "reconnecting"
            ? t("status.reconnecting")
            : t("status.offline")}
        </div>
      )}
      {connectionStatus === "connected" && (
        <div className="flex items-center justify-center gap-1.5 bg-emerald-50 px-4 py-1 text-xs font-medium text-emerald-700">
          <Wifi className="h-3 w-3" />
          {t("status.connected")}
        </div>
      )}
      <div className="flex h-14 items-center gap-3 px-4">
        {backHref && (
          <Link
            href={backHref}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-raised hover:text-strong"
            aria-label={t("header.back")}
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="flex-1 truncate text-base font-semibold text-strong">
          {title}
        </h1>
      </div>
    </header>
  );
}
