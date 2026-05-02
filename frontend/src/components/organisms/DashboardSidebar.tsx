"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  Folder,
  Building2,
  Clapperboard,
  Cpu,
  DollarSign,
  FileText,
  Key,
  LayoutDashboard,
  LayoutGrid,
  Map,
  MessageSquare,
  Network,
  Package,
  ReceiptText,
  Settings,
  Ship,
  Store,
  Swords,
  Tags,
  Target,
  X,
} from "lucide-react";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import {
  type healthzHealthzGetResponse,
  useHealthzHealthzGet,
} from "@/api/generated/default/default";
import { useDashboardSidebar } from "@/components/templates/DashboardShell";
import { cn } from "@/lib/utils";

export function DashboardSidebar() {
  const pathname = usePathname();
  const sidebar = useDashboardSidebar();
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const healthQuery = useHealthzHealthzGet<healthzHealthzGetResponse, ApiError>(
    {
      query: {
        refetchInterval: 30_000,
        refetchOnMount: "always",
        retry: false,
      },
      request: { cache: "no-store" },
    },
  );

  const okValue = healthQuery.data?.data?.ok;
  const systemStatus: "unknown" | "operational" | "degraded" =
    okValue === true
      ? "operational"
      : okValue === false
        ? "degraded"
        : healthQuery.isError
          ? "degraded"
          : "unknown";
  const statusLabel =
    systemStatus === "operational"
      ? "All systems operational"
      : systemStatus === "unknown"
        ? "System status unavailable"
        : "System degraded";
  const sidebarOpen = sidebar?.sidebarOpen ?? false;
  const closeSidebar = sidebar?.closeSidebar;

  return (
    <Fragment>
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/35 md:hidden"
          onClick={closeSidebar}
          aria-label="Close navigation"
          data-cy="sidebar-backdrop"
        />
      ) : null}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col border-r border-slate-200 bg-white pt-16 shadow-lg transition-transform duration-200 ease-in-out md:relative md:inset-auto md:z-auto md:w-[260px] md:translate-x-0 md:pt-0 md:shadow-none md:transition-none",
          sidebarOpen && "translate-x-0",
        )}
      >
        <div className="flex-1 px-3 py-3">
          <div className="mb-3 flex items-center justify-between px-3 md:hidden">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Navigation
            </p>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100"
              onClick={closeSidebar}
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="hidden px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 md:block">
            Navigation
          </p>
          <nav className="mt-3 space-y-3 text-sm">
            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Overview
              </p>
              <div className="mt-1 space-y-1">
                <Link
                  href="/dashboard"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                    pathname === "/dashboard"
                      ? "bg-blue-100 text-blue-800 font-medium"
                      : "hover:bg-slate-100",
                  )}
                >
                  <BarChart3 className="h-4 w-4" />
                  Dashboard
                </Link>
                <Link
                  href="/activity"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                    pathname.startsWith("/activity")
                      ? "bg-blue-100 text-blue-800 font-medium"
                      : "hover:bg-slate-100",
                  )}
                >
                  <Activity className="h-4 w-4" />
                  Live feed
                </Link>
              </div>
            </div>

            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Boards
              </p>
              <div className="mt-1 space-y-1">
                <Link
                  href="/board-groups"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                    pathname.startsWith("/board-groups")
                      ? "bg-blue-100 text-blue-800 font-medium"
                      : "hover:bg-slate-100",
                  )}
                >
                  <Folder className="h-4 w-4" />
                  Board groups
                </Link>
                <Link
                  href="/boards"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                    pathname.startsWith("/boards")
                      ? "bg-blue-100 text-blue-800 font-medium"
                      : "hover:bg-slate-100",
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Boards
                </Link>
                <Link
                  href="/tags"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                    pathname.startsWith("/tags")
                      ? "bg-blue-100 text-blue-800 font-medium"
                      : "hover:bg-slate-100",
                  )}
                >
                  <Tags className="h-4 w-4" />
                  Tags
                </Link>
                <Link
                  href="/approvals"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                    pathname.startsWith("/approvals")
                      ? "bg-blue-100 text-blue-800 font-medium"
                      : "hover:bg-slate-100",
                  )}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approvals
                </Link>
                <div className="my-3 border-t border-slate-200" />
                <div>
                  <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    ZOVIRO Business
                  </p>
                  <div className="mt-1 space-y-1">
                    {[
                      { href: "/business", icon: LayoutDashboard, label: "Insights", sub: "业务洞察" },
                      { href: "/inventory", icon: Map, label: "Inventory", sub: "库存" },
                      { href: "/ppc", icon: Target, label: "PPC", sub: "广告投放" },
                      { href: "/ppc/automation", icon: Bot, label: "PPC Automation", sub: "竞价自动化" },
                      { href: "/keywords", icon: Key, label: "Keywords", sub: "关键词排名" },
                      { href: "/reports", icon: FileText, label: "Reports", sub: "报告中心" },
                      { href: "/reviews", icon: MessageSquare, label: "Reviews", sub: "评价监控" },
                      { href: "/competitors", icon: Swords, label: "Competitors", sub: "竞品监控" },
                      { href: "/restock", icon: Package, label: "Restock", sub: "补货预测" },
                      { href: "/profit", icon: DollarSign, label: "Profit", sub: "利润分析" },
                      { href: "/refunds", icon: ReceiptText, label: "Refunds", sub: "FBA 退款追回" },
                      { href: "/content", icon: Clapperboard, label: "Content", sub: "内容营销矩阵" },
                      { href: "/system", icon: Cpu, label: "System", sub: "系统 & 模型用量" },
                      { href: "/shipments", icon: Ship, label: "Shipments", sub: "海运追踪" },
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = item.href === "/ppc"
                        ? pathname === "/ppc"
                        : pathname === item.href || pathname.startsWith(`${item.href}/`);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                            active ? "bg-blue-100 text-blue-800 font-medium" : "hover:bg-slate-100",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="font-medium">{item.label}</span>
                          <span
                            className={cn(
                              "ml-0.5 text-xs",
                              active ? "text-blue-700" : "text-slate-500",
                            )}
                          >
                            {item.sub}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
                {isAdmin ? (
                  <Link
                    href="/custom-fields"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                      pathname.startsWith("/custom-fields")
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <Settings className="h-4 w-4" />
                    Custom fields
                  </Link>
                ) : null}
              </div>
            </div>

            <div>
              {isAdmin ? (
                <>
                  <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Skills
                  </p>
                  <div className="mt-1 space-y-1">
                    <Link
                      href="/skills/marketplace"
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                        pathname === "/skills" ||
                          pathname.startsWith("/skills/marketplace")
                          ? "bg-blue-100 text-blue-800 font-medium"
                          : "hover:bg-slate-100",
                      )}
                    >
                      <Store className="h-4 w-4" />
                      Marketplace
                    </Link>
                    <Link
                      href="/skills/packs"
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                        pathname.startsWith("/skills/packs")
                          ? "bg-blue-100 text-blue-800 font-medium"
                          : "hover:bg-slate-100",
                      )}
                    >
                      <Boxes className="h-4 w-4" />
                      Packs
                    </Link>
                  </div>
                </>
              ) : null}
            </div>

            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Administration
              </p>
              <div className="mt-1 space-y-1">
                <Link
                  href="/organization"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                    pathname.startsWith("/organization")
                      ? "bg-blue-100 text-blue-800 font-medium"
                      : "hover:bg-slate-100",
                  )}
                >
                  <Building2 className="h-4 w-4" />
                  Organization
                </Link>
                {isAdmin ? (
                  <Link
                    href="/gateways"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                      pathname.startsWith("/gateways")
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <Network className="h-4 w-4" />
                    Gateways
                  </Link>
                ) : null}
                {isAdmin ? (
                  <Link
                    href="/agents"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-1.5 text-slate-700 transition",
                      pathname.startsWith("/agents")
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <Bot className="h-4 w-4" />
                    Agents
                  </Link>
                ) : null}
              </div>
            </div>
          </nav>
        </div>
        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                systemStatus === "operational" && "bg-emerald-500",
                systemStatus === "degraded" && "bg-rose-500",
                systemStatus === "unknown" && "bg-slate-300",
              )}
            />
            {statusLabel}
          </div>
        </div>
      </aside>
    </Fragment>
  );
}
