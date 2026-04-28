const DASH = "—";

export type SessionUsageSummary = {
  label: string;
  percent: number | null;
  toneClassName: string;
};

export const compactNumber = (value: number): string => {
  if (!Number.isFinite(value)) return DASH;
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}m`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return new Intl.NumberFormat("en-US").format(value);
};

export const sessionUsageToneClass = (percent: number | null): string => {
  if (percent === null) return "bg-slate-300";
  if (percent >= 80) return "bg-rose-500";
  if (percent >= 50) return "bg-amber-500";
  return "bg-emerald-500";
};

export const buildSessionUsageSummary = (
  usedTokens: number | null,
  maxTokens: number | null,
  pctFromPayload: number | null,
): SessionUsageSummary => {
  const percent = Number.isFinite(pctFromPayload ?? NaN)
    ? Math.max(0, Math.min(100, Math.round(pctFromPayload ?? 0)))
    : usedTokens !== null && maxTokens !== null && maxTokens > 0
      ? Math.max(0, Math.min(100, Math.round((usedTokens / maxTokens) * 100)))
      : null;

  const label =
    usedTokens !== null && maxTokens !== null
      ? `${compactNumber(usedTokens)}/${compactNumber(maxTokens)} (${percent ?? 0}%)`
      : usedTokens !== null
        ? `${compactNumber(usedTokens)} tokens`
        : DASH;

  return {
    label,
    percent,
    toneClassName: sessionUsageToneClass(percent),
  };
};
