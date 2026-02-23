"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { KnowledgeSearchBar } from "@/components/knowledge/KnowledgeSearchBar";
import { KnowledgeEntryCard } from "@/components/knowledge/KnowledgeEntryCard";

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

type SearchResponse = {
  items: KnowledgeEntry[];
  scores: number[];
};

async function searchKnowledge(
  query: string,
  mode: "keyword" | "semantic" | "hybrid",
  category?: string,
): Promise<SearchResponse> {
  const resp = await fetch(`${API_BASE}/api/v1/knowledge/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ query, mode, category: category || undefined, limit: 30 }),
  });
  if (!resp.ok) throw new Error("Search failed");
  return resp.json();
}

export default function KnowledgeSearchPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialQuery = searchParams.get("q") ?? "";
  const initialMode = (searchParams.get("mode") ?? "hybrid") as "keyword" | "semantic" | "hybrid";
  const initialCategory = searchParams.get("category") ?? undefined;

  const [results, setResults] = useState<KnowledgeEntry[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [currentQuery, setCurrentQuery] = useState(initialQuery);
  const [error, setError] = useState<string | null>(null);

  const doSearch = async (
    query: string,
    mode: "keyword" | "semantic" | "hybrid",
  ) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setCurrentQuery(query);
    // Update URL
    const params = new URLSearchParams({ q: query, mode });
    if (initialCategory) params.set("category", initialCategory);
    router.replace(`/knowledge/search?${params.toString()}`);
    try {
      const resp = await searchKnowledge(query, mode, initialCategory);
      setResults(resp.items);
      setScores(resp.scores);
      setSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("knowledge.search.error"));
    } finally {
      setLoading(false);
    }
  };

  // Run initial search from URL params
  useEffect(() => {
    if (initialQuery) {
      doSearch(initialQuery, initialMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardPageLayout
      signedOut={{
        message: t("knowledge.signedOut.message"),
        forceRedirectUrl: "/knowledge/search",
      }}
      title={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/knowledge")}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label={t("knowledge.search.backToHub")}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {t("knowledge.search.title")}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Search bar */}
        <KnowledgeSearchBar onSearch={doSearch} loading={loading} />

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-12 text-center text-slate-400">{t("knowledge.search.searching")}</div>
        )}

        {/* Results */}
        {!loading && searched && (
          <>
            <p className="text-sm text-slate-500">
              {t("knowledge.search.resultsCount", {
                count: results.length,
                query: currentQuery,
              })}
            </p>
            {results.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center text-slate-400">
                <p className="font-medium">{t("knowledge.search.noResults")}</p>
                <p className="mt-1 text-sm">{t("knowledge.search.noResultsHint")}</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                {results.map((entry, idx) => (
                  <KnowledgeEntryCard
                    key={entry.id}
                    entry={entry}
                    score={scores[idx]}
                    onClick={(id) => router.push(`/knowledge/${id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardPageLayout>
  );
}
