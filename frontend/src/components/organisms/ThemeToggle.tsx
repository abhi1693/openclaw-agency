"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Toggle dark mode"
      onClick={toggleTheme}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-[color:var(--neutral-800,var(--text))] transition hover:bg-[color:var(--neutral-100,var(--surface-muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-teal,var(--accent))] focus-visible:ring-offset-2",
        className,
      )}
    >
      {isDark ? (
        <Moon className="h-4 w-4 text-[color:var(--neutral-700,var(--text-quiet))]" />
      ) : (
        <Sun className="h-4 w-4 text-[color:var(--neutral-700,var(--text-quiet))]" />
      )}
      {isDark ? "Dark mode" : "Light mode"}
    </button>
  );
}
