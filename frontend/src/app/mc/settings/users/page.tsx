"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Shield, Eye, UserCog, Crown, UserCheck, ChevronDown,
  ToggleLeft, ToggleRight, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useMC, mcApi } from "../../context";
import { etRelative } from "../../helpers";
import { ROLE_LABELS, PERMISSIONS } from "../../types";
import type { MCUser } from "../../types";

// ── Role hierarchy for permission preview ──
const ROLE_HIERARCHY = ["viewer", "agent_manager", "operator", "admin", "owner"];

const ROLE_PERMISSION_SUMMARY: Record<string, string[]> = {
  viewer: ["View dashboard", "View tasks", "View agents", "View comms", "View files"],
  agent_manager: ["Create/edit tasks", "Assign tasks", "Rate agents", "Send commands (own dept)"],
  operator: ["Change priority", "Broadcast messages", "Manage content", "Trigger cron jobs", "Delete tasks"],
  admin: ["Manage users", "Edit agents", "Edit brands", "View credentials", "Manage cron"],
  owner: ["Manage admins", "Full system access"],
};

const ROLE_ICONS: Record<string, any> = {
  viewer: Eye,
  agent_manager: UserCheck,
  operator: UserCog,
  admin: Shield,
  owner: Crown,
};

// ── Access Denied ──
function AccessDenied({ t, role }: { t: any; role?: string }) {
  return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <Lock size={48} color={t.text3} style={{ marginBottom: 16 }} />
      <h2 style={{ fontSize: 20, fontWeight: 700, color: t.text, marginBottom: 8 }}>Access Denied</h2>
      <p style={{ fontSize: 14, color: t.text2 }}>
        You don't have permission to view this page.
        {role && (
          <span style={{ display: "block", marginTop: 8 }}>
            Your role: <span style={{
              fontWeight: 700,
              color: ROLE_LABELS[role]?.color || t.text,
            }}>{ROLE_LABELS[role]?.label || role}</span>
          </span>
        )}
      </p>
    </div>
  );
}

// ── Create User Modal ──
function CreateUserModal({ t, onClose, onCreated }: {
  t: any; onClose: () => void; onCreated: (user: MCUser) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [brandAccess, setBrandAccess] = useState<string[]>([]);
  const [deptAccess, setDeptAccess] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const brands = ["Plentum", "Mavena Co", "PawFully"];
  const departments = ["Leadership", "Growth", "Revenue", "Operations", "QA", "Engineering", "Finance"];

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error("Name, email, and password are required");
      return;
    }
    setSubmitting(true);
    try {
      const body: any = { name: name.trim(), email: email.trim(), password, role };
      if (brandAccess.length > 0) body.brand_access = brandAccess;
      if (deptAccess.length > 0) body.department_access = deptAccess;
      const user = await mcApi<MCUser>("/users", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onCreated(user);
      toast.success(`User ${user.name} created`);
      onClose();
    } catch {
      toast.error("Failed to create user");
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
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        style={{
          background: t.card, borderRadius: 20, padding: 28, width: 520,
          maxHeight: "90vh", overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: t.text }}>Create User</h3>
          <motion.button whileTap={{ scale: 0.9 }} onClick={onClose}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: t.text2, padding: 4 }}>
            <X size={20} />
          </motion.button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email *</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.com" type="email" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Password *</label>
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" type="password" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {ROLE_HIERARCHY.filter(r => r !== "owner").map(r => (
                <option key={r} value={r}>{ROLE_LABELS[r]?.label || r}</option>
              ))}
            </select>
          </div>

          {/* Permission preview */}
          <div style={{
            padding: 14, borderRadius: 12, background: `${t.primary}05`,
            border: `1px solid ${t.primary}15`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.primary, marginBottom: 8 }}>
              Permissions for {ROLE_LABELS[role]?.label || role}
            </div>
            {ROLE_HIERARCHY.slice(0, ROLE_HIERARCHY.indexOf(role) + 1).map(r => (
              <div key={r} style={{ marginBottom: 4 }}>
                {ROLE_PERMISSION_SUMMARY[r]?.map(perm => (
                  <div key={perm} style={{
                    fontSize: 11, color: t.text2, padding: "2px 0",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{ color: t.green, fontSize: 10 }}>✓</span> {perm}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div>
            <label style={labelStyle}>Brand Access (empty = all brands)</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {brands.map(b => (
                <motion.button
                  key={b}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setBrandAccess(prev =>
                    prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]
                  )}
                  style={{
                    padding: "5px 12px", borderRadius: 50, fontSize: 11, fontWeight: 600,
                    border: brandAccess.includes(b) ? `2px solid ${t.primary}` : `2px solid ${t.inputBorder}`,
                    background: brandAccess.includes(b) ? `${t.primary}15` : "transparent",
                    color: brandAccess.includes(b) ? t.primary : t.text2,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {b}
                </motion.button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Department Access (empty = all departments)</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {departments.map(d => (
                <motion.button
                  key={d}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setDeptAccess(prev =>
                    prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
                  )}
                  style={{
                    padding: "5px 12px", borderRadius: 50, fontSize: 11, fontWeight: 600,
                    border: deptAccess.includes(d) ? `2px solid ${t.teal}` : `2px solid ${t.inputBorder}`,
                    background: deptAccess.includes(d) ? `${t.teal}15` : "transparent",
                    color: deptAccess.includes(d) ? t.teal : t.text2,
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {d}
                </motion.button>
              ))}
            </div>
          </div>
        </div>

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
            {submitting ? "Creating..." : "Create User"}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ──
export default function UsersPage() {
  const { t, isDark, user, hasPermission } = useMC();
  const [users, setUsers] = useState<MCUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<MCUser | null>(null);
  const [editRole, setEditRole] = useState("");

  const canManage = hasPermission(PERMISSIONS.USER_MANAGE);

  // Access denied check
  if (!canManage) {
    return <AccessDenied t={t} role={user?.role} />;
  }

  useEffect(() => {
    setLoading(true);
    mcApi<MCUser[]>("/users")
      .then(setUsers)
      .catch(() => toast.error("Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await mcApi(`/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole as MCUser["role"] } : u));
      setEditingUser(null);
      toast.success("Role updated");
    } catch {
      toast.error("Failed to update role");
    }
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    try {
      if (currentlyActive) {
        await mcApi(`/users/${userId}`, { method: "DELETE" });
      } else {
        await mcApi(`/users/${userId}`, {
          method: "PUT",
          body: JSON.stringify({ is_active: true }),
        });
      }
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, is_active: !currentlyActive } as any : u
      ));
      toast.success(currentlyActive ? "User deactivated" : "User reactivated");
    } catch {
      toast.error("Failed to update user");
    }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text }}>User Management</h1>
          <p style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>
            {users.length} users · {users.filter((u: any) => u.is_active !== false).length} active
          </p>
        </div>
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
          <Plus size={14} /> Create User
        </motion.button>
      </div>

      {/* Users Table */}
      <div style={{
        background: t.card, borderRadius: 16, overflow: "hidden",
        border: `1px solid ${t.cardBorder}`,
      }}>
        {/* Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr 100px 140px 120px 100px 80px",
          gap: 8, padding: "12px 16px",
          borderBottom: `2px solid ${t.tableBorder}`,
          fontSize: 10, fontWeight: 700, color: t.text3,
          textTransform: "uppercase" as const, letterSpacing: 1,
        }}>
          <span>Name</span><span>Email</span><span>Role</span>
          <span>Brand Access</span><span>Last Login</span><span>Status</span><span></span>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: t.text3, fontSize: 13 }}>Loading...</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: t.text3, fontSize: 13 }}>No users found</div>
        ) : (
          users.map(u => {
            const roleInfo = ROLE_LABELS[u.role];
            const RoleIcon = ROLE_ICONS[u.role] || Eye;
            const isActive = (u as any).is_active !== false;
            const isEditing = editingUser?.id === u.id;

            return (
              <motion.div
                key={u.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1.2fr 100px 140px 120px 100px 80px",
                  gap: 8, padding: "12px 16px",
                  borderBottom: `1px solid ${t.tableBorder}`,
                  alignItems: "center", fontSize: 12,
                  opacity: isActive ? 1 : 0.5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: `linear-gradient(135deg, ${roleInfo?.color || t.primary}40, ${roleInfo?.color || t.primary}20)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: roleInfo?.color || t.primary,
                  }}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 600, color: t.text }}>{u.name}</span>
                </div>
                <span style={{ color: t.text2, fontSize: 11 }}>{u.email}</span>
                <div>
                  {isEditing ? (
                    <select
                      value={editRole}
                      onChange={e => {
                        setEditRole(e.target.value);
                        handleRoleChange(u.id, e.target.value);
                      }}
                      style={{
                        padding: "3px 6px", borderRadius: 6, fontSize: 10,
                        border: `1px solid ${t.inputBorder}`, background: t.bg,
                        color: t.text, cursor: "pointer", outline: "none", fontFamily: "inherit",
                      }}
                    >
                      {ROLE_HIERARCHY.map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]?.label || r}</option>
                      ))}
                    </select>
                  ) : (
                    <span
                      onClick={() => { setEditingUser(u); setEditRole(u.role); }}
                      style={{
                        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 50,
                        background: `${roleInfo?.color || t.text3}15`,
                        color: roleInfo?.color || t.text3,
                        cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
                      }}
                    >
                      <RoleIcon size={10} /> {roleInfo?.label || u.role}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 10, color: t.text3 }}>
                  {u.brand_access ? u.brand_access.join(", ") : "All"}
                </span>
                <span style={{ fontSize: 10, color: t.text3 }}>
                  {(u as any).last_login ? etRelative((u as any).last_login) : "Never"}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: isActive ? t.green : t.red,
                }}>
                  {isActive ? "Active" : "Inactive"}
                </span>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleToggleActive(u.id, isActive)}
                  title={isActive ? "Deactivate" : "Reactivate"}
                  style={{
                    border: "none", background: "transparent", cursor: "pointer",
                    color: isActive ? t.text3 : t.green, padding: 4,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                </motion.button>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Role Legend */}
      <div style={{
        marginTop: 24, padding: 20, background: t.card, borderRadius: 16,
        border: `1px solid ${t.cardBorder}`,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 14 }}>Role Permissions</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {ROLE_HIERARCHY.map(r => {
            const info = ROLE_LABELS[r];
            const Icon = ROLE_ICONS[r] || Eye;
            return (
              <div key={r} style={{
                padding: 12, borderRadius: 12,
                background: `${info?.color || t.text3}08`,
                border: `1px solid ${info?.color || t.text3}15`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Icon size={14} color={info?.color} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: info?.color }}>{info?.label}</span>
                </div>
                {ROLE_PERMISSION_SUMMARY[r]?.map(perm => (
                  <div key={perm} style={{ fontSize: 10, color: t.text2, padding: "1px 0" }}>
                    • {perm}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateUserModal
            t={t}
            onClose={() => setShowCreate(false)}
            onCreated={u => setUsers(prev => [...prev, u])}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
