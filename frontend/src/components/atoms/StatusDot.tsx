import { cn } from "@/lib/utils";

type StatusDotVariant = "agent" | "approval" | "task";

const AGENT_STATUS_DOT_CLASS_BY_STATUS: Record<string, string> = {
  online: "bg-emerald-500",
  busy: "bg-amber-500",
  provisioning: "bg-amber-500",
  updating: "bg-sky-500",
  deleting: "bg-rose-500",
  offline: "bg-slate-400",
};

const APPROVAL_STATUS_DOT_CLASS_BY_STATUS: Record<string, string> = {
  approved: "bg-emerald-500",
  rejected: "bg-rose-500",
  pending: "bg-amber-500",
};

const TASK_STATUS_DOT_CLASS_BY_STATUS: Record<string, string> = {
  inbox: "bg-slate-400",
  in_progress: "bg-purple-500",
  review: "bg-indigo-500",
  done: "bg-emerald-500",
};

const STATUS_DOT_CLASS_BY_VARIANT: Record<
  StatusDotVariant,
  Record<string, string>
> = {
  agent: AGENT_STATUS_DOT_CLASS_BY_STATUS,
  approval: APPROVAL_STATUS_DOT_CLASS_BY_STATUS,
  task: TASK_STATUS_DOT_CLASS_BY_STATUS,
};

const DEFAULT_STATUS_DOT_CLASS: Record<StatusDotVariant, string> = {
  agent: "bg-slate-300",
  approval: "bg-amber-500",
  task: "bg-slate-300",
};

export const statusDotClass = (
  status: string | null | undefined,
  variant: StatusDotVariant = "agent",
) => {
  const normalized = (status ?? "").trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_STATUS_DOT_CLASS[variant];
  }
  return (
    STATUS_DOT_CLASS_BY_VARIANT[variant][normalized] ??
    DEFAULT_STATUS_DOT_CLASS[variant]
  );
};

type StatusDotProps = {
  status?: string | null;
  variant?: StatusDotVariant;
  className?: string;
  /** When true, shows a warning badge overlaid on the dot (for spawn-failed agents). */
  hasSpawnFailed?: boolean;
  /** Tooltip text shown on hover when spawn has failed. */
  spawnFailedTooltip?: string;
};

export function StatusDot({
  status,
  variant = "agent",
  className,
  hasSpawnFailed = false,
  spawnFailedTooltip = "Last spawn failed",
}: StatusDotProps) {
  const dot = (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        statusDotClass(status, variant),
        className,
      )}
    />
  );

  if (!hasSpawnFailed) {
    return dot;
  }

  return (
    <span
      className="relative inline-flex"
      title={spawnFailedTooltip}
      aria-label={spawnFailedTooltip}
    >
      {dot}
      {/* Warning badge: small orange triangle with exclamation */}
<span
        className={cn(
          "absolute -right-0.5 -top-0.5 flex h-2 w-2 items-center justify-center",
 )}
      >
        <svg
          viewBox="0 0 10 10"
          className="h-full w-full"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Orange triangle warning badge */}
          <path
            d="M5 1L9 9H1L5 1Z"
            fill="hsl(38 92% 50%)"
            stroke="white"
            strokeWidth="0.5"
          />
          {/* Exclamation mark */}
          <path
            d="M5 4.5V6.5M5 3.5V3.8"
            stroke="white"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </span>
  );
}
