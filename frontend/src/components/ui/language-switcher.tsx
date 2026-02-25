"use client";

import { Globe, Check, ChevronDown } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { t, type Language } from "@/lib/translations";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";
import { cn } from "@/lib/utils";

const LANGS: { value: Language; key: "lang_zh" | "lang_en" }[] = [
    { value: "zh", key: "lang_zh" },
    { value: "en", key: "lang_en" },
];

export function LanguageSwitcher({ className }: { className?: string }) {
    const { language, toggleLanguage } = useLanguage();
    const [open, setOpen] = useState(false);

    const currentLabel = t(language, language === "zh" ? "lang_zh" : "lang_en");

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition",
                        "hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
                        "data-[state=open]:border-blue-400 data-[state=open]:bg-blue-50 data-[state=open]:text-blue-700",
                        className,
                    )}
                    aria-label={t(language, "lang_label")}
                >
                    <Globe className="h-3 w-3 flex-shrink-0" />
                    <span>{currentLabel}</span>
                    <ChevronDown
                        className={cn(
                            "h-3 w-3 flex-shrink-0 text-slate-400 transition",
                            open && "rotate-180",
                        )}
                    />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                sideOffset={6}
                className="w-36 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
            >
                {LANGS.map((lang) => (
                    <button
                        key={lang.value}
                        type="button"
                        className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition",
                            language === lang.value
                                ? "bg-blue-50 text-blue-700 font-medium"
                                : "text-slate-700 hover:bg-slate-50",
                        )}
                        onClick={() => {
                            if (language !== lang.value) toggleLanguage();
                            setOpen(false);
                        }}
                    >
                        {t(lang.value, lang.key)}
                        {language === lang.value && (
                            <Check className="h-3.5 w-3.5 text-blue-600" />
                        )}
                    </button>
                ))}
            </PopoverContent>
        </Popover>
    );
}
