"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";

import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";

import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";
import { useAuthedQuery } from "@/lib/api-query";

type Gateway = {
  id: string;
  name: string;
  url: string;
  token?: string | null;
  main_session_key: string;
  workspace_root: string;
  skyll_enabled?: boolean;
  created_at: string;
  updated_at: string;
};

type Agent = {
  id: string;
  name: string;
  status: string;
  board_id?: string | null;
  last_seen_at?: string | null;
  updated_at: string;
  is_board_lead?: boolean;
};

type GatewayStatus = {
  connected: boolean;
  gateway_url: string;
  sessions_count?: number;
  error?: string;
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(`${value}${value.endsWith("Z") ? "" : "Z"}`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const maskToken = (value?: string | null) => {
  if (!value) return "—";
  if (value.length <= 8) return "••••";
  return `••••${value.slice(-4)}`;
};

export default function GatewayDetailPage() {
  const router = useRouter();
  const params = useParams();
  const gatewayIdParam = params?.gatewayId;
  const gatewayId = Array.isArray(gatewayIdParam)
    ? gatewayIdParam[0]
    : gatewayIdParam;

  const gatewayQuery = useAuthedQuery<Gateway>(
    ["gateway", gatewayId ?? "unknown"],
    gatewayId ? `/api/v1/gateways/${gatewayId}` : null,
    { refetchInterval: 30_000 }
  );

  const gateway = gatewayQuery.data ?? null;

  const agentsQuery = useAuthedQuery<Agent[]>(
    ["gateway-agents", gatewayId ?? "unknown"],
    gatewayId ? `/api/v1/agents?gateway_id=${gatewayId}` : null,
    { refetchInterval: 15_000 }
  );

  const statusPath = gateway
    ? (() => {
        const params = new URLSearchParams({ gateway_url: gateway.url });
        if (gateway.token) {
          params.set("gateway_token", gateway.token);
        }
        if (gateway.main_session_key) {
          params.set("gateway_main_session_key", gateway.main_session_key);
        }
        return `/api/v1/gateways/status?${params.toString()}`;
      })()
    : null;

  const statusQuery = useAuthedQuery<GatewayStatus>(
    ["gateway-status", gatewayId ?? "unknown"],
    statusPath,
    { refetchInterval: 15_000, enabled: Boolean(statusPath) }
  );

  const agents = agentsQuery.data ?? [];
  const isConnected = statusQuery.data?.connected ?? false;

  const title = useMemo(
    () => (gateway?.name ? gateway.name : "Gateway"),
    [gateway?.name]
  );

  return (
    <DashboardShell>
      <SignedOut>
        <div className="col-span-2 flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-50 p-10 text-center">
          <div className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
            <p className="text-sm text-slate-600">Sign in to view a gateway.</p>
            <SignInButton mode="modal" forceRedirectUrl={`/gateways/${gatewayId}`}>
              <Button className="mt-4">Sign in</Button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-8 py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="font-heading text-2xl font-semibold text-slate-900 tracking-tight">
                  {title}
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Gateway configuration and connection details.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push("/gateways")}
                >
                  Back to gateways
                </Button>
                {gatewayId ? (
                  <Button onClick={() => router.push(`/gateways/${gatewayId}/edit`)}>
                    Edit gateway
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="p-8">
            {gatewayQuery.isLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                Loading gateway…
              </div>
            ) : gatewayQuery.error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
                {gatewayQuery.error.message}
              </div>
            ) : gateway ? (
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Connection
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            statusQuery.isLoading
                              ? "bg-slate-300"
                              : isConnected
                                ? "bg-emerald-500"
                                : "bg-rose-500"
                          }`}
                        />
                        <span>
                          {statusQuery.isLoading
                            ? "Checking"
                            : isConnected
                              ? "Online"
                              : "Offline"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3 text-sm text-slate-700">
                      <div>
                        <p className="text-xs uppercase text-slate-400">Gateway URL</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {gateway.url}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-400">Token</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {maskToken(gateway.token)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-400">Skyll</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {gateway.skyll_enabled ? "Enabled" : "Not installed"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Runtime
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-slate-700">
                      <div>
                        <p className="text-xs uppercase text-slate-400">
                          Main session key
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {gateway.main_session_key}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-400">Workspace root</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {gateway.workspace_root}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase text-slate-400">Created</p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {formatTimestamp(gateway.created_at)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-slate-400">Updated</p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {formatTimestamp(gateway.updated_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Agents
                    </p>
                    {agentsQuery.isLoading ? (
                      <span className="text-xs text-slate-500">Loading…</span>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {agents.length} total
                      </span>
                    )}
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3">Agent</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Last seen</th>
                          <th className="px-4 py-3">Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {agents.length === 0 && !agentsQuery.isLoading ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-4 py-6 text-center text-xs text-slate-500"
                            >
                              No agents assigned to this gateway.
                            </td>
                          </tr>
                        ) : (
                          agents.map((agent) => (
                            <tr key={agent.id} className="hover:bg-slate-50">
                              <td className="px-4 py-3">
                                <p className="text-sm font-medium text-slate-900">
                                  {agent.name}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {agent.id}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-700">
                                {agent.status}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500">
                                {formatTimestamp(agent.last_seen_at ?? null)}
                              </td>
                              <td className="px-4 py-3 text-xs text-slate-500">
                                {formatTimestamp(agent.updated_at)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </SignedIn>
    </DashboardShell>
  );
}
