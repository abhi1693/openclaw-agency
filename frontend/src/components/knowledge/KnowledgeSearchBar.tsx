"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

type SearchMode = "keyword" | "semantic" | "hybrid";

type KnowledgeSearchBarProps = {
  onSearch: (query: string, mode: SearchMode) => void;
  loading?: boolean;
};

const MODE_OPTIONS: { value: SearchMode; labelKey: string }[] = [
  { value: "hybrid", labelKey: "knowledge.search.modeHybrid" },
  { value: "keyword", labelKey: "knowledge.search.modeKeyword" },
  { value: "semantic", labelKey: "knowledge.search.modeSemantic" },
];

export function KnowledgeSearchBar({ onSearch, loading = false }: KnowledgeSearchBarProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), mode);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("knowledge.search.placeholder")}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm shadow-sm outline-none ring-0 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-lg border border-slate-200 bg-white text-sm shadow-sm">
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMode(opt.value)}
            className={[
              "px-3 py-2 transition-colors first:rounded-l-lg last:rounded-r-lg",
              mode === opt.value
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            {t(opt.labelKey)}
          </button>
        ))}
      </div>

      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? t("knowledge.search.searching") : t("knowledge.search.searchBtn")}
      </button>
    </form>
  );
}
