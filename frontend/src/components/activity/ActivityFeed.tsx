"use client";

import type { ReactNode } from "react";

import { useTranslation } from "@/lib/i18n";

type FeedItem = {
  id: string;
};

type ActivityFeedProps<TItem extends FeedItem> = {
  isLoading: boolean;
  errorMessage?: string | null;
  items: TItem[];
  renderItem: (item: TItem) => ReactNode;
};

export function ActivityFeed<TItem extends FeedItem>({
  isLoading,
  errorMessage,
  items,
  renderItem,
}: ActivityFeedProps<TItem>) {
  const { t } = useTranslation();

  if (isLoading && items.length === 0) {
    return <p className="text-sm text-slate-500">{t("activity.loadingFeed")}</p>;
  }

  const hasError = errorMessage !== null && errorMessage !== undefined;
  if (hasError) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
        {errorMessage || t("activity.loadFailed")}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-900">
          {t("activity.waitingActivity")}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {t("activity.waitingDesc")}
        </p>
      </div>
    );
  }

  return <div className="space-y-4">{items.map(renderItem)}</div>;
}
