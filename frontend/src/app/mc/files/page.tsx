"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Download, FileText, X, Eye } from "lucide-react";
import { useMC, mcApi } from "../context";
import { etDateTime, etDateShort } from "../helpers";
import { Skeleton } from "../layout";

const CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  Reports: { label: "Reports", icon: "📊", color: "#396AFF" },
  Strategy: { label: "Strategy", icon: "🧠", color: "#7B61FF" },
  Staging: { label: "Staging", icon: "🚧", color: "#FFBB38" },
  Docs: { label: "Brand Docs", icon: "📋", color: "#0891B2" },
  Specs: { label: "Specs", icon: "📐", color: "#41D4A8" },
  Other: { label: "Other", icon: "📄", color: "#B1B1B1" },
};

function categorize(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes("report") || lower.includes("analytics") || lower.includes("performance")) return "Reports";
  if (lower.includes("strategy") || lower.includes("plan") || lower.includes("roadmap")) return "Strategy";
  if (lower.includes("staging") || lower.includes("draft") || lower.includes("wip")) return "Staging";
  if (lower.includes("doc") || lower.includes("brief") || lower.includes("brand")) return "Docs";
  if (lower.includes("spec") || lower.includes("req") || lower.includes("design")) return "Specs";
  return "Other";
}

// Markdown renderer (simple)
function MarkdownPreview({ content, t }: { content: string; t: any }) {
  const html = content
    .replace(/^### (.*$)/gm, `<h3 style="font-size:14px;font-weight:700;color:${t.text};margin:16px 0 8px">$1</h3>`)
    .replace(/^## (.*$)/gm, `<h2 style="font-size:16px;font-weight:800;color:${t.text};margin:20px 0 10px">$1</h2>`)
    .replace(/^# (.*$)/gm, `<h1 style="font-size:18px;font-weight:800;color:${t.text};margin:24px 0 12px">$1</h1>`)
    .replace(/\*\*(.*?)\*\*/g, `<strong>$1</strong>`)
    .replace(/\*(.*?)\*/g, `<em>$1</em>`)
    .replace(/^- (.*$)/gm, `<div style="padding:3px 0;color:${t.text}">• $1</div>`)
    .replace(/^---$/gm, `<hr style="border:none;border-top:1px solid ${t.tableBorder};margin:12px 0">`)
    .replace(/\n/g, "<br>");

  return (
    <div
      style={{ fontSize: 13, lineHeight: 1.6, color: t.text2 }}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}

export default function FilesPage() {
  const { files, t, isDark, loading, refreshTabData } = useMC();
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => { refreshTabData("files"); }, []);

  // Categorize files
  const categorized = files.reduce((acc: Record<string, any[]>, f) => {
    const cat = categorize(f.name);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  const filteredCats = Object.entries(categorized).filter(([cat, catFiles]) => {
    if (selectedCat && cat !== selectedCat) return false;
    if (search) return catFiles.some(f => f.name.toLowerCase().includes(search.toLowerCase()));
    return true;
  });

  const handleFileClick = async (file: any) => {
    setSelectedFile(file);
    setContentLoading(true);
    try {
      const data = await mcApi<{ content: string; name: string }>(`/files/${encodeURIComponent(file.name)}/content`);
      setFileContent(data.content || "(Empty file)");
    } catch {
      setFileContent("(Preview not available for this file)");
    } finally {
      setContentLoading(false);
    }
  };

  if (loading) return <div style={{ padding: 24 }}><Skeleton h={400} r={20} /></div>;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: t.text }}>📁 Files & Documents</h1>
          <p style={{ fontSize: 13, color: t.text2, marginTop: 2 }}>{files.length} files across all categories</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: t.card, border: `1px solid ${t.inputBorder}`, borderRadius: 50, padding: "8px 16px" }}>
          <Search size={13} color={t.text2} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..."
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: t.text, width: 180, fontFamily: "inherit" }} />
        </div>
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setSelectedCat(null)}
          style={{ padding: "6px 14px", borderRadius: 50, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: !selectedCat ? t.primary : isDark ? t.sidebarHover : "#F0F3F8", color: !selectedCat ? "#fff" : t.text2, fontFamily: "inherit", transition: "all 0.15s" }}>
          All
        </motion.button>
        {Object.entries(CATEGORIES).filter(([c]) => categorized[c]?.length).map(([cat, cfg]) => (
          <motion.button key={cat} whileTap={{ scale: 0.95 }} onClick={() => setSelectedCat(cat === selectedCat ? null : cat)}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 50, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: selectedCat === cat ? cfg.color : isDark ? t.sidebarHover : "#F0F3F8", color: selectedCat === cat ? "#fff" : t.text2, fontFamily: "inherit", transition: "all 0.15s" }}>
            {cfg.icon} {cfg.label}
            <span style={{ fontSize: 9, opacity: 0.7 }}>({categorized[cat]?.length || 0})</span>
          </motion.button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selectedFile ? "400px 1fr" : "1fr", gap: 16 }}>
        {/* File Tree */}
        <div>
          {files.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: t.text3, background: t.card, borderRadius: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No files found</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Files will appear here when agents create them</div>
            </div>
          )}
          {filteredCats.map(([cat, catFiles]) => {
            const cfg = CATEGORIES[cat] || CATEGORIES.Other;
            const filtered = search
              ? catFiles.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
              : catFiles;
            if (filtered.length === 0) return null;
            return (
              <motion.div key={cat} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: t.card, borderRadius: 16, marginBottom: 12, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
                {/* Category Header */}
                <div style={{ padding: "12px 16px", background: `${cfg.color}10`, borderBottom: `1px solid ${t.tableBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                  <span style={{ fontSize: 11, color: t.text3, marginLeft: "auto" }}>{filtered.length} files</span>
                </div>
                {/* Files */}
                {filtered.map((file, i) => (
                  <motion.div key={file.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                    onClick={() => handleFileClick(file)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${t.tableBorder}`, cursor: "pointer", background: selectedFile?.name === file.name ? `${t.primary}10` : "transparent", transition: "all 0.15s" }}
                    onMouseOver={e => { if (selectedFile?.name !== file.name) e.currentTarget.style.background = isDark ? t.sidebarHover : "#F8FAFC"; }}
                    onMouseOut={e => { if (selectedFile?.name !== file.name) e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cfg.color}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <FileText size={16} color={cfg.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{file.name}</div>
                      <div style={{ fontSize: 10, color: t.text3 }}>
                        {(file.size / 1024).toFixed(1)} KB · {etDateShort(file.modified)}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <div style={{ padding: "4px 8px", borderRadius: 8, background: `${t.primary}15`, color: t.primary, fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
                        <Eye size={10} /> Preview
                      </div>
                      <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/mc/files/${encodeURIComponent(file.name)}/download`}
                        download={file.name}
                        onClick={e => e.stopPropagation()}
                        style={{ padding: "4px 8px", borderRadius: 8, background: `${t.green}15`, color: t.green, fontSize: 10, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                        <Download size={10} /> DL
                      </a>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            );
          })}
        </div>

        {/* File Preview Panel */}
        <AnimatePresence>
          {selectedFile && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
              style={{ background: t.card, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", display: "flex", flexDirection: "column", maxHeight: 600 }}>
              {/* Preview header */}
              <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.tableBorder}`, display: "flex", alignItems: "center", gap: 10 }}>
                <FileText size={16} color={t.primary} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selectedFile.name}</div>
                  <div style={{ fontSize: 10, color: t.text3 }}>{(selectedFile.size / 1024).toFixed(1)} KB · {etDateTime(selectedFile.modified)}</div>
                </div>
                <a href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/mc/files/${encodeURIComponent(selectedFile.name)}/download`}
                  download={selectedFile.name}
                  style={{ padding: "6px 12px", borderRadius: 50, background: t.green, color: "#fff", fontSize: 11, fontWeight: 600, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                  <Download size={11} /> Download
                </a>
                <button onClick={() => setSelectedFile(null)}
                  style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: t.bg, color: t.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X size={13} />
                </button>
              </div>
              {/* Preview content */}
              <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
                {contentLoading ? (
                  <Skeleton h={200} r={8} />
                ) : (
                  <MarkdownPreview content={fileContent} t={t} />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
