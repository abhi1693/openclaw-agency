"use client";

import { Folder, FolderOpen, ChevronRight } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

type Category = {
  name: string;
  count: number;
};

type KnowledgeCategoryTreeProps = {
  categories: Category[];
  selected?: string | null;
  onSelect: (category: string | null) => void;
};

export function KnowledgeCategoryTree({
  categories,
  selected,
  onSelect,
}: KnowledgeCategoryTreeProps) {
  const { t } = useTranslation();

  const totalCount = categories.reduce((sum, c) => sum + c.count, 0);

  return (
    <nav aria-label={t("knowledge.category.title")}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {t("knowledge.category.title")}
      </p>
      <ul className="space-y-0.5">
        {/* All entries */}
        <li>
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={[
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
              selected === null
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            {selected === null ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 flex-shrink-0 text-slate-400" />
            )}
            <span className="flex-1 truncate">{t("knowledge.category.all")}</span>
            <span className="text-xs text-slate-400">{totalCount}</span>
          </button>
        </li>

        {categories.map((cat) => (
          <li key={cat.name}>
            <button
              type="button"
              onClick={() => onSelect(cat.name)}
              className={[
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                selected === cat.name
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              <ChevronRight
                className={[
                  "h-3 w-3 flex-shrink-0 transition-transform",
                  selected === cat.name ? "rotate-90 text-blue-500" : "text-slate-300",
                ].join(" ")}
              />
              {selected === cat.name ? (
                <FolderOpen className="h-4 w-4 flex-shrink-0 text-blue-500" />
              ) : (
                <Folder className="h-4 w-4 flex-shrink-0 text-slate-400" />
              )}
              <span className="flex-1 truncate capitalize">{cat.name}</span>
              <span className="text-xs text-slate-400">{cat.count}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
