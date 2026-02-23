"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, LayoutGrid, List, Layers, Users, X, ChevronDown,
  MessageSquare, Paperclip, Calendar, Clock, AlertTriangle, ArrowUp,
  ArrowDown, Minus, CheckSquare, Square, Trash2, Archive, Send,
  GripVertical, ExternalLink, Tag,
} from "lucide-react";
import { toast } from "sonner";
import { useMC, mcApi } from "../context";
import { etRelative, etDateShort } from "../helpers";
import type { MCTask, TaskActivityLog, TaskComment, ChecklistItem } from "../types";
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_STATUSES, AGENT_EMOJIS, PERMISSIONS } from "../types";

// ── Constants ──

const KANBAN_COLUMNS = [
  { id: "inbox",       label: "Inbox",       icon: "📥" },
  { id: "assigned",    label: "Assigned",    icon: "📋" },
  { id: "in_progress", label: "In Progress", icon: "🔄" },
  { id: "blocked",     label: "Blocked",     icon: "🚫" },
  { id: "review",      label: "Review",      icon: "👀" },
  { id: "done",        label: "Done",        icon: "✅" },
] as const;

const SORT_OPTIONS = [
  { value: "priority", label: "Priority" },
  { value: "created_at", label: "Newest" },
  { value: "due_date", label: "Due Date" },
  { value: "updated_at", label: "Recently Updated" },
] as const;

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

type ViewMode = "kanban" | "list" | "category" | "agent";

function priorityBorderColor(priority: string): string {
  const p = TASK_PRIORITIES[priority as keyof typeof TASK_PRIORITIES];
  return p ? p.color : "#6B7280";
}

function isOverdue(task: MCTask): boolean {
  if (!task.due_date || task.status === "done" || task.status === "archived") return false;
  return new Date(task.due_date) < new Date();
}

function categoryConfig(cat: string) {
  return TASK_CATEGORIES[cat as keyof typeof TASK_CATEGORIES] || TASK_CATEGORIES.general;
}

function priorityConfig(pri: string) {
  return TASK_PRIORITIES[pri as keyof typeof TASK_PRIORITIES] || TASK_PRIORITIES.medium;
}

function statusConfig(st: string) {
  return TASK_STATUSES[st as keyof typeof TASK_STATUSES] || TASK_STATUSES.inbox;
}

// ── Pill Component ──

function Pill({ label, color, bg, active, onClick, small }: {
  label: string; color: string; bg?: string; active?: boolean; onClick?: () => void; small?: boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        padding: small ? "2px 8px" : "4px 12px",
        borderRadius: 50,
        fontSize: small ? 9 : 11,
        fontWeight: 600,
        border: active ? `2px solid ${color}` : "2px solid transparent",
        background: active ? `${color}20` : bg || "transparent",
        color: color,
        cursor: onClick ? "pointer" : "default",
        fontFamily: "inherit",
        letterSpacing: small ? 0.5 : 0,
        textTransform: small ? "uppercase" as const : "none" as const,
        whiteSpace: "nowrap" as const,
      }}
    >
      {label}
    </motion.button>
  );
}

// ── TaskCard Component ──

function TaskCard({ task, t, onClick, onStatusChange, canDrag }: {
  task: MCTask; t: any; onClick: () => void;
  onStatusChange: (uid: string, status: string) => void; canDrag: boolean;
}) {
  const cat = categoryConfig(task.category);
  const pri = priorityConfig(task.priority);
  const overdue = isOverdue(task);
  const isCritical = task.priority === "critical";
  const isBlocked = task.status === "blocked";
  const checkDone = task.checklist?.filter(c => c.done).length || 0;
  const checkTotal = task.checklist?.length || 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      draggable={canDrag}
      onDragStart={e => {
        e.dataTransfer.setData("taskUid", task.task_uid);
        e.dataTransfer.effectAllowed = "move";
      }}
      whileHover={{ y: -2, boxShadow: "0 8px 25px rgba(0,0,0,0.1)" }}
      onClick={onClick}
      style={{
        background: isCritical ? `${pri.color}08` : t.card,
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        cursor: canDrag ? "grab" : "pointer",
        border: isBlocked
          ? `2px dashed ${TASK_STATUSES.blocked.color}`
          : `1px solid ${t.cardBorder}`,
        borderLeft: `4px solid ${pri.color}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        userSelect: "none" as const,
      }}
    >
      {/* UID + Priority */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: cat.color,
          background: `${cat.color}15`, padding: "2px 6px", borderRadius: 4,
          fontFamily: "monospace",
        }}>
          {task.task_uid}
        </span>
        {task.urgency_flag && (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{ fontSize: 10 }}
          >
            🔥
          </motion.div>
        )}
      </div>

      {/* Title */}
      <div style={{
        fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 8,
        lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical" as const, overflow: "hidden",
      }}>
        {task.title}
      </div>

      {/* Category + Brand pills */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        <Pill label={cat.label} color={cat.color} bg={`${cat.color}12`} small />
        {task.brand_name && (
          <Pill label={task.brand_name} color={t.primary} bg={`${t.primary}12`} small />
        )}
      </div>

      {/* Agent */}
      {task.assigned_agent && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 14 }}>{AGENT_EMOJIS[task.assigned_agent] || "👤"}</span>
          <span style={{ fontSize: 11, fontWeight: 500, color: t.text2 }}>{task.assigned_agent}</span>
          {task.collaborator_agents && task.collaborator_agents.length > 0 && (
            <span style={{ fontSize: 10, color: t.text3 }}>+{task.collaborator_agents.length}</span>
          )}
        </div>
      )}

      {/* Checklist progress */}
      {checkTotal > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <CheckSquare size={11} color={t.text3} />
          <span style={{ fontSize: 10, color: t.text3 }}>{checkDone}/{checkTotal}</span>
          <div style={{ flex: 1, height: 3, borderRadius: 2, background: `${t.green}20` }}>
            <div style={{
              width: `${checkTotal > 0 ? (checkDone / checkTotal) * 100 : 0}%`,
              height: "100%", borderRadius: 2, background: t.green,
              transition: "width 0.3s",
            }} />
          </div>
        </div>
      )}

      {/* Due date */}
      {task.due_date && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6 }}>
          <Calendar size={10} color={overdue ? "#EF4444" : t.text3} />
          <motion.span
            animate={overdue ? { opacity: [1, 0.4, 1] } : {}}
            transition={overdue ? { duration: 1.5, repeat: Infinity } : {}}
            style={{
              fontSize: 10, fontWeight: overdue ? 700 : 500,
              color: overdue ? "#EF4444" : t.text3,
            }}
          >
            {overdue ? "Overdue: " : "Due: "}{etDateShort(task.due_date)}
          </motion.span>
        </div>
      )}

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 6 }}>
          {task.tags.slice(0, 3).map(tag => (
            <span key={tag} style={{
              fontSize: 9, padding: "1px 6px", borderRadius: 8,
              background: `${t.primary}10`, color: t.primary,
              fontWeight: 600,
            }}>
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span style={{ fontSize: 9, color: t.text3 }}>+{task.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        {(task.comment_count ?? 0) > 0 && (
          <span style={{ fontSize: 10, color: t.text3, display: "flex", alignItems: "center", gap: 3 }}>
            <MessageSquare size={9} /> {task.comment_count}
          </span>
        )}
        {task.reference_docs && task.reference_docs.length > 0 && (
          <span style={{ fontSize: 10, color: t.text3, display: "flex", alignItems: "center", gap: 3 }}>
            <Paperclip size={9} /> {task.reference_docs.length}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 9, color: t.text3 }}>{etRelative(task.updated_at)}</span>
      </div>
    </motion.div>
  );
}

// ── TaskRow (List View) ──

function TaskRow({ task, t, onClick }: { task: MCTask; t: any; onClick: () => void }) {
  const cat = categoryConfig(task.category);
  const pri = priorityConfig(task.priority);
  const st = statusConfig(task.status);
  const overdue = isOverdue(task);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileHover={{ background: `${t.primary}05` }}
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr 100px 90px 90px 120px 80px",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        borderBottom: `1px solid ${t.tableBorder}`,
        cursor: "pointer",
        fontSize: 12,
        borderLeft: `3px solid ${pri.color}`,
      }}
    >
      <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: cat.color }}>{task.task_uid}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ fontWeight: 600, color: t.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{task.title}</span>
      </div>
      <Pill label={cat.label} color={cat.color} bg={`${cat.color}12`} small />
      <span style={{ fontSize: 11, fontWeight: 600, color: pri.color }}>{pri.label}</span>
      <span style={{
        fontSize: 10, fontWeight: 600, color: st.color,
        background: `${st.color}15`, padding: "3px 8px", borderRadius: 50,
        textAlign: "center" as const,
      }}>
        {st.label}
      </span>
      <span style={{ fontSize: 11, color: t.text2 }}>
        {task.assigned_agent ? `${AGENT_EMOJIS[task.assigned_agent] || ""} ${task.assigned_agent}` : "—"}
      </span>
      <motion.span
        animate={overdue ? { opacity: [1, 0.4, 1] } : {}}
        transition={overdue ? { duration: 1.5, repeat: Infinity } : {}}
        style={{ fontSize: 10, color: overdue ? "#EF4444" : t.text3, fontWeight: overdue ? 700 : 400 }}
      >
        {task.due_date ? etDateShort(task.due_date) : "—"}
      </motion.span>
    </motion.div>
  );
}

// ── TaskDetailDrawer ──

function TaskDetailDrawer({ task, t, agents, onClose, onUpdate, hasPermission }: {
  task: MCTask; t: any; agents: { name: string; emoji: string }[];
  onClose: () => void;
  onUpdate: (updated: MCTask) => void;
  hasPermission: (p: string) => boolean;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "checklist" | "activity" | "comments">("details");
  const [activityLog, setActivityLog] = useState<TaskActivityLog[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [editTitle, setEditTitle] = useState(task.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [newCheckItem, setNewCheckItem] = useState("");
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);

  const canEdit = hasPermission(PERMISSIONS.TASK_EDIT);
  const canComment = hasPermission(PERMISSIONS.TASK_COMMENT);
  const canChangeStatus = hasPermission(PERMISSIONS.TASK_CHANGE_STATUS);
  const canChangePriority = hasPermission(PERMISSIONS.TASK_CHANGE_PRIORITY);
  const canEditChecklist = hasPermission(PERMISSIONS.TASK_CHECKLIST_EDIT);
  const canDelete = hasPermission(PERMISSIONS.TASK_DELETE);

  useEffect(() => { setEditTitle(task.title); }, [task.title]);

  // Load activity and comments on tab change
  useEffect(() => {
    if (activeTab === "activity" && activityLog.length === 0) {
      setLoadingActivity(true);
      mcApi<TaskActivityLog[]>(`/tasks/${task.task_uid}/activity`)
        .then(setActivityLog)
        .catch(() => {})
        .finally(() => setLoadingActivity(false));
    }
    if (activeTab === "comments" && comments.length === 0) {
      setLoadingComments(true);
      mcApi<TaskComment[]>(`/tasks/${task.task_uid}/comments`)
        .then(setComments)
        .catch(() => {})
        .finally(() => setLoadingComments(false));
    }
  }, [activeTab, task.task_uid]);

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === "blocked") {
      const reason = prompt("Blocked reason:");
      if (!reason) return;
      try {
        await mcApi(`/tasks/${task.task_uid}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus, blocked_reason: reason }),
        });
        onUpdate({ ...task, status: newStatus, blocked_reason: reason, updated_at: new Date().toISOString() });
        toast.success(`Status → ${TASK_STATUSES[newStatus as keyof typeof TASK_STATUSES]?.label || newStatus}`);
      } catch { toast.error("Failed to update status"); }
      return;
    }
    try {
      await mcApi(`/tasks/${task.task_uid}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      onUpdate({ ...task, status: newStatus, updated_at: new Date().toISOString() });
      toast.success(`Status → ${TASK_STATUSES[newStatus as keyof typeof TASK_STATUSES]?.label || newStatus}`);
    } catch { toast.error("Failed to update status"); }
  };

  const handlePriorityChange = async (newPriority: string) => {
    try {
      await mcApi(`/tasks/${task.task_uid}/priority`, {
        method: "PATCH",
        body: JSON.stringify({ priority: newPriority }),
      });
      onUpdate({ ...task, priority: newPriority, updated_at: new Date().toISOString() });
      toast.success(`Priority → ${newPriority}`);
    } catch { toast.error("Failed to update priority"); }
  };

  const handleTitleSave = async () => {
    if (editTitle.trim() === task.title) { setIsEditingTitle(false); return; }
    try {
      await mcApi(`/tasks/${task.task_uid}`, {
        method: "PUT",
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      onUpdate({ ...task, title: editTitle.trim(), updated_at: new Date().toISOString() });
      setIsEditingTitle(false);
      toast.success("Title updated");
    } catch { toast.error("Failed to update title"); }
  };

  const handleChecklistToggle = async (itemId: string, done: boolean) => {
    try {
      await mcApi(`/tasks/${task.task_uid}/checklist`, {
        method: "PATCH",
        body: JSON.stringify({ item_id: itemId, done }),
      });
      const updated = (task.checklist || []).map(c =>
        c.id === itemId ? { ...c, done, completed_at: done ? new Date().toISOString() : null } : c
      );
      const doneCount = updated.filter(c => c.done).length;
      onUpdate({
        ...task,
        checklist: updated,
        checklist_progress: updated.length > 0 ? (doneCount / updated.length) * 100 : 0,
        updated_at: new Date().toISOString(),
      });
    } catch { toast.error("Failed to update checklist"); }
  };

  const handleAddCheckItem = async () => {
    if (!newCheckItem.trim()) return;
    try {
      await mcApi(`/tasks/${task.task_uid}/checklist`, {
        method: "PATCH",
        body: JSON.stringify({ action: "add", text: newCheckItem.trim() }),
      });
      const newItem: ChecklistItem = {
        id: `chk_${Date.now()}`, text: newCheckItem.trim(), done: false,
        completed_at: null, completed_by: null,
      };
      const updated = [...(task.checklist || []), newItem];
      const doneCount = updated.filter(c => c.done).length;
      onUpdate({
        ...task, checklist: updated,
        checklist_progress: updated.length > 0 ? (doneCount / updated.length) * 100 : 0,
        updated_at: new Date().toISOString(),
      });
      setNewCheckItem("");
    } catch { toast.error("Failed to add checklist item"); }
  };

  const handleRemoveCheckItem = async (itemId: string) => {
    try {
      await mcApi(`/tasks/${task.task_uid}/checklist`, {
        method: "PATCH",
        body: JSON.stringify({ action: "remove", item_id: itemId }),
      });
      const updated = (task.checklist || []).filter(c => c.id !== itemId);
      const doneCount = updated.filter(c => c.done).length;
      onUpdate({
        ...task, checklist: updated,
        checklist_progress: updated.length > 0 ? (doneCount / updated.length) * 100 : 0,
        updated_at: new Date().toISOString(),
      });
    } catch { toast.error("Failed to remove item"); }
  };

  const handleMarkAllDone = async () => {
    try {
      await mcApi(`/tasks/${task.task_uid}/checklist`, {
        method: "PATCH",
        body: JSON.stringify({ action: "mark_all_done" }),
      });
      const updated = (task.checklist || []).map(c => ({
        ...c, done: true, completed_at: new Date().toISOString(),
      }));
      onUpdate({ ...task, checklist: updated, checklist_progress: 100, updated_at: new Date().toISOString() });
      toast.success("All items marked done");
    } catch { toast.error("Failed"); }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      const comment = await mcApi<TaskComment>(`/tasks/${task.task_uid}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: newComment.trim() }),
      });
      setComments(prev => [comment, ...prev]);
      setNewComment("");
      toast.success("Comment added");
    } catch { toast.error("Failed to add comment"); }
  };

  const handleArchive = async () => {
    try {
      await mcApi(`/tasks/${task.task_uid}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "archived" }),
      });
      onUpdate({ ...task, status: "archived", updated_at: new Date().toISOString() });
      toast.success("Task archived");
      onClose();
    } catch { toast.error("Failed to archive"); }
  };

  const tabs = [
    { id: "details" as const, label: "Details" },
    { id: "checklist" as const, label: `Checklist (${task.checklist?.length || 0})` },
    { id: "activity" as const, label: "Activity" },
    { id: "comments" as const, label: "Comments" },
  ];

  const cat = categoryConfig(task.category);
  const pri = priorityConfig(task.priority);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 9998 }}
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: 600 }}
        animate={{ x: 0 }}
        exit={{ x: 600 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        style={{
          position: "fixed", right: 0, top: 0, bottom: 0, width: 600,
          background: t.card, zIndex: 9999, display: "flex", flexDirection: "column",
          boxShadow: "-10px 0 40px rgba(0,0,0,0.15)", overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.tableBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: cat.color,
              background: `${cat.color}15`, padding: "3px 8px", borderRadius: 6,
              fontFamily: "monospace",
            }}>
              {task.task_uid}
            </span>
            <Pill label={cat.label} color={cat.color} bg={`${cat.color}12`} small />
            <span style={{ flex: 1 }} />
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 8, border: "none",
                background: `${t.text3}15`, color: t.text2, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <X size={16} />
            </motion.button>
          </div>

          {/* Title */}
          {isEditingTitle && canEdit ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={e => e.key === "Enter" && handleTitleSave()}
              autoFocus
              style={{
                fontSize: 18, fontWeight: 700, color: t.text, width: "100%",
                border: `2px solid ${t.primary}`, borderRadius: 8, padding: "6px 10px",
                background: "transparent", outline: "none", fontFamily: "inherit",
              }}
            />
          ) : (
            <div
              onClick={() => canEdit && setIsEditingTitle(true)}
              style={{
                fontSize: 18, fontWeight: 700, color: t.text, lineHeight: 1.3,
                cursor: canEdit ? "text" : "default",
              }}
            >
              {task.title}
            </div>
          )}

          {/* Priority + Status selectors */}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {canChangePriority ? (
              <select
                value={task.priority}
                onChange={e => handlePriorityChange(e.target.value)}
                style={{
                  padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${pri.color}40`, background: `${pri.color}10`,
                  color: pri.color, cursor: "pointer", outline: "none", fontFamily: "inherit",
                }}
              >
                {Object.entries(TASK_PRIORITIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            ) : (
              <Pill label={pri.label} color={pri.color} bg={`${pri.color}15`} />
            )}
            {canChangeStatus ? (
              <select
                value={task.status}
                onChange={e => handleStatusChange(e.target.value)}
                style={{
                  padding: "5px 10px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: `1px solid ${statusConfig(task.status).color}40`,
                  background: `${statusConfig(task.status).color}10`,
                  color: statusConfig(task.status).color, cursor: "pointer",
                  outline: "none", fontFamily: "inherit",
                }}
              >
                {Object.entries(TASK_STATUSES).filter(([k]) => k !== "archived").map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            ) : (
              <Pill label={statusConfig(task.status).label} color={statusConfig(task.status).color} bg={`${statusConfig(task.status).color}15`} />
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${t.tableBorder}`, padding: "0 20px" }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "10px 14px", fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? t.primary : t.text2,
                borderBottom: activeTab === tab.id ? `2px solid ${t.primary}` : "2px solid transparent",
                background: "transparent", border: "none", borderBottomStyle: "solid",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {/* Details Tab */}
          {activeTab === "details" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {task.description && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text2, marginBottom: 6 }}>Description</div>
                  <div style={{ fontSize: 13, color: t.text, lineHeight: 1.6, whiteSpace: "pre-wrap" as const }}>{task.description}</div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text2, marginBottom: 4 }}>Assigned Agent</div>
                  <div style={{ fontSize: 13, color: t.text }}>
                    {task.assigned_agent ? `${AGENT_EMOJIS[task.assigned_agent] || ""} ${task.assigned_agent}` : "Unassigned"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text2, marginBottom: 4 }}>Brand</div>
                  <div style={{ fontSize: 13, color: t.text }}>{task.brand_name || "None"}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text2, marginBottom: 4 }}>Due Date</div>
                  <div style={{ fontSize: 13, color: isOverdue(task) ? "#EF4444" : t.text }}>
                    {task.due_date ? etDateShort(task.due_date) : "—"}
                    {isOverdue(task) && " (Overdue)"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text2, marginBottom: 4 }}>Est. Hours</div>
                  <div style={{ fontSize: 13, color: t.text }}>{task.estimated_hours || "—"}</div>
                </div>
              </div>
              {task.collaborator_agents && task.collaborator_agents.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text2, marginBottom: 6 }}>Collaborators</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {task.collaborator_agents.map(a => (
                      <span key={a} style={{
                        fontSize: 11, padding: "3px 10px", borderRadius: 50,
                        background: `${t.primary}10`, color: t.primary, fontWeight: 600,
                      }}>
                        {AGENT_EMOJIS[a] || ""} {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {task.skills_required && task.skills_required.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text2, marginBottom: 6 }}>Skills Required</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {task.skills_required.map(s => (
                      <span key={s} style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 50,
                        background: `${t.teal}15`, color: t.teal, fontWeight: 600,
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {task.notes && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text2, marginBottom: 6 }}>Notes</div>
                  <div style={{
                    fontSize: 12, color: t.text, lineHeight: 1.6,
                    padding: 12, borderRadius: 8, background: `${t.primary}05`,
                    whiteSpace: "pre-wrap" as const,
                  }}>
                    {task.notes}
                  </div>
                </div>
              )}
              {task.tags && task.tags.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text2, marginBottom: 6 }}>Tags</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {task.tags.map(tag => (
                      <span key={tag} style={{
                        fontSize: 10, padding: "3px 8px", borderRadius: 50,
                        background: `${t.purple}10`, color: t.purple, fontWeight: 600,
                      }}>
                        <Tag size={9} style={{ marginRight: 3 }} />{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {task.reference_docs && task.reference_docs.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text2, marginBottom: 6 }}>References</div>
                  {task.reference_docs.map((ref, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                      borderBottom: `1px solid ${t.tableBorder}`,
                    }}>
                      <Paperclip size={12} color={t.text3} />
                      <span style={{ fontSize: 12, color: t.primary, fontWeight: 500 }}>{ref.title}</span>
                      {ref.url && <ExternalLink size={10} color={t.text3} />}
                    </div>
                  ))}
                </div>
              )}
              {task.depends_on && task.depends_on.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: t.text2, marginBottom: 6 }}>Dependencies</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {task.depends_on.map(dep => (
                      <span key={dep} style={{
                        fontSize: 10, fontFamily: "monospace", padding: "3px 8px",
                        borderRadius: 6, background: `${t.yellow}15`, color: t.yellow, fontWeight: 700,
                      }}>
                        {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {task.blocked_reason && task.status === "blocked" && (
                <div style={{
                  padding: 12, borderRadius: 8, background: "#FEF2F2",
                  border: "1px solid #FEE2E2",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>Blocked Reason</div>
                  <div style={{ fontSize: 12, color: "#991B1B" }}>{task.blocked_reason}</div>
                </div>
              )}
              <div style={{ fontSize: 10, color: t.text3, marginTop: 8 }}>
                Source: {task.source || "manual"}
              </div>
            </div>
          )}

          {/* Checklist Tab */}
          {activeTab === "checklist" && (
            <div>
              {/* Progress bar */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: t.text }}>
                    {task.checklist?.filter(c => c.done).length || 0} / {task.checklist?.length || 0} complete
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.green }}>
                    {Math.round(task.checklist_progress || 0)}%
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: `${t.green}20` }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${task.checklist_progress || 0}%` }}
                    style={{ height: "100%", borderRadius: 3, background: t.green }}
                  />
                </div>
              </div>

              {/* Items */}
              {(task.checklist || []).map(item => (
                <motion.div
                  key={item.id}
                  layout
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
                    borderBottom: `1px solid ${t.tableBorder}`,
                    opacity: item.done ? 0.6 : 1,
                  }}
                >
                  <motion.button
                    whileTap={{ scale: 0.8 }}
                    onClick={() => canEditChecklist && handleChecklistToggle(item.id, !item.done)}
                    style={{
                      border: "none", background: "transparent", cursor: canEditChecklist ? "pointer" : "default",
                      color: item.done ? t.green : t.text3, padding: 0, display: "flex",
                    }}
                  >
                    {item.done ? <CheckSquare size={18} /> : <Square size={18} />}
                  </motion.button>
                  <span style={{
                    flex: 1, fontSize: 13, color: t.text,
                    textDecoration: item.done ? "line-through" : "none",
                  }}>
                    {item.text}
                  </span>
                  {canEditChecklist && (
                    <motion.button
                      whileTap={{ scale: 0.8 }}
                      onClick={() => handleRemoveCheckItem(item.id)}
                      style={{
                        border: "none", background: "transparent", cursor: "pointer",
                        color: t.text3, padding: 2, display: "flex",
                      }}
                    >
                      <X size={14} />
                    </motion.button>
                  )}
                </motion.div>
              ))}

              {/* Add new item */}
              {canEditChecklist && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input
                    value={newCheckItem}
                    onChange={e => setNewCheckItem(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddCheckItem()}
                    placeholder="Add checklist item..."
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 12,
                      border: `1px solid ${t.inputBorder}`, background: t.bg,
                      color: t.text, outline: "none", fontFamily: "inherit",
                    }}
                  />
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAddCheckItem}
                    style={{
                      padding: "8px 14px", borderRadius: 8, border: "none",
                      background: t.primary, color: "#fff", fontSize: 12,
                      fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    Add
                  </motion.button>
                </div>
              )}

              {/* Mark all done */}
              {canEditChecklist && (task.checklist || []).some(c => !c.done) && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleMarkAllDone}
                  style={{
                    marginTop: 12, padding: "8px 16px", borderRadius: 8,
                    border: `1px solid ${t.green}40`, background: `${t.green}10`,
                    color: t.green, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit", width: "100%",
                  }}
                >
                  Mark All Done
                </motion.button>
              )}
            </div>
          )}

          {/* Activity Tab */}
          {activeTab === "activity" && (
            <div>
              {loadingActivity ? (
                <div style={{ textAlign: "center", padding: 40, color: t.text3, fontSize: 13 }}>Loading...</div>
              ) : activityLog.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: t.text3, fontSize: 13 }}>No activity yet</div>
              ) : (
                activityLog.map(log => (
                  <div key={log.id} style={{
                    display: "flex", gap: 10, padding: "10px 0",
                    borderBottom: `1px solid ${t.tableBorder}`,
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>
                      {AGENT_EMOJIS[log.actor] || "👤"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: t.text }}>
                        <strong>{log.actor}</strong>{" "}
                        {log.action === "status_changed" && log.details
                          ? `changed status from ${log.details.from} → ${log.details.to}`
                          : log.action === "assigned" && log.details
                          ? `assigned to ${log.details.agent}`
                          : log.action === "checklist_updated" && log.details
                          ? `${log.details.done ? "completed" : "unchecked"}: "${log.details.text}"`
                          : log.action === "priority_changed" && log.details
                          ? `changed priority ${log.details.from} → ${log.details.to}`
                          : log.action === "comment_added"
                          ? "added a comment"
                          : log.action.replace(/_/g, " ")}
                      </div>
                      <div style={{ fontSize: 10, color: t.text3, marginTop: 2 }}>
                        {etRelative(log.timestamp)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Comments Tab */}
          {activeTab === "comments" && (
            <div>
              {/* New comment */}
              {canComment && (
                <div style={{ marginBottom: 16 }}>
                  <textarea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    placeholder="Write a comment... (use @name to mention)"
                    style={{
                      width: "100%", minHeight: 70, padding: 12, borderRadius: 10,
                      border: `1px solid ${t.inputBorder}`, background: t.bg,
                      color: t.text, fontSize: 12, outline: "none", resize: "vertical" as const,
                      fontFamily: "inherit", lineHeight: 1.5,
                    }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={handleAddComment}
                      style={{
                        padding: "8px 16px", borderRadius: 8, border: "none",
                        background: t.primary, color: "#fff", fontSize: 12,
                        fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        display: "flex", alignItems: "center", gap: 6,
                      }}
                    >
                      <Send size={12} /> Comment
                    </motion.button>
                  </div>
                </div>
              )}

              {/* Comments list */}
              {loadingComments ? (
                <div style={{ textAlign: "center", padding: 40, color: t.text3, fontSize: 13 }}>Loading...</div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: t.text3, fontSize: 13 }}>No comments yet</div>
              ) : (
                comments.map(c => (
                  <div key={c.id} style={{
                    padding: "12px 0",
                    borderBottom: `1px solid ${t.tableBorder}`,
                    marginLeft: c.parent_comment_id ? 24 : 0,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      {!c.is_system_message && (
                        <span style={{ fontSize: 14 }}>{AGENT_EMOJIS[c.author] || "👤"}</span>
                      )}
                      <span style={{
                        fontSize: 12, fontWeight: c.is_system_message ? 400 : 600,
                        color: c.is_system_message ? t.text3 : t.text,
                        fontStyle: c.is_system_message ? "italic" : "normal",
                      }}>
                        {c.author}
                      </span>
                      <span style={{ fontSize: 10, color: t.text3 }}>{etRelative(c.created_at)}</span>
                    </div>
                    <div style={{
                      fontSize: 13, color: c.is_system_message ? t.text3 : t.text,
                      fontStyle: c.is_system_message ? "italic" : "normal",
                      lineHeight: 1.5, whiteSpace: "pre-wrap" as const,
                    }}>
                      {c.content}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 20px", borderTop: `1px solid ${t.tableBorder}`,
          display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: t.text3,
        }}>
          <span>Created by {task.created_by || "—"} · {etRelative(task.created_at)}</span>
          <span style={{ flex: 1 }} />
          {task.status === "done" && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleArchive}
              style={{
                padding: "6px 12px", borderRadius: 8, border: `1px solid ${t.text3}30`,
                background: "transparent", color: t.text3, fontSize: 11,
                cursor: "pointer", fontFamily: "inherit", display: "flex",
                alignItems: "center", gap: 4,
              }}
            >
              <Archive size={12} /> Archive
            </motion.button>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ── CreateTaskModal ──

function CreateTaskModal({ t, agents, brands, onClose, onCreate }: {
  t: any;
  agents: { name: string; emoji: string }[];
  brands: { name: string }[];
  onClose: () => void;
  onCreate: (task: MCTask) => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");
  const [assignedAgent, setAssignedAgent] = useState("");
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [brandName, setBrandName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [hours, setHours] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [notes, setNotes] = useState("");
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [checkInput, setCheckInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!category) { toast.error("Category is required"); return; }
    setSubmitting(true);
    try {
      const body: any = {
        title: title.trim(),
        category,
        priority,
        source: "manual",
      };
      if (description.trim()) body.description = description.trim();
      if (assignedAgent) body.assigned_agent = assignedAgent;
      if (collaborators.length > 0) body.collaborator_agents = collaborators;
      if (brandName) body.brand_name = brandName;
      if (dueDate) body.due_date = new Date(dueDate).toISOString();
      if (hours) body.estimated_hours = parseFloat(hours);
      if (skills.length > 0) body.skills_required = skills;
      if (tags.length > 0) body.tags = tags;
      if (notes.trim()) body.notes = notes.trim();
      if (checklistItems.length > 0) {
        body.checklist = checklistItems.map(text => ({ text, done: false }));
      }

      const task = await mcApi<MCTask>("/tasks", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCreate(task);
      toast.success(`Task ${task.task_uid} created`);
      onClose();
    } catch {
      toast.error("Failed to create task");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 13,
    border: `1px solid ${t.inputBorder}`, background: t.bg, color: t.text,
    outline: "none", fontFamily: "inherit",
  };
  const labelStyle = {
    fontSize: 11, fontWeight: 600 as const, color: t.text2,
    display: "block" as const, marginBottom: 5,
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: t.card, borderRadius: 20, padding: 28, width: 560,
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: t.text }}>New Task</h3>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onClose}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: t.text2, padding: 4 }}>
            <X size={20} />
          </motion.button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..."
              style={inputStyle} />
          </div>

          {/* Category + Priority */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Category *</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {Object.entries(TASK_CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {Object.entries(TASK_PRIORITIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Task description..."
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" as const }} />
          </div>

          {/* Agent + Brand */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Assigned Agent</label>
              <select value={assignedAgent} onChange={e => setAssignedAgent(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">Unassigned</option>
                {agents.map(a => (
                  <option key={a.name} value={a.name}>{a.emoji} {a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Brand</label>
              <select value={brandName} onChange={e => setBrandName(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">None</option>
                {brands.map(b => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
                <option value="All">All Brands</option>
              </select>
            </div>
          </div>

          {/* Collaborators */}
          <div>
            <label style={labelStyle}>Collaborators</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
              {collaborators.map(c => (
                <span key={c} style={{
                  fontSize: 11, padding: "3px 8px", borderRadius: 50,
                  background: `${t.primary}10`, color: t.primary, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  {AGENT_EMOJIS[c] || ""} {c}
                  <X size={10} style={{ cursor: "pointer" }} onClick={() => setCollaborators(prev => prev.filter(x => x !== c))} />
                </span>
              ))}
            </div>
            <select
              value=""
              onChange={e => { if (e.target.value && !collaborators.includes(e.target.value)) setCollaborators(prev => [...prev, e.target.value]); }}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="">Add collaborator...</option>
              {agents.filter(a => a.name !== assignedAgent && !collaborators.includes(a.name)).map(a => (
                <option key={a.name} value={a.name}>{a.emoji} {a.name}</option>
              ))}
            </select>
          </div>

          {/* Due Date + Hours */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Estimated Hours</label>
              <input type="number" value={hours} onChange={e => setHours(e.target.value)}
                placeholder="0" min="0" step="0.5" style={inputStyle} />
            </div>
          </div>

          {/* Skills */}
          <div>
            <label style={labelStyle}>Skills Required</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: skills.length > 0 ? 6 : 0 }}>
              {skills.map(s => (
                <span key={s} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 50,
                  background: `${t.teal}15`, color: t.teal, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  {s}
                  <X size={9} style={{ cursor: "pointer" }} onClick={() => setSkills(prev => prev.filter(x => x !== s))} />
                </span>
              ))}
            </div>
            <input
              value={skillInput}
              onChange={e => setSkillInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && skillInput.trim()) {
                  e.preventDefault();
                  if (!skills.includes(skillInput.trim())) setSkills(prev => [...prev, skillInput.trim()]);
                  setSkillInput("");
                }
              }}
              placeholder="Type skill and press Enter..."
              style={inputStyle}
            />
          </div>

          {/* Tags */}
          <div>
            <label style={labelStyle}>Tags</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: tags.length > 0 ? 6 : 0 }}>
              {tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 50,
                  background: `${t.purple}10`, color: t.purple, fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  {tag}
                  <X size={9} style={{ cursor: "pointer" }} onClick={() => setTags(prev => prev.filter(x => x !== tag))} />
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && tagInput.trim()) {
                  e.preventDefault();
                  if (!tags.includes(tagInput.trim())) setTags(prev => [...prev, tagInput.trim()]);
                  setTagInput("");
                }
              }}
              placeholder="Type tag and press Enter..."
              style={inputStyle}
            />
          </div>

          {/* Notes */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Additional notes..."
              style={{ ...inputStyle, minHeight: 50, resize: "vertical" as const }} />
          </div>

          {/* Checklist */}
          <div>
            <label style={labelStyle}>Checklist</label>
            {checklistItems.map((item, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 4,
              }}>
                <Square size={14} color={t.text3} />
                <span style={{ flex: 1, fontSize: 12, color: t.text }}>{item}</span>
                <X size={12} style={{ cursor: "pointer", color: t.text3 }}
                  onClick={() => setChecklistItems(prev => prev.filter((_, j) => j !== i))} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={checkInput}
                onChange={e => setCheckInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && checkInput.trim()) {
                    e.preventDefault();
                    setChecklistItems(prev => [...prev, checkInput.trim()]);
                    setCheckInput("");
                  }
                }}
                placeholder="Add checklist item..."
                style={{ ...inputStyle, flex: 1 }}
              />
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (checkInput.trim()) {
                    setChecklistItems(prev => [...prev, checkInput.trim()]);
                    setCheckInput("");
                  }
                }}
                style={{
                  padding: "8px 14px", borderRadius: 10, border: "none",
                  background: `${t.primary}15`, color: t.primary, fontSize: 12,
                  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Add
              </motion.button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24 }}>
          <button onClick={onClose}
            style={{
              padding: "10px 20px", borderRadius: 10,
              border: `1px solid ${t.inputBorder}`, background: "transparent",
              color: t.text2, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
            }}>
            Cancel
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: submitting ? t.text3 : t.primary, color: "#fff",
              fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer",
              fontSize: 13, fontFamily: "inherit",
            }}
          >
            {submitting ? "Creating..." : "Create Task"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main TasksPage ──

export default function TasksPage() {
  const { tasks, agents, brands, t, isDark, loading, loadData } = useMC();
  const hasPermission = useCallback((p: string) => {
    if (typeof window === "undefined") return true;
    const permsRaw = sessionStorage.getItem("mc_permissions");
    if (!permsRaw) return true; // fallback: allow if no permissions stored (backward compat)
    try { return JSON.parse(permsRaw).includes(p); } catch { return true; }
  }, []);

  const canCreate = hasPermission(PERMISSIONS.TASK_CREATE);
  const canDrag = hasPermission(PERMISSIONS.TASK_CHANGE_STATUS);

  // ── State ──
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("priority");
  const [selectedTask, setSelectedTask] = useState<MCTask | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [localTasks, setLocalTasks] = useState<MCTask[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Sync tasks from context
  useEffect(() => {
    if (tasks.length > 0 || initialized) {
      setLocalTasks(tasks);
      if (!initialized) setInitialized(true);
    }
  }, [tasks]);

  const allTasks = localTasks;

  // ── Filtering ──
  const filtered = useMemo(() => {
    let result = allTasks.filter(task => task.status !== "archived");

    if (filterCategory !== "all") result = result.filter(t => t.category === filterCategory);
    if (filterPriority !== "all") result = result.filter(t => t.priority === filterPriority);
    if (filterStatus !== "all") result = result.filter(t => t.status === filterStatus);
    if (filterAgent !== "all") result = result.filter(t => t.assigned_agent === filterAgent);
    if (filterBrand !== "all") result = result.filter(t => t.brand_name === filterBrand);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q) ||
        t.task_uid.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "priority") return (PRIORITY_ORDER[a.priority] ?? 99) - (PRIORITY_ORDER[b.priority] ?? 99);
      if (sortBy === "created_at") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === "due_date") {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      if (sortBy === "updated_at") return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      return 0;
    });

    return result;
  }, [allTasks, filterCategory, filterPriority, filterStatus, filterAgent, filterBrand, search, sortBy]);

  // ── Handlers ──
  const handleStatusChange = useCallback(async (taskUid: string, newStatus: string) => {
    setLocalTasks(prev => prev.map(t =>
      t.task_uid === taskUid ? { ...t, status: newStatus, updated_at: new Date().toISOString() } : t
    ));
    try {
      await mcApi(`/tasks/${taskUid}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(`Task moved to ${TASK_STATUSES[newStatus as keyof typeof TASK_STATUSES]?.label || newStatus}`);
    } catch {
      toast.error("Failed to update task");
      loadData(); // revert
    }
  }, [loadData]);

  const handleTaskUpdate = useCallback((updated: MCTask) => {
    setLocalTasks(prev => prev.map(t => t.task_uid === updated.task_uid ? updated : t));
    if (selectedTask?.task_uid === updated.task_uid) setSelectedTask(updated);
  }, [selectedTask]);

  const handleTaskCreate = useCallback((task: MCTask) => {
    setLocalTasks(prev => [task, ...prev]);
  }, []);

  const agentList = useMemo(() =>
    agents.map(a => ({ name: a.name, emoji: a.emoji })),
    [agents]
  );
  const brandList = useMemo(() =>
    brands.map(b => ({ name: b.name })),
    [brands]
  );

  // Group helpers
  const tasksByStatus = (status: string) => filtered.filter(t => t.status === status);
  const tasksByCategory = useMemo(() => {
    const groups: Record<string, MCTask[]> = {};
    filtered.forEach(t => {
      if (!groups[t.category]) groups[t.category] = [];
      groups[t.category].push(t);
    });
    return groups;
  }, [filtered]);
  const tasksByAgent = useMemo(() => {
    const groups: Record<string, MCTask[]> = {};
    filtered.forEach(t => {
      const key = t.assigned_agent || "Unassigned";
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return groups;
  }, [filtered]);

  const viewIcons: Record<ViewMode, any> = {
    kanban: LayoutGrid,
    list: List,
    category: Layers,
    agent: Users,
  };

  return (
    <div style={{ padding: 20, height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text }}>Task Board</h1>
          <p style={{ fontSize: 12, color: t.text2, marginTop: 2 }}>
            {filtered.length} tasks · {allTasks.filter(t => t.status === "done").length} done
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* View mode toggle */}
          <div style={{
            display: "flex", gap: 2, background: isDark ? t.sidebarHover : "#F0F3F8",
            borderRadius: 10, padding: 3,
          }}>
            {(["kanban", "list", "category", "agent"] as ViewMode[]).map(mode => {
              const Icon = viewIcons[mode];
              return (
                <motion.button
                  key={mode}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: "6px 10px", borderRadius: 8, border: "none",
                    background: viewMode === mode ? t.primary : "transparent",
                    color: viewMode === mode ? "#fff" : t.text2,
                    cursor: "pointer", fontFamily: "inherit", fontSize: 11,
                    fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <Icon size={13} />
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </motion.button>
              );
            })}
          </div>

          {canCreate && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowCreate(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
                borderRadius: 50, border: "none", background: t.primary, color: "#fff",
                fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <Plus size={14} /> New Task
            </motion.button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center",
      }}>
        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: t.card, border: `1px solid ${t.inputBorder}`,
          borderRadius: 50, padding: "6px 12px",
        }}>
          <Search size={12} color={t.text2} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              border: "none", outline: "none", background: "transparent",
              fontSize: 11, color: t.text, width: 120, fontFamily: "inherit",
            }}
          />
        </div>

        {/* Category */}
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: 50, border: `1px solid ${t.inputBorder}`,
            background: filterCategory !== "all" ? `${categoryConfig(filterCategory).color}15` : t.card,
            color: filterCategory !== "all" ? categoryConfig(filterCategory).color : t.text2,
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", outline: "none",
          }}>
          <option value="all">All Categories</option>
          {Object.entries(TASK_CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* Priority */}
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: 50, border: `1px solid ${t.inputBorder}`,
            background: filterPriority !== "all" ? `${priorityConfig(filterPriority).color}15` : t.card,
            color: filterPriority !== "all" ? priorityConfig(filterPriority).color : t.text2,
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", outline: "none",
          }}>
          <option value="all">All Priorities</option>
          {Object.entries(TASK_PRIORITIES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* Status */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: 50, border: `1px solid ${t.inputBorder}`,
            background: filterStatus !== "all" ? `${statusConfig(filterStatus).color}15` : t.card,
            color: filterStatus !== "all" ? statusConfig(filterStatus).color : t.text2,
            fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", outline: "none",
          }}>
          <option value="all">All Statuses</option>
          {Object.entries(TASK_STATUSES).filter(([k]) => k !== "archived").map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* Agent */}
        <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: 50, border: `1px solid ${t.inputBorder}`,
            background: t.card, color: t.text2, fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", outline: "none",
          }}>
          <option value="all">All Agents</option>
          {agents.map(a => (
            <option key={a.id} value={a.name}>{a.emoji} {a.name}</option>
          ))}
        </select>

        {/* Brand */}
        <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: 50, border: `1px solid ${t.inputBorder}`,
            background: t.card, color: t.text2, fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", outline: "none",
          }}>
          <option value="all">All Brands</option>
          {brands.map(b => (
            <option key={b.name} value={b.name}>{b.name}</option>
          ))}
        </select>

        {/* Sort */}
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: 50, border: `1px solid ${t.inputBorder}`,
            background: t.card, color: t.text2, fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit", outline: "none", marginLeft: "auto",
          }}>
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* ── Views ── */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {/* Kanban View */}
        {viewMode === "kanban" && (
          <div style={{ display: "flex", gap: 12, minHeight: 0, height: "100%", paddingBottom: 8 }}>
            {KANBAN_COLUMNS.map(col => {
              const colTasks = tasksByStatus(col.id);
              const colStatus = TASK_STATUSES[col.id as keyof typeof TASK_STATUSES];
              return (
                <div key={col.id} style={{ minWidth: 240, flex: "1 1 240px", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13 }}>{col.icon}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{col.label}</span>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                      background: `${colStatus.color}15`, color: colStatus.color,
                    }}>
                      {colTasks.length}
                    </span>
                  </div>
                  <div
                    onDragOver={e => { e.preventDefault(); setDragOverCol(col.id); }}
                    onDragLeave={() => setDragOverCol(null)}
                    onDrop={e => {
                      e.preventDefault();
                      setDragOverCol(null);
                      const uid = e.dataTransfer.getData("taskUid");
                      if (uid) handleStatusChange(uid, col.id);
                    }}
                    style={{
                      background: dragOverCol === col.id
                        ? `${colStatus.color}10`
                        : isDark ? t.sidebarHover : "#F8FAFC",
                      borderRadius: 14,
                      padding: 8,
                      minHeight: 200,
                      flex: 1,
                      border: dragOverCol === col.id
                        ? `2px solid ${colStatus.color}40`
                        : `2px dashed ${t.cardBorder}`,
                      transition: "all 0.15s",
                      overflowY: "auto",
                    }}
                  >
                    <AnimatePresence mode="popLayout">
                      {colTasks.map(task => (
                        <TaskCard
                          key={task.task_uid}
                          task={task}
                          t={t}
                          onClick={() => setSelectedTask(task)}
                          onStatusChange={handleStatusChange}
                          canDrag={canDrag}
                        />
                      ))}
                    </AnimatePresence>
                    {colTasks.length === 0 && (
                      <div style={{ textAlign: "center", padding: "40px 16px", color: t.text3, fontSize: 11 }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>⬜</div>
                        Drop tasks here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List View */}
        {viewMode === "list" && (
          <div style={{ background: t.card, borderRadius: 14, overflow: "hidden", border: `1px solid ${t.cardBorder}` }}>
            {/* Header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "100px 1fr 100px 90px 90px 120px 80px",
              gap: 8, padding: "10px 14px",
              borderBottom: `2px solid ${t.tableBorder}`,
              fontSize: 10, fontWeight: 700, color: t.text3,
              textTransform: "uppercase" as const, letterSpacing: 1,
            }}>
              <span>UID</span><span>Title</span><span>Category</span><span>Priority</span>
              <span>Status</span><span>Agent</span><span>Due</span>
            </div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: t.text3, fontSize: 13 }}>No tasks found</div>
            ) : (
              filtered.map(task => (
                <TaskRow key={task.task_uid} task={task} t={t} onClick={() => setSelectedTask(task)} />
              ))
            )}
          </div>
        )}

        {/* Category View */}
        {viewMode === "category" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {Object.entries(tasksByCategory).map(([cat, tasks]) => {
              const cfg = categoryConfig(cat);
              return (
                <div key={cat}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
                    padding: "8px 14px", borderRadius: 10,
                    background: `${cfg.color}10`, borderLeft: `4px solid ${cfg.color}`,
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                      background: `${cfg.color}20`, color: cfg.color,
                    }}>
                      {tasks.length}
                    </span>
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 10,
                  }}>
                    {tasks.map(task => (
                      <TaskCard
                        key={task.task_uid}
                        task={task}
                        t={t}
                        onClick={() => setSelectedTask(task)}
                        onStatusChange={handleStatusChange}
                        canDrag={false}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
            {Object.keys(tasksByCategory).length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: t.text3, fontSize: 13 }}>No tasks found</div>
            )}
          </div>
        )}

        {/* Agent View */}
        {viewMode === "agent" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {Object.entries(tasksByAgent).map(([agentName, tasks]) => (
              <div key={agentName}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 10,
                  padding: "8px 14px", borderRadius: 10,
                  background: `${t.primary}08`, borderLeft: `4px solid ${t.primary}`,
                }}>
                  <span style={{ fontSize: 16 }}>{AGENT_EMOJIS[agentName] || "👤"}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: t.text }}>{agentName}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10,
                    background: `${t.primary}15`, color: t.primary,
                  }}>
                    {tasks.length} tasks
                  </span>
                </div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 10,
                }}>
                  {tasks.map(task => (
                    <TaskCard
                      key={task.task_uid}
                      task={task}
                      t={t}
                      onClick={() => setSelectedTask(task)}
                      onStatusChange={handleStatusChange}
                      canDrag={false}
                    />
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(tasksByAgent).length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: t.text3, fontSize: 13 }}>No tasks found</div>
            )}
          </div>
        )}
      </div>

      {/* ── Drawer ── */}
      <AnimatePresence>
        {selectedTask && (
          <TaskDetailDrawer
            task={selectedTask}
            t={t}
            agents={agentList}
            onClose={() => setSelectedTask(null)}
            onUpdate={handleTaskUpdate}
            hasPermission={hasPermission}
          />
        )}
      </AnimatePresence>

      {/* ── Create Modal ── */}
      <AnimatePresence>
        {showCreate && (
          <CreateTaskModal
            t={t}
            agents={agentList}
            brands={brandList}
            onClose={() => setShowCreate(false)}
            onCreate={handleTaskCreate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
