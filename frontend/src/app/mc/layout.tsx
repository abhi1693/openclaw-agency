"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Command as CmdK } from "cmdk";
import { Toaster, toast } from "sonner";
import {
  BarChart3, Bot, CheckCircle2, Clock, Command as CmdIcon, Eye, EyeOff,
  FileText, Layout, Lock, MessageSquare, Moon, Network, RefreshCw,
  Search, Send, Settings, Sun, TrendingUp, Users, LogOut,
} from "lucide-react";
import { MCProvider, useMC, STATUS_COLORS, FEED_COLORS, FEED_ICONS, BRAND_COLORS } from "./context";
import { etRelative } from "./helpers";
import { ROLE_LABELS, PERMISSIONS } from "./types";

// ── Shared mini-components ──
export function AnimatedNumber({
  value, prefix = "", suffix = "", decimals = 0,
}: {
  value: number; prefix?: string; suffix?: string; decimals?: number;
}) {
  const [display, setDisplay] = useState("0");
  useEffect(() => {
    const end = value;
    const duration = 800;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = end * eased;
      setDisplay(decimals > 0 ? current.toFixed(decimals) : Math.round(current).toLocaleString());
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value, decimals]);
  return <span>{prefix}{display}{suffix}</span>;
}

export function Skeleton({ w = "100%", h = 20, r = 8 }: { w?: string | number; h?: number; r?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r,
      background: "linear-gradient(90deg,#f0f0f0 25%,#e0e0e0 50%,#f0f0f0 75%)",
      backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite",
    }} />
  );
}

// ── Nav items ──
const NAV = [
  { path: "/mc/dashboard", label: "Command Center", icon: Layout, shortcut: "1", perm: PERMISSIONS.DASHBOARD_VIEW },
  { path: "/mc/tasks", label: "Tasks", icon: CheckCircle2, shortcut: "2", perm: PERMISSIONS.TASK_VIEW },
  { path: "/mc/performance", label: "Performance", icon: TrendingUp, shortcut: "3", perm: PERMISSIONS.DASHBOARD_VIEW },
  { path: "/mc/agents", label: "Agents", icon: Bot, shortcut: "4", perm: PERMISSIONS.AGENT_VIEW },
  { path: "/mc/comms", label: "Comms", icon: MessageSquare, shortcut: "5", perm: PERMISSIONS.COMMS_VIEW },
  { path: "/mc/org-flow", label: "Org Flow", icon: Network, shortcut: "6", perm: PERMISSIONS.AGENT_VIEW },
  { path: "/mc/files", label: "Files", icon: FileText, shortcut: "7", perm: PERMISSIONS.FILES_VIEW },
  { path: "/mc/schedules", label: "Schedules", icon: Clock, shortcut: "8", perm: PERMISSIONS.SYSTEM_CRON_TRIGGER },
  { path: "/mc/system", label: "System", icon: Settings, shortcut: "9", perm: PERMISSIONS.SYSTEM_VIEW },
  { path: "/mc/settings/users", label: "Settings", icon: Users, shortcut: "0", perm: PERMISSIONS.USER_MANAGE },
];

// ── Login Screen ──
function LoginScreen() {
  const { email, password, setEmail, setPassword, handleLogin, loginError, loginAttempts } = useMC();
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "linear-gradient(135deg, #1B1F3B 0%, #2D3359 50%, #1B1F3B 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', sans-serif",
    }}>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        style={{ background: "#fff", borderRadius: 24, padding: "48px 40px", width: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", textAlign: "center" }}>
        <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 3, repeat: Infinity }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 3, color: "#343C6A" }}>
            ◇ <span style={{ color: "#396AFF" }}>MISSION</span> CONTROL
          </div>
        </motion.div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: "#343C6A", margin: "20px 0 8px" }}>Welcome Back</h2>
        <p style={{ color: "#718EBF", fontSize: 14, marginBottom: 32 }}>Sign in to your command center</p>
        <div style={{ textAlign: "left", marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#718EBF", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)}
            style={{ width: "100%", padding: "14px 16px", border: "2px solid #E6EFF5", borderRadius: 12, fontSize: 15, color: "#343C6A", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        <div style={{ textAlign: "left", marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#718EBF", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{ width: "100%", padding: "14px 16px", border: "2px solid #E6EFF5", borderRadius: 12, fontSize: 15, color: "#343C6A", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
        <motion.button onClick={handleLogin} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          style={{ width: "100%", padding: 14, background: loginAttempts >= 5 ? "#B1B1B1" : "linear-gradient(135deg, #396AFF, #7B61FF)", color: "white", border: "none", borderRadius: 50, fontSize: 15, fontWeight: 600, cursor: loginAttempts >= 5 ? "not-allowed" : "pointer", marginTop: 8, fontFamily: "inherit" }}>
          {loginAttempts >= 5 ? "Account Locked" : "Sign In"}
        </motion.button>
        <AnimatePresence>
          {loginError && (
            <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              style={{ color: "#FF4B4A", fontSize: 13, marginTop: 12 }}>{loginError}</motion.div>
          )}
        </AnimatePresence>
        <p style={{ fontSize: 12, color: "#B1B1B1", marginTop: 20 }}>arpit@plentum.com · MissionControl2026!</p>
      </motion.div>
    </div>
  );
}

// ── Shell (main app wrapper) ──
function Shell({ children }: { children: ReactNode }) {
  const {
    loggedIn, agents, brands, tasks, activity,
    isDark, setIsDark, privacy, setPrivacy, cmdOpen, setCmdOpen,
    activeBrand, setActiveBrand, feedFilter, setFeedFilter,
    clock, dateStr, refreshCountdown, chatInput, setChatInput,
    sendBroadcast, t, activeAgents, pendingTasks, loadData,
    handleLogout, user, hasPermission,
  } = useMC();

  const canBroadcast = hasPermission(PERMISSIONS.COMMS_BROADCAST);
  const visibleNav = NAV.filter(nav => hasPermission(nav.perm));
  const roleInfo = user?.role ? ROLE_LABELS[user.role] : null;

  const router = useRouter();
  const pathname = usePathname();

  // Keyboard shortcuts
  useEffect(() => {
    if (!loggedIn) return;
    const handler = (e: KeyboardEvent) => {
      if (cmdOpen) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(true); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); toast.info("Broadcast mode activated"); return; }
      if (e.key === "p" && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== "INPUT") { setPrivacy(p => !p); return; }
      if (e.key === "r" && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== "INPUT") { loadData(); toast.success("Refreshed"); return; }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== "INPUT") { toast.info("New task — coming soon"); return; }
      if (e.key === "?" && document.activeElement?.tagName !== "INPUT") { toast.info("⌘K Search · 1-9 Nav · P Privacy · R Refresh · N New Task"); return; }
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && !e.metaKey && !e.ctrlKey && document.activeElement?.tagName !== "INPUT") {
        const nav = NAV[num - 1];
        if (nav) router.push(nav.path);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [loggedIn, cmdOpen, setCmdOpen, setPrivacy, loadData, router]);

  const filteredActivity = feedFilter === "all" ? activity : activity.filter(a => a.type === feedFilter);

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", height: "100vh", display: "flex", flexDirection: "column", background: t.bg, color: t.text, transition: "background 0.3s, color 0.3s" }}>
      <Toaster position="top-right" richColors theme={isDark ? "dark" : "light"} />

      {/* ── Cmd+K ── */}
      <AnimatePresence>
        {cmdOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setCmdOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 120 }}>
            <motion.div initial={{ opacity: 0, y: -20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.95 }}
              onClick={e => e.stopPropagation()}
              style={{ width: 560, background: t.card, borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
              <CmdK>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.tableBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
                  <Search size={16} color={t.text2} />
                  <CmdK.Input placeholder="Search pages, agents, brands..." autoFocus
                    style={{ border: "none", outline: "none", background: "transparent", fontSize: 14, color: t.text, width: "100%", fontFamily: "inherit" }} />
                </div>
                <CmdK.List style={{ maxHeight: 320, overflowY: "auto", padding: 8 }}>
                  <CmdK.Empty style={{ padding: 24, textAlign: "center", color: t.text2, fontSize: 13 }}>No results found.</CmdK.Empty>
                  <CmdK.Group heading="Pages">
                    {NAV.map(nav => (
                      <CmdK.Item key={nav.path} value={`page ${nav.label}`}
                        onSelect={() => { router.push(nav.path); setCmdOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, color: t.text }}>
                        <nav.icon size={14} /> {nav.label}
                        <span style={{ marginLeft: "auto", fontSize: 11, color: t.text3 }}>{nav.shortcut}</span>
                      </CmdK.Item>
                    ))}
                  </CmdK.Group>
                  <CmdK.Group heading="Agents">
                    {agents.map(a => (
                      <CmdK.Item key={a.id} value={`agent ${a.name} ${a.role}`}
                        onSelect={() => { router.push("/mc/agents"); setCmdOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, color: t.text }}>
                        <span>{a.emoji}</span> {a.name}
                        <span style={{ color: t.text2, fontSize: 11 }}>— {a.role}</span>
                      </CmdK.Item>
                    ))}
                  </CmdK.Group>
                  <CmdK.Group heading="Brands">
                    {brands.map(b => (
                      <CmdK.Item key={b.id} value={`brand ${b.name}`}
                        onSelect={() => { setActiveBrand(b.name); setCmdOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, color: t.text }}>
                        🏷️ {b.name}
                        <span style={{ color: t.text2, fontSize: 11 }}>{b.domain}</span>
                      </CmdK.Item>
                    ))}
                  </CmdK.Group>
                </CmdK.List>
              </CmdK>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top Bar ── */}
      <div style={{ height: 64, background: t.card, borderBottom: `1px solid ${t.inputBorder}`, display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0, boxShadow: "0 2px 10px rgba(0,0,0,0.03)", zIndex: 100 }}>
        {/* Logo */}
        <motion.div
          animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
          transition={{ duration: 8, repeat: Infinity }}
          onClick={() => router.push("/mc/dashboard")}
          style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2.5, whiteSpace: "nowrap", background: "linear-gradient(90deg,#396AFF,#7B61FF,#0891B2,#396AFF)", backgroundSize: "300%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", cursor: "pointer" }}>
          ◇ MISSION CONTROL
        </motion.div>
        <div style={{ width: 1, height: 28, background: t.inputBorder }} />
        {/* Stats */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: t.text }}>{activeAgents}</span>
          <span style={{ fontSize: 9, fontWeight: 600, color: t.text3, textTransform: "uppercase", letterSpacing: 1 }}>Agents</span>
        </div>
        <div style={{ width: 1, height: 28, background: t.inputBorder }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: t.text }}>{pendingTasks}</span>
          <span style={{ fontSize: 9, fontWeight: 600, color: t.text3, textTransform: "uppercase", letterSpacing: 1 }}>Tasks</span>
        </div>
        <div style={{ width: 1, height: 28, background: t.inputBorder }} />
        {/* Status pill */}
        <div style={{ padding: "5px 12px", borderRadius: 50, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, background: "#41D4A815", color: "#41D4A8", whiteSpace: "nowrap" }}>
          <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 2, repeat: Infinity }}
            style={{ width: 6, height: 6, borderRadius: "50%", background: "#41D4A8" }} />
          ONLINE
        </div>
        <div style={{ flex: 1 }} />
        {/* Brand pills */}
        <div style={{ display: "flex", gap: 2, background: isDark ? t.sidebarHover : "#F0F3F8", borderRadius: 50, padding: 3, overflow: "hidden" }}>
          {["all", ...brands.map(b => b.name)].map(b => (
            <motion.button key={b} onClick={() => setActiveBrand(b)} whileTap={{ scale: 0.95 }}
              style={{ padding: "5px 10px", borderRadius: 50, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: activeBrand === b ? t.primary : "transparent", color: activeBrand === b ? "#fff" : t.text2, fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap" }}>
              {b === "all" ? "All" : b}
            </motion.button>
          ))}
        </div>
        {/* Date/clock */}
        <div style={{ fontSize: 10, color: t.text2, whiteSpace: "nowrap" }}>{dateStr}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: t.text2, fontVariantNumeric: "tabular-nums", fontFamily: "monospace", whiteSpace: "nowrap" }}>{clock} ET</div>
        {/* Refresh timer */}
        <div style={{ fontSize: 9, color: t.text3, whiteSpace: "nowrap" }}>
          ↻ {Math.floor(refreshCountdown / 60)}:{String(refreshCountdown % 60).padStart(2, "0")}
        </div>
        {/* Buttons */}
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setCmdOpen(true)} title="⌘K"
          style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: isDark ? t.sidebarHover : "#F0F3F8", color: t.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Search size={14} />
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setPrivacy(p => !p)} title="Privacy (P)"
          style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: privacy ? t.red : isDark ? t.sidebarHover : "#F0F3F8", color: privacy ? "#fff" : t.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {privacy ? <EyeOff size={14} /> : <Eye size={14} />}
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => setIsDark(d => !d)} title="Theme"
          style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: isDark ? t.sidebarHover : "#F0F3F8", color: t.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
        </motion.button>
        <motion.button whileTap={{ scale: 0.9 }} onClick={handleLogout} title="Sign out"
          style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: isDark ? t.sidebarHover : "#F0F3F8", color: t.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <LogOut size={14} />
        </motion.button>
        {/* Avatar */}
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#396AFF,#7B61FF)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
          {user?.name?.charAt(0).toUpperCase() || "A"}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* ── Sidebar ── */}
        <div style={{ width: 240, background: t.sidebar, display: "flex", flexDirection: "column", overflowY: "auto", flexShrink: 0 }}>
          {/* Navigation */}
          <div style={{ padding: "10px 0 4px" }}>
            <div style={{ padding: "8px 18px 4px", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: 2.5 }}>Navigation</div>
            {visibleNav.map(nav => {
              const Icon = nav.icon;
              const isActive = pathname === nav.path || (pathname === "/mc" && nav.path === "/mc/dashboard")
                || (nav.path === "/mc/settings/users" && pathname?.startsWith("/mc/settings"));
              return (
                <motion.div key={nav.path} onClick={() => router.push(nav.path)} whileHover={{ x: 3 }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 18px", cursor: "pointer", color: isActive ? "#fff" : "rgba(255,255,255,0.5)", background: isActive ? "#2D3359" : "transparent", borderLeft: isActive ? "3px solid #396AFF" : "3px solid transparent", fontSize: 12, fontWeight: isActive ? 600 : 400, transition: "all 0.15s", userSelect: "none" }}>
                  <Icon size={15} />
                  <span style={{ flex: 1 }}>{nav.label}</span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "monospace" }}>{nav.shortcut}</span>
                </motion.div>
              );
            })}
          </div>

          {/* User badge */}
          {user && (
            <div style={{ padding: "8px 18px 10px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "linear-gradient(135deg,#396AFF,#7B61FF)",
                  color: "#fff", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 11, fontWeight: 700,
                }}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.8)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {user.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {roleInfo && (
                      <span style={{
                        fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 50,
                        background: `${roleInfo.color}20`, color: roleInfo.color,
                        textTransform: "uppercase", letterSpacing: 0.5,
                      }}>
                        {roleInfo.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Agent list */}
          <div style={{ padding: "10px 18px 4px", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: 2.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Agents</span>
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 8 }}>{agents.length} TOTAL · {activeAgents} ON</span>
          </div>
          <div style={{ padding: "2px 10px 16px", flex: 1 }}>
            {agents.map((a, i) => (
              <motion.div key={a.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                whileHover={{ x: 3, backgroundColor: "#252A4A" }}
                onClick={() => router.push("/mc/agents")}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", borderRadius: 8, cursor: "pointer", marginBottom: 1, transition: "all 0.15s" }}>
                <span style={{ fontSize: 14, width: 22, textAlign: "center" }}>{a.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.65)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.role}</div>
                </div>
                <motion.div
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.1 }}
                  style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: STATUS_COLORS[a.status] || "#B1B1B1", boxShadow: a.status === "active" ? `0 0 6px ${STATUS_COLORS.active}` : "none" }} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* ── Main Content ── */}
        <div style={{ flex: 1, overflowY: "auto", background: t.bg, filter: privacy ? "blur(3px)" : "none", transition: "filter 0.3s" }}>
          {children}
        </div>

        {/* ── Live Feed Panel ── */}
        <div style={{ width: 320, background: t.card, borderLeft: `1px solid ${t.inputBorder}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.inputBorder}` }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: t.text, display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                style={{ width: 8, height: 8, borderRadius: "50%", background: t.red }} />
              Live Feed
              <span style={{ background: t.red, color: "#fff", fontSize: 9, padding: "2px 7px", borderRadius: 10, fontWeight: 700, marginLeft: "auto" }}>
                {activity.length}
              </span>
            </h3>
            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
              {["all", "message", "handoff", "broadcast", "status", "mission"].map(f => (
                <button key={f} onClick={() => setFeedFilter(f)}
                  style={{ padding: "3px 9px", borderRadius: 50, fontSize: 9, fontWeight: 600, border: "none", cursor: "pointer", background: feedFilter === f ? t.primary : isDark ? t.sidebarHover : "#F0F3F8", color: feedFilter === f ? "#fff" : t.text2, fontFamily: "inherit", transition: "all 0.15s" }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Feed messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px" }}>
            <AnimatePresence initial={false}>
              {filteredActivity.slice(0, 60).map(a => (
                <motion.div key={a.id}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  style={{ display: "flex", gap: 8, padding: "9px 0", borderBottom: `1px solid ${t.tableBorder}` }}>
                  <div style={{ fontSize: 14, marginTop: 1 }}>{FEED_ICONS[a.type] || "📝"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: t.text }}>
                      {a.from_agent && <strong style={{ color: FEED_COLORS[a.type] || t.text }}>{a.from_agent}</strong>}
                      {a.to_agent && <span style={{ color: t.text2 }}> → <strong>{a.to_agent}</strong></span>}
                    </div>
                    <div style={{ fontSize: 11, color: t.text2, marginTop: 2, lineHeight: 1.4 }}>{a.content}</div>
                    <div style={{ fontSize: 9, color: t.text3, marginTop: 2 }}>{etRelative(a.timestamp)}</div>
                  </div>
                  <div style={{ width: 3, borderRadius: 2, background: FEED_COLORS[a.type] || t.text3, opacity: 0.5, alignSelf: "stretch", flexShrink: 0 }} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Chat input — only for users with broadcast permission */}
          {canBroadcast && (
            <div style={{ padding: 10, borderTop: `1px solid ${t.inputBorder}`, display: "flex", gap: 6 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendBroadcast()}
                placeholder="Broadcast to all agents..."
                style={{ flex: 1, padding: "9px 12px", borderRadius: 50, border: `1px solid ${t.inputBorder}`, background: isDark ? t.sidebarHover : "#F8FAFC", color: t.text, fontSize: 11, outline: "none", fontFamily: "inherit" }} />
              <motion.button whileTap={{ scale: 0.9 }} onClick={sendBroadcast}
                style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: t.primary, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Send size={13} />
              </motion.button>
            </div>
          )}
        </div>
      </div>

      {/* Global Styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${isDark ? "#2D3359" : "#D1D5DB"}; border-radius: 4px; }
        [cmdk-item][data-selected=true] { background: ${isDark ? t.sidebarHover : "#F0F3F8"} !important; border-radius: 8px; }
        [cmdk-group-heading] { padding: 6px 12px; font-size: 10px; font-weight: 700; color: ${t.text3}; text-transform: uppercase; letter-spacing: 1px; }
      `}</style>
    </div>
  );
}

// ── MCLayout (exported) ──
function MCLayoutInner({ children }: { children: ReactNode }) {
  const { loggedIn } = useMC();
  if (!loggedIn) return (
    <>
      <Toaster position="top-right" richColors />
      <LoginScreen />
    </>
  );
  return <Shell>{children}</Shell>;
}

export default function MCLayout({ children }: { children: ReactNode }) {
  return (
    <MCProvider>
      <MCLayoutInner>{children}</MCLayoutInner>
    </MCProvider>
  );
}
