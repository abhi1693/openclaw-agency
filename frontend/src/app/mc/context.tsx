"use client";

import {
  createContext, useContext, useState, useEffect, useCallback, useRef, useMemo,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { etClock, etDate } from "./helpers";
import type { MCAgent, Brand, MCTask, PerfSnap, ActivityEntry, SystemInfo, MCUser } from "./types";
import { light, dark, type Theme } from "./theme";

// ── API ──
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MC = `${API_BASE}/api/v1/mc`;

async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = typeof window !== "undefined" ? sessionStorage.getItem("mc_refresh_token") : null;
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${MC}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    sessionStorage.setItem("mc_local_auth_token", data.access_token);
    if (data.refresh_token) sessionStorage.setItem("mc_refresh_token", data.refresh_token);
    if (data.expires_in) sessionStorage.setItem("mc_token_expiry", String(Date.now() + data.expires_in * 1000));
    return data.access_token;
  } catch {
    return null;
  }
}

export async function mcApi<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? sessionStorage.getItem("mc_local_auth_token") : null;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${MC}${path}`, { ...opts, headers: { ...h, ...opts?.headers } });

  // On 401, try refresh token and retry once
  if (res.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      const retryHeaders: Record<string, string> = { "Content-Type": "application/json", "Authorization": `Bearer ${newToken}` };
      const retry = await fetch(`${MC}${path}`, { ...opts, headers: { ...retryHeaders, ...opts?.headers } });
      if (!retry.ok) throw new Error(`API ${retry.status}`);
      return retry.json();
    }
    // Refresh failed — clear tokens, will trigger re-login
    sessionStorage.removeItem("mc_local_auth_token");
    sessionStorage.removeItem("mc_refresh_token");
    sessionStorage.removeItem("mc_permissions");
    sessionStorage.removeItem("mc_user");
    sessionStorage.removeItem("mc_token_expiry");
    throw new Error("API 401");
  }

  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

export const WS_URL = API_BASE.replace(/^http/, "ws") + "/api/v1/mc/ws";

export const AGENT_EMOTIONS: Record<string, string> = {
  active: "🔥", idle: "😴", error: "😤", busy: "⚡", overnight: "💤",
};
export const STATUS_COLORS: Record<string, string> = {
  active: "#41D4A8", idle: "#B1B1B1", error: "#FF4B4A", busy: "#FFBB38",
  online: "#41D4A8", offline: "#B1B1B1",
};
export const FEED_COLORS: Record<string, string> = {
  handoff: "#396AFF", broadcast: "#7B61FF", status: "#FFBB38",
  mission: "#0891B2", message: "#41D4A8",
};
export const FEED_ICONS: Record<string, string> = {
  message: "💬", status: "📡", mission: "🚀", handoff: "🤝", broadcast: "📢",
};
export const BRAND_COLORS = ["#396AFF", "#41D4A8", "#7B61FF", "#FC68A2", "#FFBB38"];

// ── Context Type ──
interface MCContextType {
  // Auth
  loggedIn: boolean;
  loginAttempts: number;
  loginError: string;
  email: string;
  password: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  handleLogin: () => void;
  handleLogout: () => void;
  user: MCUser | null;
  permissions: Set<string>;
  hasPermission: (perm: string) => boolean;

  // Data
  agents: MCAgent[];
  brands: Brand[];
  tasks: MCTask[];
  activity: ActivityEntry[];
  perfData: PerfSnap[];
  sysInfo: SystemInfo | null;
  cronJobs: any[];
  files: any[];
  commsSessions: any[];
  commsMessages: Record<string, any[]>;
  setCommsMessages: (id: string, msgs: any[]) => void;
  loadData: () => Promise<void>;
  loading: boolean;

  // UI State
  isDark: boolean;
  setIsDark: (v: boolean | ((p: boolean) => boolean)) => void;
  privacy: boolean;
  setPrivacy: (v: boolean | ((p: boolean) => boolean)) => void;
  cmdOpen: boolean;
  setCmdOpen: (v: boolean) => void;
  activeBrand: string;
  setActiveBrand: (v: string) => void;
  feedFilter: string;
  setFeedFilter: (v: string) => void;
  refreshCountdown: number;
  chatInput: string;
  setChatInput: (v: string) => void;
  selectedAgent: MCAgent | null;
  setSelectedAgent: (a: MCAgent | null) => void;

  // Clock
  clock: string;
  dateStr: string;

  // Theme
  t: Theme;

  // Computed
  activeAgents: number;
  totalRevenue: number;
  pendingTasks: number;

  // Actions
  sendBroadcast: () => Promise<void>;
  priv: (v: string) => string;
  refreshTabData: (tab: string) => void;
}

const MCContext = createContext<MCContextType | null>(null);

export function useMC(): MCContextType {
  const ctx = useContext(MCContext);
  if (!ctx) throw new Error("useMC must be used within MCProvider");
  return ctx;
}

export function MCProvider({ children }: { children: ReactNode }) {
  // ── Auth ──
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState("arpit@plentum.com");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [user, setUser] = useState<MCUser | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());

  // ── Data ──
  const [agents, setAgents] = useState<MCAgent[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [tasks, setTasks] = useState<MCTask[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [perfData, setPerfData] = useState<PerfSnap[]>([]);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [cronJobs, setCronJobs] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [commsSessions, setCommsSessions] = useState<any[]>([]);
  const [commsMessages, setCommsMessagesMap] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  // ── UI ──
  const [isDark, setIsDark] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [activeBrand, setActiveBrand] = useState("all");
  const [feedFilter, setFeedFilter] = useState("all");
  const [refreshCountdown, setRefreshCountdown] = useState(300);
  const [chatInput, setChatInput] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<MCAgent | null>(null);
  const [clock, setClock] = useState("");
  const [dateStr, setDateStr] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t: Theme = isDark ? dark : light;

  // ── hasPermission ──
  const hasPermission = useCallback((perm: string): boolean => {
    return permissions.has(perm);
  }, [permissions]);

  // ── Set user + permissions from login response ──
  const setAuthState = useCallback((userData: MCUser) => {
    setUser(userData);
    const permsSet = new Set(userData.permissions || []);
    setPermissions(permsSet);
    sessionStorage.setItem("mc_user", JSON.stringify(userData));
    sessionStorage.setItem("mc_permissions", JSON.stringify(userData.permissions || []));
  }, []);

  // ── Clock ──
  useEffect(() => {
    const iv = setInterval(() => { setClock(etClock()); setDateStr(etDate()); }, 1000);
    setClock(etClock()); setDateStr(etDate());
    return () => clearInterval(iv);
  }, []);

  // ── Dark mode ──
  useEffect(() => {
    try {
      const s = localStorage.getItem("mc_dark");
      if (s === "true") setIsDark(true);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("mc_dark", String(isDark)); } catch {}
  }, [isDark]);

  // ── Refresh countdown ──
  useEffect(() => {
    if (!loggedIn) return;
    const iv = setInterval(() => setRefreshCountdown(p => p <= 1 ? 300 : p - 1), 1000);
    return () => clearInterval(iv);
  }, [loggedIn]);

  // ── Token auto-refresh ──
  const scheduleTokenRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    const expiryStr = sessionStorage.getItem("mc_token_expiry");
    if (!expiryStr) return;
    const expiry = parseInt(expiryStr);
    const refreshAt = expiry - 5 * 60 * 1000; // 5 min before expiry
    const delay = refreshAt - Date.now();
    if (delay <= 0) {
      // Already past refresh time, refresh now
      tryRefreshToken().then(newToken => {
        if (!newToken) {
          setLoggedIn(false);
          setUser(null);
          setPermissions(new Set());
        }
      });
      return;
    }
    refreshTimerRef.current = setTimeout(async () => {
      const newToken = await tryRefreshToken();
      if (newToken) {
        scheduleTokenRefresh(); // schedule next refresh
      } else {
        setLoggedIn(false);
        setUser(null);
        setPermissions(new Set());
        toast.error("Session expired. Please log in again.");
      }
    }, delay);
  }, []);

  // ── Session restore ──
  useEffect(() => {
    const token = sessionStorage.getItem("mc_local_auth_token");
    if (token) {
      setLoggedIn(true);
      // Restore user from sessionStorage
      try {
        const savedUser = sessionStorage.getItem("mc_user");
        if (savedUser) {
          const userData = JSON.parse(savedUser) as MCUser;
          setUser(userData);
          setPermissions(new Set(userData.permissions || []));
        }
        const savedPerms = sessionStorage.getItem("mc_permissions");
        if (savedPerms && !savedUser) {
          setPermissions(new Set(JSON.parse(savedPerms)));
        }
      } catch {}
      // Fetch fresh user data
      mcApi<{ user: MCUser }>("/auth/me").then(res => {
        if (res.user) setAuthState(res.user);
      }).catch(() => {});
      scheduleTokenRefresh();
    }
  }, []);

  // ── Login ──
  const handleLogin = useCallback(async () => {
    if (loginAttempts >= 5) {
      setLoginError("Account locked. Too many attempts."); return;
    }
    try {
      const res = await fetch(`${MC}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        setLoginAttempts(p => p + 1);
        const errData = await res.json().catch(() => null);
        setLoginError(errData?.detail || `Invalid credentials. ${5 - loginAttempts - 1} attempts remaining.`);
        return;
      }

      const data = await res.json();
      sessionStorage.setItem("mc_local_auth_token", data.access_token);
      if (data.refresh_token) sessionStorage.setItem("mc_refresh_token", data.refresh_token);
      if (data.expires_in) sessionStorage.setItem("mc_token_expiry", String(Date.now() + data.expires_in * 1000));

      if (data.user) {
        setAuthState(data.user);
      }

      setLoggedIn(true);
      setLoginError("");
      setLoginAttempts(0);
      scheduleTokenRefresh();
      toast.success(`Welcome back, ${data.user?.name || "Commander"}`);
    } catch {
      // Fallback to hardcoded auth for backward compatibility
      if (email === "arpit@plentum.com" && password === "MissionControl2026!") {
        sessionStorage.setItem("mc_local_auth_token",
          "mission-control-arpit-plentum-2026-super-secure-token-do-not-share-ever");
        // Set default owner permissions
        const fallbackUser: MCUser = {
          id: "fallback", email, name: "Arpit", role: "owner",
          permissions: [
            "task:view","task:create","task:edit","task:delete","task:assign",
            "task:change_status","task:change_priority","task:comment","task:checklist_edit",
            "agent:view","agent:edit","agent:command","brand:view","brand:edit","brand:credentials",
            "comms:view","comms:broadcast","escalation:view","escalation:create","escalation:resolve",
            "system:view","system:cron_trigger","system:cron_manage","content:view","content:manage",
            "files:view","files:edit","user:view","user:manage","user:manage_admins",
            "dashboard:view","dashboard:revenue","dashboard:costs",
          ],
          brand_access: null, department_access: null, avatar_url: null,
        };
        setAuthState(fallbackUser);
        setLoggedIn(true);
        setLoginError("");
        setLoginAttempts(0);
        toast.success("Welcome back, Arpit");
      } else {
        setLoginAttempts(p => p + 1);
        setLoginError(`Invalid credentials. ${5 - loginAttempts - 1} attempts remaining.`);
      }
    }
  }, [email, password, loginAttempts, setAuthState, scheduleTokenRefresh]);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem("mc_local_auth_token");
    sessionStorage.removeItem("mc_refresh_token");
    sessionStorage.removeItem("mc_user");
    sessionStorage.removeItem("mc_permissions");
    sessionStorage.removeItem("mc_token_expiry");
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    setLoggedIn(false);
    setUser(null);
    setPermissions(new Set());
    setPassword("");
    toast.info("Signed out");
  }, []);

  // ── Load data ──
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [ag, br, ta, ac] = await Promise.all([
        mcApi<MCAgent[]>("/agents"),
        mcApi<Brand[]>("/brands"),
        mcApi<MCTask[]>("/tasks"),
        mcApi<ActivityEntry[]>("/activity?limit=100"),
      ]);
      setAgents(ag); setBrands(br); setTasks(ta); setActivity(ac);
    } catch (e) {
      console.error("Load failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    loadData();
    const iv = setInterval(() => { loadData(); setRefreshCountdown(300); }, 300000);
    return () => clearInterval(iv);
  }, [loggedIn, loadData]);

  // ── Tab-specific data loader ──
  const refreshTabData = useCallback((tab: string) => {
    if (!loggedIn) return;
    if (tab === "performance" || tab === "perf") {
      mcApi<PerfSnap[]>("/performance").then(setPerfData).catch(console.error);
    }
    if (tab === "system") {
      mcApi<SystemInfo>("/system").then(setSysInfo).catch(console.error);
    }
    if (tab === "schedules") {
      mcApi<any[]>("/cron").then(setCronJobs).catch(console.error);
    }
    if (tab === "files") {
      mcApi<any[]>("/files").then(setFiles).catch(console.error);
    }
    if (tab === "comms") {
      mcApi<any[]>("/comms/sessions").then(setCommsSessions).catch(console.error);
    }
  }, [loggedIn]);

  // ── WebSocket ──
  useEffect(() => {
    if (!loggedIn) return;
    try {
      const ws = new WebSocket(WS_URL);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === "activity" || data.type === "broadcast") {
            setActivity(prev => [data.entry, ...prev].slice(0, 200));
            if (data.type === "broadcast") toast.info(`📢 ${data.entry.content}`);
          }
          if (data.type === "agent_update") loadData();
          if (data.type === "task_created" && data.task) {
            setTasks(prev => [data.task, ...prev]);
            toast.info(`📋 New task: ${data.task.task_uid}`);
          }
          if (data.type === "task_updated" && data.task) {
            setTasks(prev => prev.map(t => t.id === data.task.id ? data.task : t));
          }
        } catch {}
      };
      ws.onerror = () => {};
      wsRef.current = ws;
      return () => { ws.close(); };
    } catch {}
  }, [loggedIn, loadData]);

  // ── Send broadcast ──
  const sendBroadcast = useCallback(async () => {
    if (!chatInput.trim()) return;
    try {
      await mcApi("/broadcast", {
        method: "POST",
        body: JSON.stringify({ message: chatInput }),
      });
      setChatInput("");
    } catch (e) {
      toast.error("Failed to broadcast");
    }
  }, [chatInput]);

  // ── Comms messages helper ──
  const setCommsMessages = useCallback((id: string, msgs: any[]) => {
    setCommsMessagesMap(prev => ({ ...prev, [id]: msgs }));
  }, []);

  // ── Computed ──
  const activeAgents = useMemo(() => agents.filter(a => a.status === "active").length, [agents]);
  const totalRevenue = useMemo(() => brands.reduce((s, b) => s + b.current_revenue, 0), [brands]);
  const pendingTasks = useMemo(() => tasks.filter(t => t.status !== "done" && t.status !== "archived").length, [tasks]);

  // ── Privacy helper ──
  const priv = useCallback((v: string) => privacy ? "••••••" : v, [privacy]);

  const value: MCContextType = {
    loggedIn, loginAttempts, loginError,
    email, password, setEmail, setPassword, handleLogin, handleLogout,
    user, permissions, hasPermission,
    agents, brands, tasks, activity, perfData, sysInfo, cronJobs, files,
    commsSessions, commsMessages, setCommsMessages,
    loadData, loading,
    isDark, setIsDark, privacy, setPrivacy, cmdOpen, setCmdOpen,
    activeBrand, setActiveBrand, feedFilter, setFeedFilter,
    refreshCountdown, chatInput, setChatInput, selectedAgent, setSelectedAgent,
    clock, dateStr, t,
    activeAgents, totalRevenue, pendingTasks,
    sendBroadcast, priv, refreshTabData,
  };

  return <MCContext.Provider value={value}>{children}</MCContext.Provider>;
}
