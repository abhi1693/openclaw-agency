"use client";

import { Globe } from "lucide-react";
import { useTranslation, type Locale } from "@/lib/i18n";

const localeOptions: { value: Locale; labelKey: string }[] = [
  { value: "en", labelKey: "language.en" },
  { value: "zh-CN", labelKey: "language.zhCN" },
];

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <div className="relative inline-flex items-center gap-1.5">
      <Globe className="h-4 w-4 text-slate-500" />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        className="appearance-none bg-transparent pr-5 text-xs font-medium text-slate-600 outline-none cursor-pointer hover:text-slate-900"
        aria-label={t("language.label")}
      >
        {localeOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
