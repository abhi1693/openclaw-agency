"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useAuth } from "@/auth/clerk";
import { useTranslation } from "@/lib/i18n";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { KnowledgeSearchBar } from "@/components/knowledge/KnowledgeSearchBar";
import { KnowledgeEntryCard } from "@/components/knowledge/KnowledgeEntryCard";
import { KnowledgeSidebar } from "@/components/knowledge/KnowledgeSidebar";
import { KnowledgeCreateDialog } from "@/components/knowledge/KnowledgeCreateDialog";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  category?: string | null;
  tags?: unknown[];
  source_type?: string | null;
  is_pinned: boolean;
  created_at: string;
  documents?: Array<{ id: string; file_name: string; storage_url: string }>;
};

async function fetchEntries(params: {
  category?: string;
  is_pinned?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ items: KnowledgeEntry[]; total: number }> {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.is_pinned !== undefined) query.set("is_pinned", String(params.is_pinned));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));
  const resp = await fetch(`${API_BASE}/api/v1/knowledge?${query.toString()}`, {
    credentials: "include",
  });
  if (!resp.ok) throw new Error("Failed to fetch knowledge entries");
  return resp.json();
}

async function createEntry(payload: {
  title: string;
  content: string;
  category?: string;
  tags: string[];
  source_type?: string;
}): Promise<KnowledgeEntry> {
  const resp = await fetch(`${API_BASE}/api/v1/knowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error("Failed to create entry");
  return resp.json();
}

async function pinEntry(id: string): Promise<KnowledgeEntry> {
  const resp = await fetch(`${API_BASE}/api/v1/knowledge/${id}/pin`, {
    method: "POST",
    credentials: "include",
  });
  if (!resp.ok) throw new Error("Failed to pin entry");
  return resp.json();
}

export default function KnowledgePage() {
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();

  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Derive categories from entries
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.category) {
        map.set(e.category, (map.get(e.category) ?? 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [entries]);

  const loadEntries = async (category: string | null, pinned: boolean) => {
    setLoading(true);
    try {
      const result = await fetchEntries({
        category: category ?? undefined,
        is_pinned: pinned || undefined,
        limit: 50,
      });
      setEntries(result.items);
      setTotal(result.total);
      setLoadedOnce(true);
    } catch {
      // silently fail; entries stay empty
    } finally {
      setLoading(false);
    }
  };

  // Load on first mount
  useMemo(() => {
    if (isSignedIn && !loadedOnce) {
      loadEntries(null, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const handleCategorySelect = (category: string | null) => {
    setSelectedCategory(category);
    loadEntries(category, showPinnedOnly);
  };

  const handlePinnedToggle = () => {
    const next = !showPinnedOnly;
    setShowPinnedOnly(next);
    loadEntries(selectedCategory, next);
  };

  const handleSearch = (query: string, mode: "keyword" | "semantic" | "hybrid") => {
    const params = new URLSearchParams({ q: query, mode });
    if (selectedCategory) params.set("category", selectedCategory);
    router.push(`/knowledge/search?${params.toString()}`);
  };

  const handleCreate = async (payload: {
    title: string;
    content: string;
    category?: string;
    tags: string[];
    source_type?: string;
  }) => {
    setCreating(true);
    try {
      const entry = await createEntry(payload);
      setEntries((prev) => [entry, ...prev]);
      setTotal((prev) => prev + 1);
    } finally {
      setCreating(false);
    }
  };

  const handlePin = async (id: string) => {
    try {
      const updated = await pinEntry(id);
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch {
      // ignore
    }
  };

  return (
    <DashboardPageLayout
      signedOut={{
        message: t("knowledge.signedOut.message"),
        forceRedirectUrl: "/knowledge",
      }}
      title={t("knowledge.title")}
      description={t("knowledge.description")}
      headerActions={
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          {t("knowledge.createBtn")}
        </button>
      }
    >
      <div className="space-y-6">
        {/* Search bar */}
        <KnowledgeSearchBar onSearch={handleSearch} />

        <div className="flex gap-8">
          {/* Sidebar */}
          <KnowledgeSidebar
            categories={categories}
            selectedCategory={selectedCategory}
            onCategorySelect={handleCategorySelect}
            showPinnedOnly={showPinnedOnly}
            onPinnedToggle={handlePinnedToggle}
          />

          {/* Entry grid */}
          <div className="flex-1 min-w-0">
            {loading && (
              <div className="flex items-center justify-center py-16 text-slate-400">
                {t("knowledge.loading")}
              </div>
            )}

            {!loading && entries.length === 0 && loadedOnce && (
              <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                <p className="text-lg font-medium">{t("knowledge.empty.title")}</p>
                <p className="mt-1 text-sm">{t("knowledge.empty.description")}</p>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {t("knowledge.createBtn")}
                </button>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
              {entries.map((entry) => (
                <KnowledgeEntryCard
                  key={entry.id}
                  entry={entry}
                  onPin={handlePin}
                  onClick={(id) => router.push(`/knowledge/${id}`)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <KnowledgeCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
        loading={creating}
      />
    </DashboardPageLayout>
  );
}
