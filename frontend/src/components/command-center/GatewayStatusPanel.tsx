"use client";

import { useTranslation } from "@/lib/i18n";

export type GatewayStatusItem = {
  id: string;
  name: string;
  status: string;
  last_heartbeat_at: string | null;
  connection_info?: Record<string, unknown> | null;
};

const GATEWAY_STATUS_COLORS: Record<string, string> = {
  online: "bg-green-100 text-green-800",
  offline: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
  error: "bg-red-100 text-red-800",
};

export function GatewayStatusPanel({
  gateways,
}: {
  gateways: GatewayStatusItem[];
}) {
  const { t } = useTranslation();

  if (gateways.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        {t("commandCenter.noGateways")}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {gateways.map((gw) => {
        const colorClass =
          GATEWAY_STATUS_COLORS[gw.status] ?? "bg-slate-100 text-slate-700";
        const statusLabel =
          t(`commandCenter.status.${gw.status}` as Parameters<typeof t>[0]) ??
          gw.status;

        return (
          <div
            key={gw.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">{gw.name}</p>
                {gw.last_heartbeat_at ? (
                  <p className="mt-1 text-xs text-slate-400">
                    {t("commandCenter.lastSeen")}:{" "}
                    {new Date(gw.last_heartbeat_at).toLocaleString()}
                  </p>
                ) : null}
              </div>
              <span
                className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClass}`}
              >
                {statusLabel}
              </span>
            </div>
            {gw.connection_info &&
            typeof gw.connection_info === "object" &&
            "ip" in gw.connection_info ? (
              <p className="mt-2 text-xs text-slate-500">
                {String(gw.connection_info.ip)}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
