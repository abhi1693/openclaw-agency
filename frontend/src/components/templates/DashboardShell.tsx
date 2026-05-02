"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";

import { SignedIn, useAuth } from "@/auth/clerk";

import { ApiError } from "@/api/mutator";
import {
  type getMeApiV1UsersMeGetResponse,
  useGetMeApiV1UsersMeGet,
} from "@/api/generated/users/users";
import { BrandMark } from "@/components/atoms/BrandMark";
import { OrgSwitcher } from "@/components/organisms/OrgSwitcher";
import { UserMenu } from "@/components/organisms/UserMenu";
import { isOnboardingComplete } from "@/lib/onboarding";

type DashboardSidebarContextValue = {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
};

const DashboardSidebarContext =
  createContext<DashboardSidebarContextValue | null>(null);

export function useDashboardSidebar() {
  return useContext(DashboardSidebarContext);
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, isLoaded } = useAuth();
  const isOnboardingPath = pathname === "/onboarding";
  const [authTimeout, setAuthTimeout] = useState(false);
  const authTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoaded) {
      if (authTimerRef.current) clearTimeout(authTimerRef.current);
      return;
    }
    authTimerRef.current = setTimeout(() => setAuthTimeout(true), 8000);
    return () => {
      if (authTimerRef.current) clearTimeout(authTimerRef.current);
    };
  }, [isLoaded]);
  const [sidebarState, setSidebarState] = useState({ open: false, path: pathname });
  // Close sidebar on navigation using React's "store info from previous
  // renders" pattern — conditional setState during render resets immediately
  // without extra commits, avoiding both set-state-in-effect and refs rules.
  if (sidebarState.path !== pathname) {
    setSidebarState({ open: false, path: pathname });
  }
  const sidebarOpen = sidebarState.open;

  const meQuery = useGetMeApiV1UsersMeGet<
    getMeApiV1UsersMeGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn) && !isOnboardingPath,
      retry: false,
      refetchOnMount: "always",
    },
  });
  const profile = meQuery.data?.status === 200 ? meQuery.data.data : null;
  const displayName = profile?.name ?? profile?.preferred_name ?? "Operator";
  const displayEmail = profile?.email ?? "";

  useEffect(() => {
    if (!isSignedIn || isOnboardingPath) return;
    if (!profile) return;
    if (!isOnboardingComplete(profile)) {
      router.replace("/onboarding");
    }
  }, [isOnboardingPath, isSignedIn, profile, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "openclaw_org_switch" || !event.newValue) return;
      window.location.reload();
    };

    window.addEventListener("storage", handleStorage);

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("org-switch");
      channel.onmessage = () => {
        window.location.reload();
      };
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    };
  }, []);

  const toggleSidebar = useCallback(
    () => setSidebarState((prev) => ({ open: !prev.open, path: pathname })),
    [pathname],
  );
  const closeSidebar = useCallback(
    () => setSidebarState((prev) => ({ ...prev, open: false })),
    [],
  );
  const sidebarContextValue = useMemo(
    () => ({ sidebarOpen, toggleSidebar, closeSidebar }),
    [closeSidebar, sidebarOpen, toggleSidebar],
  );

  // Dismiss sidebar on Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeSidebar, sidebarOpen]);

  if (!isLoaded) {
    if (authTimeout) {
      return (
        <div className="min-h-screen bg-app flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-sm text-slate-600">会话加载超时，请刷新页面</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              刷新
            </button>
          </div>
        </div>
      );
    }
    return <div className="min-h-screen bg-app" />;
  }

  return (
    <DashboardSidebarContext.Provider value={sidebarContextValue}>
      <div className="min-h-screen bg-app text-strong">
        <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
          <div className="flex items-center py-3">
            <div className="flex items-center px-4 md:px-6 md:w-[260px]">
              {isSignedIn ? (
                <button
                  type="button"
                  className="mr-3 rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
                  onClick={toggleSidebar}
                  aria-label="Toggle navigation"
                >
                  {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              ) : null}
              <BrandMark />
            </div>
            <SignedIn>
              <div className="hidden md:flex flex-1 items-center">
                <div className="max-w-[220px]">
                  <OrgSwitcher />
                </div>
              </div>
            </SignedIn>
            <SignedIn>
              <div className="ml-auto flex items-center gap-3 px-4 md:px-6">
                <div className="hidden text-right lg:block">
                  <p className="text-sm font-semibold text-slate-900">
                    {displayName}
                  </p>
                  <p className="text-xs text-slate-500">Operator</p>
                </div>
                <UserMenu displayName={displayName} displayEmail={displayEmail} />
              </div>
            </SignedIn>
          </div>
        </header>

        <div className="grid min-h-[calc(100vh-64px)] grid-cols-1 md:grid-cols-[260px_1fr] bg-slate-50">
          {children}
        </div>
      </div>
    </DashboardSidebarContext.Provider>
  );
}
