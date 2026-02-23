// ── Eastern-time formatting helpers ──
const TZ = "America/New_York";

export function etNow(): Date {
  return new Date();
}

export function etClock(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  }).format(new Date());
}

export function etDate(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: "numeric",
  }).format(new Date());
}

export function etTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

export function etDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

export function etDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, month: "short", day: "numeric",
  }).format(new Date(iso));
}

export function etRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return etDateShort(iso);
}
