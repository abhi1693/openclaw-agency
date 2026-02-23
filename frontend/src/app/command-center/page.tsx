"use client";

export const dynamic = "force-dynamic";

import { useAuth } from "@/auth/clerk";
import { useQuery } from "@tanstack/react-query";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import {
  CommandCenterKPIs,
  type CommandCenterOverview,
} from "@/components/command-center/CommandCenterKPIs";
import {
  AgentStatusGrid,
  type AgentStatusItem,
} from "@/components/command-center/AgentStatusGrid";
import {
  AgentCommunicationGraph,
  type GraphNode,
  type GraphEdge,
} from "@/components/command-center/AgentCommunicationGraph";
import {
  ResourceAllocationChart,
  type ResourceAllocationItem,
} from "@/components/command-center/ResourceAllocationChart";
import {
  LiveActivityStream,
  type LiveActivityEvent,
} from "@/components/command-center/LiveActivityStream";

import { customFetch } from "@/api/mutator";
import { useTranslation } from "@/lib/i18n";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

const POLL_INTERVAL = 3_000;

async function fetchOverview(): Promise<CommandCenterOverview> {
  const res = await customFetch<{ data: CommandCenterOverview }>(
    "/api/v1/command-center/overview",
    { method: "GET" },
  );
  return res.data;
}

async function fetchAgentStatus(): Promise<AgentStatusItem[]> {
  const res = await customFetch<{ data: { agents: AgentStatusItem[] } }>(
    "/api/v1/command-center/agent-status",
    { method: "GET" },
  );
  return res.data?.agents ?? [];
}

async function fetchCommunicationGraph(): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
}> {
  const res = await customFetch<{
    data: { nodes: GraphNode[]; edges: GraphEdge[] };
  }>("/api/v1/command-center/communication-graph", { method: "GET" });
  return res.data ?? { nodes: [], edges: [] };
}

async function fetchResourceAllocation(): Promise<ResourceAllocationItem[]> {
  const res = await customFetch<{
    data: { per_agent: ResourceAllocationItem[] };
  }>("/api/v1/command-center/resource-allocation", { method: "GET" });
  return res.data?.per_agent ?? [];
}

async function fetchLiveActivity(): Promise<LiveActivityEvent[]> {
  const res = await customFetch<{
    data: { events: LiveActivityEvent[] };
  }>("/api/v1/command-center/live-activity?limit=30", { method: "GET" });
  return res.data?.events ?? [];
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-heading text-base font-semibold text-slate-900">
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function CommandCenterPage() {
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const enabled = Boolean(isSignedIn && isAdmin);

  const overviewQuery = useQuery({
    queryKey: ["cc-overview"],
    queryFn: fetchOverview,
    enabled,
    refetchInterval: POLL_INTERVAL,
    refetchOnMount: "always",
  });

  const agentStatusQuery = useQuery({
    queryKey: ["cc-agent-status"],
    queryFn: fetchAgentStatus,
    enabled,
    refetchInterval: POLL_INTERVAL,
    refetchOnMount: "always",
  });

  const graphQuery = useQuery({
    queryKey: ["cc-comm-graph"],
    queryFn: fetchCommunicationGraph,
    enabled,
    refetchInterval: 15_000,
    refetchOnMount: "always",
  });

  const allocationQuery = useQuery({
    queryKey: ["cc-resource-alloc"],
    queryFn: fetchResourceAllocation,
    enabled,
    refetchInterval: POLL_INTERVAL,
    refetchOnMount: "always",
  });

  const activityQuery = useQuery({
    queryKey: ["cc-live-activity"],
    queryFn: fetchLiveActivity,
    enabled,
    refetchInterval: POLL_INTERVAL,
    refetchOnMount: "always",
  });

  const overview = overviewQuery.data ?? null;
  const agents = agentStatusQuery.data ?? [];
  const graph = graphQuery.data ?? { nodes: [], edges: [] };
  const allocation = allocationQuery.data ?? [];
  const activity = activityQuery.data ?? [];

  return (
    <DashboardPageLayout
      signedOut={{
        message: t("commandCenter.signInPrompt"),
        forceRedirectUrl: "/command-center",
        signUpForceRedirectUrl: "/command-center",
      }}
      title={t("commandCenter.title")}
      description={t("commandCenter.description")}
      isAdmin={isAdmin}
      adminOnlyMessage={t("commandCenter.adminOnly")}
      stickyHeader
    >
      <div className="space-y-6">
        {/* KPIs */}
        {overview ? (
          <CommandCenterKPIs overview={overview} />
        ) : overviewQuery.isLoading ? (
          <div className="text-sm text-slate-500">{t("commandCenter.loading")}</div>
        ) : null}

        {/* Agent Status */}
        <SectionCard title={t("commandCenter.agentStatus")}>
          <AgentStatusGrid agents={agents} />
        </SectionCard>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Communication Graph */}
          <SectionCard title={t("commandCenter.communicationGraph")}>
            <AgentCommunicationGraph
              nodes={graph.nodes}
              edges={graph.edges}
            />
          </SectionCard>

          {/* Resource Allocation */}
          <SectionCard title={t("commandCenter.resourceAllocation")}>
            <ResourceAllocationChart data={allocation} />
          </SectionCard>
        </div>

        {/* Live Activity */}
        <SectionCard title={t("commandCenter.liveActivity")}>
          <LiveActivityStream events={activity} />
        </SectionCard>
      </div>
    </DashboardPageLayout>
  );
}
