"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { truncateText } from "@/lib/formatters";
import { cn, copyToClipboard } from "@/lib/utils";

type CopyableIdProps = {
  value?: string | null;
  fallback?: string;
  maxLength?: number;
  className?: string;
  buttonClassName?: string;
  copyLabel?: string;
};

const RESET_DELAY_MS = 1_500;

export function CopyableId({
  value,
  fallback = "—",
  maxLength = 8,
  className,
  buttonClassName,
  copyLabel = "Copy ID",
}: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  if (!value) {
    return <span className={className}>{fallback}</span>;
  }

  const handleCopy = async () => {
    try {
      await copyToClipboard(value);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, RESET_DELAY_MS);
    } catch {
      setCopied(false);
    }
  };

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="font-mono text-[11px]" title={value}>
        {truncateText(value, maxLength)}
      </span>
      <button
        type="button"
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700",
          buttonClassName,
        )}
        aria-label={copied ? `${copyLabel} copied` : copyLabel}
        title={copied ? "Copied" : copyLabel}
        onClick={() => void handleCopy()}
      >
        {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}
