"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MessageSquare, Clock, Users, FileText } from "lucide-react";
import { useMC, mcApi, FEED_COLORS, FEED_ICONS } from "../context";
import { etDateTime, etRelative } from "../helpers";

export default function CommsPage() {
  const { activity, commsSessions, commsMessages, setCommsMessages, t, isDark, loading, refreshTabData } = useMC();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [tab, setTab] = useState<"sessions" | "logs">("sessions");
  const [search, setSearch] = useState("");

  useEffect(() => { refreshTabData("comms"); }, []);

  // Load messages when session selected
  useEffect(() => {
    if (!selectedSession) return;
    if (commsMessages[selectedSession]) return;
    mcApi<any>(`/comms/sessions/${selectedSession}`)
      .then(data => setCommsMessages(selectedSession, data.messages || []))
      .catch(() => setCommsMessages(selectedSession, []));
  }, [selectedSession]);

  const sessions = commsSessions.filter(s =>
    !search || s.title?.toLowerCase().includes(search.toLowerCase()) ||
    s.participants?.some((p: string) => p.toLowerCase().includes(search.toLowerCase()))
  );

  const activeSession = commsSessions.find(s => s.id === selectedSession);
  const sessionMsgs = selectedSession ? (commsMessages[selectedSession] || []) : [];

  const filteredLogs = activity.filter(a =>
    !search || a.content.toLowerCase().includes(search.toLowerCase()) ||
    (a.from_agent || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text }}>📡 Comms Center</h1>
          <p style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>Strategy sessions & agent communications</p>
        </div>
        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.card, border: `1px solid ${t.inputBorder}`, borderRadius: 50, padding: "8px 16px" }}>
          <Search size={13} color={t.text2} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search comms..."
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: t.text, width: 180, fontFamily: "inherit" }} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 3, marginBottom: 20, background: isDark ? t.sidebarHover : "#F0F3F8", borderRadius: 50, padding: 3, width: "fit-content" }}>
        {[
          { id: "sessions", label: "Strategy Sessions", icon: <Users size={13} /> },
          { id: "logs", label: "Agent Logs", icon: <FileText size={13} /> },
        ].map(tp => (
          <motion.button key={tp.id} onClick={() => setTab(tp.id as any)} whileTap={{ scale: 0.95 }}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 50, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: tab === tp.id ? t.primary : "transparent", color: tab === tp.id ? "#fff" : t.text2, fontFamily: "inherit", transition: "all 0.15s" }}>
            {tp.icon} {tp.label}
          </motion.button>
        ))}
      </div>

      {tab === "sessions" && (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, flex: 1, overflow: "hidden", minHeight: 500 }}>
          {/* Sessions List */}
          <div style={{ background: t.card, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.tableBorder}`, fontWeight: 700, fontSize: 13, color: t.text }}>
              Sessions ({sessions.length})
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {sessions.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", color: t.text3, fontSize: 13 }}>
                  <MessageSquare size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <div>No sessions yet</div>
                </div>
              )}
              {sessions.map((s, i) => (
                <motion.div key={s.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => setSelectedSession(s.id)}
                  style={{ padding: "14px 16px", borderBottom: `1px solid ${t.tableBorder}`, cursor: "pointer", background: selectedSession === s.id ? `${t.primary}10` : "transparent", borderLeft: selectedSession === s.id ? `3px solid ${t.primary}` : "3px solid transparent", transition: "all 0.15s" }}
                  onMouseOver={e => { if (selectedSession !== s.id) e.currentTarget.style.background = isDark ? t.sidebarHover : "#F8FAFC"; }}
                  onMouseOut={e => { if (selectedSession !== s.id) e.currentTarget.style.background = "transparent"; }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{s.title || "Untitled Session"}</div>
                    <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, background: `${t.teal}20`, color: t.teal, fontWeight: 600, whiteSpace: "nowrap", marginLeft: 8, flexShrink: 0 }}>{s.type}</span>
                  </div>
                  {s.participants && s.participants.length > 0 && (
                    <div style={{ fontSize: 11, color: t.text2, marginBottom: 4 }}>
                      👥 {s.participants.slice(0, 3).join(", ")}{s.participants.length > 3 ? ` +${s.participants.length - 3}` : ""}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: t.text3, display: "flex", alignItems: "center", gap: 4 }}>
                    <Clock size={9} /> {etRelative(s.start_time)}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Message Thread */}
          <div style={{ background: t.card, borderRadius: 20, display: "flex", flexDirection: "column", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", overflow: "hidden" }}>
            {!selectedSession ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: t.text3 }}>
                <MessageSquare size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
                <div style={{ fontSize: 14, fontWeight: 600 }}>Select a session</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>to view the conversation</div>
              </div>
            ) : (
              <>
                {/* Session header */}
                <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.tableBorder}` }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{activeSession?.title || "Session"}</div>
                  <div style={{ fontSize: 12, color: t.text2, marginTop: 2 }}>
                    {activeSession?.participants?.join(" · ") || ""}
                  </div>
                </div>

                {/* Messages */}
                <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                  <AnimatePresence>
                    {sessionMsgs.length === 0 && (
                      <div style={{ textAlign: "center", padding: 32, color: t.text3, fontSize: 13 }}>No messages in this session</div>
                    )}
                    {sessionMsgs.map((msg, i) => (
                      <motion.div key={msg.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        style={{ marginBottom: 14 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: t.primary }}>{msg.from_agent}</span>
                          <span style={{ fontSize: 10, color: t.text3 }}>{etDateTime(msg.timestamp)}</span>
                        </div>
                        <div style={{ background: isDark ? t.sidebarHover : "#F8FAFC", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: t.text, lineHeight: 1.5 }}>
                          {msg.content}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Session Notes Panel */}
                {activeSession?.notes && (
                  <div style={{ padding: 16, borderTop: `1px solid ${t.tableBorder}`, background: isDark ? t.sidebarHover : "#FAFBFF" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 8 }}>📝 Session Notes</div>
                    {activeSession.notes.decisions?.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: t.text2, marginBottom: 4 }}>KEY DECISIONS</div>
                        {activeSession.notes.decisions.map((d: string, i: number) => (
                          <div key={i} style={{ fontSize: 11, color: t.text, padding: "3px 0", display: "flex", gap: 6 }}>
                            <span style={{ color: t.teal }}>✓</span> {d}
                          </div>
                        ))}
                      </div>
                    )}
                    {activeSession.notes.action_items?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: t.text2, marginBottom: 4 }}>ACTION ITEMS</div>
                        {activeSession.notes.action_items.map((item: string, i: number) => (
                          <div key={i} style={{ fontSize: 11, color: t.text, padding: "3px 0", display: "flex", gap: 6 }}>
                            <span style={{ color: t.orange }}>→</span> {item}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === "logs" && (
        <div style={{ background: t.card, borderRadius: 20, flex: 1, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.tableBorder}`, fontWeight: 700, fontSize: 13, color: t.text }}>
            Agent Activity Log ({filteredLogs.length} entries)
          </div>
          <div style={{ overflowY: "auto", height: "calc(100% - 50px)", padding: "0 20px" }}>
            <AnimatePresence initial={false}>
              {filteredLogs.map((a, i) => (
                <motion.div key={a.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.01, 0.3) }}
                  style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: `1px solid ${t.tableBorder}` }}>
                  <div style={{ fontSize: 18, marginTop: 1, flexShrink: 0 }}>{FEED_ICONS[a.type] || "📝"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      {a.from_agent && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: FEED_COLORS[a.type] || t.primary }}>{a.from_agent}</span>
                      )}
                      {a.to_agent && (
                        <span style={{ fontSize: 11, color: t.text2 }}>→ <strong>{a.to_agent}</strong></span>
                      )}
                      <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 10, background: `${FEED_COLORS[a.type] || t.primary}20`, color: FEED_COLORS[a.type] || t.primary, fontWeight: 600, marginLeft: "auto" }}>
                        {a.type}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: t.text, lineHeight: 1.4 }}>{a.content}</div>
                    <div style={{ fontSize: 10, color: t.text3, marginTop: 3 }}>{etDateTime(a.timestamp)}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
