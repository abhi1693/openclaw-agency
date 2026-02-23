"use client";

import { Filter, Pin } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { KnowledgeCategoryTree } from "./KnowledgeCategoryTree";

type Category = {
  name: string;
  count: number;
};

type KnowledgeSidebarProps = {
  categories: Category[];
  selectedCategory: string | null;
  onCategorySelect: (category: string | null) => void;
  showPinnedOnly: boolean;
  onPinnedToggle: () => void;
};

export function KnowledgeSidebar({
  categories,
  selectedCategory,
  onCategorySelect,
  showPinnedOnly,
  onPinnedToggle,
}: KnowledgeSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="w-56 flex-shrink-0 space-y-6">
      {/* Category tree */}
      <KnowledgeCategoryTree
        categories={categories}
        selected={selectedCategory}
        onSelect={onCategorySelect}
      />

      {/* Quick filters */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {t("knowledge.filter.title")}
        </p>
        <button
          type="button"
          onClick={onPinnedToggle}
          className={[
            "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
            showPinnedOnly
              ? "bg-amber-50 text-amber-700 font-medium"
              : "text-slate-600 hover:bg-slate-50",
          ].join(" ")}
        >
          <Pin
            className={[
              "h-4 w-4 flex-shrink-0",
              showPinnedOnly ? "text-amber-500" : "text-slate-400",
            ].join(" ")}
          />
          {t("knowledge.filter.pinnedOnly")}
        </button>
      </div>
    </aside>
  );
}
