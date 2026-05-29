"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Camera,
  Cpu,
  FileUp,
  Mic,
  MonitorUp,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react";

import { useConsoleIAMedia, type ConsoleIAAttachment } from "./useConsoleIAMedia";

type TargetStatus = "AMBER" | "LOCAL" | "QUEUE" | "SELECT";
type HonestStatus =
  | "LOCAL_GREEN"
  | "DRAFT_ONLY_GREEN"
  | "EXTERNAL_LOCKED"
  | "EXTERNAL_LIVE"
  | "PERCEPTION_READY"
  | "BRIEF_ONLY"
  | "APPROVAL_REQUIRED"
  | "WATCH"
  | "BLOCKED";
type PacketMode = "ASK" | "DRAFT" | "PATCH" | "PERCEPTION" | "EXECUTE";
type VisualSeverity = "ok" | "ready" | "safe" | "neutral" | "attention" | "blocked";
type InspectorSection = "summary" | "timeline" | "proofs";

type ConsoleTarget = {
  id: string;
  label: string;
  scope: string;
  status: TargetStatus;
};

type ConsoleModelMode = {
  id: string;
  label: string;
  provider: string;
  model: string;
  reasoning: "standard" | "high" | "xhigh" | "visual";
  scope: string;
};

type PacketResponse = {
  ok: boolean;
  packetId?: string;
  packetHash?: string;
  mode?: string;
  actionMode?: PacketMode;
  status?: string;
  honestStatus?: Partial<Record<string, HonestStatus>>;
  statusBadges?: StatusBadge[];
  whyStatus?: WhyStatus;
  timeline?: PacketTimelineEvent[];
  approval?: { required?: boolean; granted?: boolean; reason?: string | null };
  eventHash?: string | null;
  error?: string;
  warnings?: string[];
  files?: Array<{ name: string; storedPath?: string; sizeBytes: number }>;
  routes?: Array<{ bus: string; path: string }>;
  thread?: ConsoleThread | null;
  modelMode?: ConsoleModelMode;
};

type ThreadParticipant = {
  id: string;
  label: string;
  status: "answered" | "working" | "queued" | "pending" | string;
  path?: string | null;
};

type ThreadMessage = {
  id: string;
  role: "user" | "central_brain" | "agent" | "system";
  title: string;
  content: string;
  createdAt: string;
  status?: string;
  agentId?: string;
  evidencePaths?: string[];
};

type ConsoleThread = {
  packetId: string;
  status: string;
  actionMode?: PacketMode;
  honestStatus?: Partial<Record<string, HonestStatus>>;
  statusBadges?: StatusBadge[];
  proofSummary?: ConsoleProofSummary;
  whyStatus?: WhyStatus;
  timeline?: PacketTimelineEvent[];
  target?: {
    id?: string;
    label?: string;
    house?: string;
    owner?: string;
  };
  modelMode?: ConsoleModelMode | null;
  participants: ThreadParticipant[];
  messages: ThreadMessage[];
  counts?: {
    attachments?: number;
    responses?: number;
    ledgerEvents?: number;
  };
  paths?: {
    packetPath?: string;
    responsePath?: string;
    missionPath?: string;
    claudeTaskPath?: string | null;
  };
};

type ProofStatus = "OK" | "MISSING" | "WATCH" | "RÉFÉRENCÉ";

type ServerProofItem = {
  id: string;
  label: string;
  status: ProofStatus;
  checkedAt?: string;
  timestamp?: string | null;
  path?: string | null;
  sizeBytes?: number;
  mtime?: string;
  detail?: string;
};

type ConsoleProofSummary = {
  generatedAt: string;
  sourceTag: string;
  apiLive?: {
    status: ProofStatus;
    label: string;
    detail?: string;
  };
  items: ServerProofItem[];
};

type StatusBadge = {
  id: string;
  label: string;
  status: HonestStatus;
  tone?: "green" | "cyan" | "amber" | "red" | "slate";
  detail?: string;
};

type DisplayStatusBadge = Omit<StatusBadge, "status" | "tone"> & {
  status: string;
  tone: VisualSeverity;
  isProblem: boolean;
  isActive: boolean;
};

type WhyStatusSection = {
  status: HonestStatus;
  reasons: string[];
  proofs?: string[];
};

type WhyStatus = Record<string, WhyStatusSection>;

type PacketTimelineEvent = {
  id: string;
  type: string;
  label: string;
  status: HonestStatus | "INFO";
  timestamp: string;
  agent?: string;
  bus?: string;
  localPath?: string | null;
  hash?: string | null;
  details?: string;
  surface?: "local" | "external" | "draft_only";
};

type ProofItem = {
  id: string;
  label: string;
  status: ProofStatus;
  value?: string;
  checkedAt?: string;
  timestamp?: string | null;
  sizeBytes?: number;
  mtime?: string;
  detail?: string;
};

const TARGETS: ConsoleTarget[] = [
  { id: "central_council", label: "Central Council", scope: "Codex + Claude + Jarod", status: "AMBER" },
  { id: "codex_local", label: "Codex local", scope: "Patch, architecture, tests", status: "LOCAL" },
  { id: "claude_local", label: "Claude local", scope: "Mémoire, synthèse, QA locale", status: "AMBER" },
  { id: "chatgpt_sync", label: "ChatGPT sync", scope: "Brief local, pas API cachée", status: "AMBER" },
  { id: "qwen_local", label: "Qwen local", scope: "Bulk, contradiction, cheap lane", status: "AMBER" },
  { id: "kevin_gemini", label: "Kevin / Gemini", scope: "Yeux, caméra, écran, perception", status: "AMBER" },
  { id: "jarod_openclaw", label: "Jarod / OpenClaw", scope: "Runtime, Lobster, agents terrain", status: "AMBER" },
  { id: "perplexity_local", label: "Perplexity", scope: "Recherche, sources, evidence", status: "AMBER" },
  { id: "telegram_iron", label: "Telegram Iron", scope: "CRM Iron broker (draft)", status: "AMBER" },
  { id: "telegram_free", label: "Telegram Free", scope: "Canal gratuit (draft)", status: "AMBER" },
  { id: "telegram_vip", label: "Telegram VIP", scope: "Canal VIP (draft)", status: "AMBER" },
  { id: "telegram_erwin", label: "Telegram Erwin", scope: "Compte perso Erwin (draft)", status: "AMBER" },
];

const MODEL_MODES: ConsoleModelMode[] = [
  {
    id: "spark_5_3",
    label: "5.3 Spark",
    provider: "codex_local",
    model: "gpt-5.3-codex-spark",
    reasoning: "standard",
    scope: "rapide, patch borné, coût/CPU bas",
  },
  {
    id: "codex_5_5",
    label: "5.5 approfondi",
    provider: "codex_local",
    model: "gpt-5.5",
    reasoning: "high",
    scope: "architecture, arbitrage, bug transverse",
  },
  {
    id: "codex_5_5_xhigh",
    label: "5.5 très approfondi",
    provider: "codex_local",
    model: "gpt-5.5",
    reasoning: "xhigh",
    scope: "risque haut, doctrine, conflit multi-sources",
  },
  {
    id: "chatgpt_desktop",
    label: "ChatGPT Desktop",
    provider: "chatgpt_local_desktop",
    model: "local-app-brief-sync",
    reasoning: "high",
    scope: "app/projet ChatGPT, zéro clé API",
  },
  {
    id: "kevin_gemini",
    label: "Kevin / Gemini",
    provider: "gemini_local_perception",
    model: "gemini-2.5-flash",
    reasoning: "visual",
    scope: "écran, caméra, vision, contexte audio joint",
  },
];

const PACKET_MODES: Array<{ id: PacketMode; label: string; text: string }> = [
  { id: "ASK", label: "ASK", text: "Analyse locale" },
  { id: "DRAFT", label: "DRAFT", text: "Brouillon/plan" },
  { id: "PATCH", label: "PATCH", text: "Préparer code" },
  { id: "PERCEPTION", label: "PERCEPTION", text: "Écran/caméra/audio" },
  { id: "EXECUTE", label: "EXECUTE", text: "Validation requise" },
];

const TARGET_BUS_BY_ID: Record<string, string> = {
  agents_by_house: "tasks",
  central_council: "codex",
  chatgpt_sync: "chatgpt",
  claude_local: "claude",
  codex_local: "codex",
  jarod_openclaw: "jarod",
  kevin_gemini: "kevin",
  qwen_local: "qwen",
  perplexity_local: "perplexity",
  telegram_iron: "telegram_iron",
  telegram_free: "telegram_free",
  telegram_vip: "telegram_vip",
  telegram_erwin: "telegram_erwin",
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const localPathPattern = /\/Users\/[^\s`)"\]]+/g;
const localPathLinePattern = /\/Users\/[^\s`)"\]]+/;

const uniqueValues = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const extractLocalPaths = (value?: string) => value?.match(localPathPattern) ?? [];

const shortPacketId = (packetId?: string | null) => {
  if (!packetId) return "Aucun packet actif";
  if (packetId.length <= 28) return packetId;
  return `${packetId.slice(0, 10)}...${packetId.slice(-12)}`;
};

const shortLocalPath = (value: string) => {
  const parts = value.split("/").filter(Boolean);
  if (parts.length <= 3) return value;
  return `.../${parts.slice(-3).join("/")}`;
};

const sanitizeMessageForDisplay = (content: string, evidencePaths?: string[]) => {
  const pathsFromContent = extractLocalPaths(content);
  const proofCount = uniqueValues([...pathsFromContent, ...(evidencePaths ?? [])]).length;
  if (!proofCount) return { content, proofCount: 0 };
  const visibleLines = content
    .split("\n")
    .filter((line) => !localPathLinePattern.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    content: visibleLines || "Message avec preuves locales.",
    proofCount,
  };
};

const eventDisplayStatus = (event: PacketTimelineEvent) => ({
  status: event.type === "guards_checked" && event.status === "WATCH" ? "WATCH non bloquant" : event.status,
  tone: event.type === "guards_checked" && event.status === "WATCH" ? "safe" as VisualSeverity : visualToneForStatus(event.status),
});

const latestImportantEvent = (timeline?: PacketTimelineEvent[]) => {
  if (!timeline?.length) return null;
  return [...timeline].reverse().find((event) => (
    event.type === "worker_ack"
    || event.type === "agent_reply"
    || event.type === "kevin_packet_written"
    || event.type === "chatgpt_brief_written"
    || event.type === "execute_blocked_approval_required"
  )) ?? timeline[timeline.length - 1];
};

const compactWhyText = (badges: DisplayStatusBadge[]) => {
  const hasKevin = badges.some((badge) => badge.id === "kevin" && badge.isActive);
  const hasChatGpt = badges.some((badge) => badge.id === "chatgpt" && badge.isActive);
  const guards = badges.find((badge) => badge.id === "guards")?.status ?? "Guards surveillés";
  const lane = hasKevin ? "Kevin packet créé" : hasChatGpt ? "brief ChatGPT local créé" : "route locale prête";
  return `Pourquoi : packet local stocké, ${lane}, aucun envoi externe, ${guards.toLowerCase()}.`;
};

const visualClassFor = (tone: VisualSeverity) => {
  if (tone === "ok") return "border-emerald-300/45 bg-emerald-400/12 text-emerald-100";
  if (tone === "ready") return "border-cyan-300/45 bg-cyan-400/12 text-cyan-100";
  if (tone === "safe") return "border-sky-300/30 bg-sky-400/10 text-sky-100";
  if (tone === "attention") return "border-amber-300/45 bg-amber-400/12 text-amber-100";
  if (tone === "blocked") return "border-rose-300/45 bg-rose-500/12 text-rose-100";
  return "border-slate-600/55 bg-slate-900/50 text-slate-300";
};

const visualToneForStatus = (status: HonestStatus | "INFO" | string): VisualSeverity => {
  if (status === "BLOCKED") return "blocked";
  if (status === "APPROVAL_REQUIRED") return "attention";
  if (status === "LOCAL_GREEN" || status === "DRAFT_ONLY_GREEN" || status === "EXTERNAL_LIVE") return "ok";
  if (status === "PERCEPTION_READY" || status === "BRIEF_ONLY") return "ready";
  if (status === "EXTERNAL_LOCKED" || status === "SAFE_LOCKED" || status.includes("non bloquant")) return "safe";
  if (status.startsWith("NON_") || status === "INFO") return "neutral";
  if (status === "WATCH") return "attention";
  return "neutral";
};

const statusClassFor = (status: HonestStatus | "INFO" | string, tone?: VisualSeverity) => {
  return visualClassFor(tone ?? visualToneForStatus(status));
};

const proofTone = (status: ProofStatus): VisualSeverity => {
  if (status === "OK") return "ok";
  if (status === "MISSING") return "attention";
  if (status === "WATCH") return "safe";
  return "neutral";
};

function ConsoleStatusBadge({
  detail,
  label,
  status,
  tone,
}: {
  label: string;
  status: HonestStatus | string;
  detail?: string;
  tone?: VisualSeverity;
}) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${statusClassFor(status, tone)}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.12em] opacity-80">{label}</p>
      <p className="mt-1 truncate text-[11px] font-black">{status}</p>
      {detail ? <p className="mt-1 truncate text-[10px] opacity-75">{detail}</p> : null}
    </div>
  );
}

const getVisualStatus = ({
  actionMode,
  badge,
  routedBuses,
}: {
  badge: StatusBadge;
  routedBuses: Set<string>;
  actionMode: PacketMode;
}): DisplayStatusBadge => {
  const base: DisplayStatusBadge = {
    ...badge,
    detail: badge.detail,
    isActive: false,
    isProblem: false,
    status: badge.status,
    tone: visualToneForStatus(badge.status),
  };

  if (badge.id === "console" && badge.status === "LOCAL_GREEN") {
    return { ...base, detail: "Packet local OK", isActive: true, tone: "ok" };
  }
  if (badge.id === "chatgpt" && !routedBuses.has("chatgpt")) {
    return { ...base, status: "NON_ROUTÉ", detail: "Non routé dans ce packet", tone: "neutral" };
  }
  if (badge.id === "chatgpt" && badge.status === "BRIEF_ONLY") {
    return { ...base, detail: "Brief local OK, aucune API OpenAI", isActive: true, tone: "ready" };
  }
  if (badge.id === "kevin" && !routedBuses.has("kevin")) {
    return { ...base, status: "NON_ROUTÉ", detail: "Non routé dans ce packet", tone: "neutral" };
  }
  if (badge.id === "kevin" && badge.status === "PERCEPTION_READY") {
    return { ...base, detail: "Perception one-shot OK", isActive: true, tone: "ready" };
  }
  if (badge.id === "external") {
    return { ...base, status: "SAFE_LOCKED", detail: "Verrouillé volontairement", tone: "safe" };
  }
  if (badge.id === "execute" && actionMode !== "EXECUTE") {
    return { ...base, status: "NON_DEMANDÉ", detail: "Aucune action réelle demandée", tone: "neutral" };
  }
  if (badge.id === "execute" && badge.status === "APPROVAL_REQUIRED") {
    return { ...base, detail: "Validation requise", isProblem: true, tone: "attention" };
  }
  if (badge.id === "guards" && badge.status === "WATCH") {
    return { ...base, status: "WATCH non bloquant", detail: badge.detail || "Aucun BLOCK actif", tone: "safe" };
  }
  if (base.tone === "attention" || base.tone === "blocked") {
    return { ...base, isProblem: true };
  }
  return base;
};

const statusSortWeight = (badge: DisplayStatusBadge) => {
  if (badge.id === "console") return 0;
  if (badge.isActive && badge.id === "kevin") return 1;
  if (badge.isActive && badge.id === "chatgpt") return 2;
  if (badge.id === "guards") return 3;
  if (badge.id === "external") return 4;
  if (badge.id === "execute") return 5;
  return 6;
};

const targetVisualStatus = (target: ConsoleTarget, selectedTargetId: string, routedBuses: Set<string>, participantStatus?: string) => {
  const bus = TARGET_BUS_BY_ID[target.id];
  if (bus && routedBuses.has(bus)) {
    if (participantStatus === "answered") return { label: "ACTIF", tone: "ok" as VisualSeverity, showBadge: true };
    if (participantStatus === "working") return { label: "ACTIF", tone: "ready" as VisualSeverity, showBadge: true };
    return { label: "ROUTÉ", tone: "ready" as VisualSeverity, showBadge: true };
  }
  if (target.id === selectedTargetId) return { label: "ACTIF", tone: "ready" as VisualSeverity, showBadge: true };
  if (target.status === "LOCAL") return { label: "LOCAL OK", tone: "ok" as VisualSeverity, showBadge: true };
  return { label: "", tone: "neutral" as VisualSeverity, showBadge: false };
};

function PacketModeSelector({ value, onChange }: { value: PacketMode; onChange: (value: PacketMode) => void }) {
  return (
    <div className="mt-3">
      <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">Mode d’action</p>
      <div className="grid gap-2 sm:grid-cols-5">
        {PACKET_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => onChange(mode.id)}
            className={`rounded-xl border px-2 py-1.5 text-left transition ${
              mode.id === value
                ? mode.id === "EXECUTE"
                  ? "border-amber-300/70 bg-amber-400/12 text-amber-50"
                  : "border-emerald-300/65 bg-emerald-400/12 text-emerald-50"
                : "border-slate-800 bg-slate-900/65 text-slate-300 hover:border-slate-500/70"
            }`}
          >
            <span className="block text-[11px] font-black">{mode.label}</span>
            <span className="mt-0.5 block text-[9px] leading-4 text-slate-400">{mode.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ThreadTimeline({
  limit,
  showPaths = false,
  timeline,
}: {
  timeline?: PacketTimelineEvent[];
  limit?: number;
  showPaths?: boolean;
}) {
  if (!timeline?.length) {
    return <p className="text-xs text-slate-500">Aucune timeline packet active.</p>;
  }
  const visible = limit ? timeline.slice(-limit) : timeline;
  const hiddenCount = Math.max(0, timeline.length - visible.length);
  return (
    <div className="grid gap-2">
      {visible.map((event) => {
        const { status: eventStatus, tone } = eventDisplayStatus(event);
        return (
          <div key={event.id} className="grid grid-cols-[8px_1fr] gap-2 rounded-lg border border-slate-800 bg-slate-900/55 p-2">
            <span className={`mt-1 h-2 w-2 rounded-full border ${statusClassFor(eventStatus, tone)}`} />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-black text-white">{event.label}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${statusClassFor(eventStatus, tone)}`}>
                  {eventStatus}
                </span>
              </span>
              <span className="mt-1 block text-[9px] text-slate-500">{event.timestamp}</span>
              {event.details ? <span className="mt-1 block text-[10px] leading-4 text-slate-400">{event.details}</span> : null}
              {showPaths && event.localPath ? <span className="mt-1 block truncate text-[10px] text-cyan-200/70">{shortLocalPath(event.localPath)}</span> : null}
            </span>
          </div>
        );
      })}
      {hiddenCount > 0 ? (
        <p className="rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 text-[10px] font-bold text-slate-400">
          + {hiddenCount} events plus anciens
        </p>
      ) : null}
    </div>
  );
}

function LastTimelineEvent({ event }: { event?: PacketTimelineEvent | null }) {
  if (!event) return <p className="text-xs text-slate-500">Aucun event agent pour ce packet.</p>;
  const { status, tone } = eventDisplayStatus(event);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/55 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-xs font-black text-white">{event.label}</span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${statusClassFor(status, tone)}`}>
          {status}
        </span>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">{event.timestamp}</p>
      {event.details ? <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-400">{event.details}</p> : null}
    </div>
  );
}

function LocalPathList({ items }: { items: ProofItem[] }) {
  if (!items.length) {
    return <p className="text-xs text-slate-500">Aucune preuve locale attachée à ce thread.</p>;
  }
  return (
    <div className="grid max-h-[56vh] gap-2 overflow-auto pr-1">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-900/55 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">{item.label}</p>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${visualClassFor(proofTone(item.status))}`}>
              {item.status}
            </span>
          </div>
          {item.value ? <p className="mt-1 truncate text-[10px] text-cyan-200/75">{shortLocalPath(item.value)}</p> : null}
          {item.detail ? <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{item.detail}</p> : null}
          <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-slate-500">
            <span className="truncate">{item.mtime ?? item.timestamp ?? item.checkedAt ?? ""}</span>
            {typeof item.sizeBytes === "number" ? <span>{formatBytes(item.sizeBytes)}</span> : null}
            {item.value || item.detail ? (
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(item.value ?? item.detail ?? "")}
                className="rounded-md border border-slate-700 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-300 hover:border-cyan-300 hover:text-cyan-100"
              >
                Copier
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function WhyStatusPanel({
  actionMode,
  routedBuses,
  whyStatus,
}: {
  actionMode: PacketMode;
  routedBuses: Set<string>;
  whyStatus?: WhyStatus;
}) {
  if (!whyStatus) return <p className="text-xs text-slate-500">Why Status pas encore disponible.</p>;
  const sections = Object.entries(whyStatus)
    .map(([key, section]) => ({
      key,
      original: section,
      visual: getVisualStatus({
        actionMode,
        badge: {
          id: key,
          label: key,
          status: section.status,
          detail: section.reasons[0],
        },
        routedBuses,
      }),
    }))
    .sort((a, b) => statusSortWeight(a.visual) - statusSortWeight(b.visual));
  return (
    <div className="grid max-h-72 gap-2 overflow-auto pr-1">
      {sections.map(({ key, original: section, visual }) => (
        <div key={key} className="rounded-lg border border-slate-800 bg-slate-900/55 p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-300">{key}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${statusClassFor(visual.status, visual.tone)}`}>
              {visual.status}
            </span>
          </div>
          <ul className="mt-2 grid gap-1 text-[10px] leading-4 text-slate-400">
            {section.reasons.slice(0, 2).map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          {section.proofs?.length ? (
            <p className="mt-2 truncate text-[10px] text-cyan-200/70">Preuve locale: {section.proofs[0]}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const toAttachmentMetadata = (attachment: ConsoleIAAttachment) => ({
  id: attachment.id,
  kind: attachment.kind,
  name: attachment.name,
  mimeType: attachment.mimeType,
  sizeBytes: attachment.sizeBytes,
  capturedAt: attachment.capturedAt,
  note: attachment.note ?? null,
});

export function ConsoleIAOverlay() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState(TARGETS[0].id);
  const [selectedModelModeId, setSelectedModelModeId] = useState(MODEL_MODES[0].id);
  const [selectedActionMode, setSelectedActionMode] = useState<PacketMode>("ASK");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [packetResult, setPacketResult] = useState<PacketResponse | null>(null);
  const [activePacketId, setActivePacketId] = useState<string | null>(null);
  const [openInspectorSection, setOpenInspectorSection] = useState<InspectorSection>("summary");
  const [thread, setThread] = useState<ConsoleThread | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const {
    addFiles,
    attachments,
    captureCamera,
    captureScreen,
    clearAttachments,
    isRecordingAudio,
    mediaError,
    removeAttachment,
    startAudioRecording,
    stopAudioRecording,
  } = useConsoleIAMedia();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bootPacketId = (params.get("packetId") ?? params.get("consoleIAPacket") ?? "")
      .replace(/[^A-Za-z0-9_:-]/g, "")
      .slice(0, 140);
    if (params.get("consoleIA") === "1" || bootPacketId) {
      setIsOpen(true);
    }
    if (bootPacketId) {
      setActivePacketId(bootPacketId);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !activePacketId) return;
    let stopped = false;

    const loadThread = async () => {
      try {
        const response = await fetch(`/api/cofiatrading-world-control/console-ia?packetId=${encodeURIComponent(activePacketId)}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as { ok: boolean; error?: string; thread?: ConsoleThread };
        if (stopped) return;
        if (!response.ok || !data.ok || !data.thread) {
          throw new Error(data.error ?? `THREAD_HTTP_${response.status}`);
        }
        setThread(data.thread);
        if (data.thread.target?.id && TARGETS.some((target) => target.id === data.thread?.target?.id)) {
          setSelectedTargetId(data.thread.target.id);
        }
	        if (data.thread.modelMode?.id && MODEL_MODES.some((mode) => mode.id === data.thread?.modelMode?.id)) {
	          setSelectedModelModeId(data.thread.modelMode.id);
	        }
	        if (data.thread.actionMode && PACKET_MODES.some((mode) => mode.id === data.thread?.actionMode)) {
	          setSelectedActionMode(data.thread.actionMode);
	        }
        setThreadError(null);
      } catch (error) {
        if (!stopped) {
          setThreadError(error instanceof Error ? error.message : "THREAD_POLL_FAILED");
        }
      }
    };

    loadThread();
    const timer = window.setInterval(loadThread, 2500);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activePacketId, isOpen]);

  const selectedTarget = useMemo(
    () => TARGETS.find((target) => target.id === selectedTargetId) ?? TARGETS[0],
    [selectedTargetId],
  );

  const selectedModelMode = useMemo(
    () => MODEL_MODES.find((mode) => mode.id === selectedModelModeId) ?? MODEL_MODES[0],
    [selectedModelModeId],
  );

  const canSubmit = message.trim().length > 0 || attachments.length > 0;
  const activeWhyStatus = thread?.whyStatus ?? packetResult?.whyStatus;
  const activeTimeline = thread?.timeline ?? packetResult?.timeline;
  const activeActionMode = thread?.actionMode ?? packetResult?.actionMode ?? selectedActionMode;
  const activeStatusBadges = useMemo(
    () => thread?.statusBadges ?? packetResult?.statusBadges ?? [],
    [packetResult?.statusBadges, thread?.statusBadges],
  );
  const activeRouteBuses = useMemo(
    () => new Set([
      ...(thread?.participants.map((participant) => participant.id) ?? []),
      ...(packetResult?.routes?.map((route) => route.bus) ?? []),
    ]),
    [packetResult?.routes, thread?.participants],
  );
  const participantStatusById = useMemo(
    () => new Map((thread?.participants ?? []).map((participant) => [participant.id, participant.status])),
    [thread?.participants],
  );
  const displayStatusBadges = useMemo(
    () => activeStatusBadges
      .map((badge) => getVisualStatus({ actionMode: activeActionMode, badge, routedBuses: activeRouteBuses }))
      .sort((a, b) => statusSortWeight(a) - statusSortWeight(b)),
    [activeActionMode, activeRouteBuses, activeStatusBadges],
  );
  const primaryStatusBadges = useMemo(() => {
    const activeLaneIds = [
      activeRouteBuses.has("kevin") ? "kevin" : null,
      activeRouteBuses.has("chatgpt") ? "chatgpt" : null,
    ].filter(Boolean);
    const orderedIds = ["console", ...activeLaneIds, "guards", "external"];
    return orderedIds
      .map((id) => displayStatusBadges.find((badge) => badge.id === id))
      .filter((badge): badge is DisplayStatusBadge => Boolean(badge))
      .slice(0, 4);
  }, [activeRouteBuses, displayStatusBadges]);
  const secondaryStatusBadges = useMemo(
    () => displayStatusBadges.filter((badge) => badge.isProblem && !primaryStatusBadges.some((primary) => primary.id === badge.id)),
    [displayStatusBadges, primaryStatusBadges],
  );
  const primaryParticipant = useMemo(
    () => thread?.participants.find((participant) => participant.status === "working")
      ?? thread?.participants.find((participant) => participant.status === "answered")
      ?? thread?.participants[0]
      ?? null,
    [thread?.participants],
  );
  const lastTimelineEvent = useMemo(() => latestImportantEvent(activeTimeline), [activeTimeline]);
  const proofItems = useMemo<ProofItem[]>(() => {
    const rawItems: ProofItem[] = [];
    if (thread?.proofSummary?.apiLive) {
      rawItems.push({
        id: "api_live",
        label: thread.proofSummary.apiLive.label,
        status: thread.proofSummary.apiLive.status,
        checkedAt: thread.proofSummary.generatedAt,
        detail: thread.proofSummary.apiLive.detail,
      });
    }
    thread?.proofSummary?.items.forEach((item) => {
      rawItems.push({
        id: item.id,
        label: item.label,
        status: item.status,
        value: item.path ?? undefined,
        checkedAt: item.checkedAt,
        timestamp: item.timestamp,
        sizeBytes: item.sizeBytes,
        mtime: item.mtime,
        detail: item.detail,
      });
    });

    const pushReferenced = (label: string, value?: string | null) => {
      if (!value) return;
      rawItems.push({ id: `${label}:${value}`, label, status: "RÉFÉRENCÉ", value });
    };

    if (!thread?.proofSummary) {
      pushReferenced("Packet", thread?.paths?.packetPath);
      pushReferenced("Réponses", thread?.paths?.responsePath);
      pushReferenced("Mission", thread?.paths?.missionPath);
      pushReferenced("Claude task", thread?.paths?.claudeTaskPath);
    }
    packetResult?.files?.forEach((file) => pushReferenced(`Upload ${file.name}`, file.storedPath));
    packetResult?.routes?.forEach((route) => pushReferenced(`Route ${route.bus}`, route.path));
    activeTimeline?.forEach((event) => {
      pushReferenced(event.label, event.localPath);
      pushReferenced(`${event.label} hash`, event.hash);
    });
    Object.entries(activeWhyStatus ?? {}).forEach(([key, section]) => {
      section.proofs?.forEach((proof) => pushReferenced(`Why ${key}`, proof));
    });
    thread?.messages.forEach((item) => {
      item.evidencePaths?.forEach((evidence) => pushReferenced(`Preuve ${item.title}`, evidence));
      extractLocalPaths(item.content).forEach((path) => pushReferenced(`Message ${item.title}`, path));
    });
    if (packetResult?.packetHash) {
      rawItems.push({ id: "packet_hash", label: "Packet hash", status: "RÉFÉRENCÉ", detail: packetResult.packetHash });
    }

    const seen = new Set<string>();
    return rawItems.filter((item) => {
      const key = item.value ?? item.detail ?? item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activeTimeline, activeWhyStatus, packetResult?.files, packetResult?.packetHash, packetResult?.routes, thread?.messages, thread?.paths, thread?.proofSummary]);
  const liveProofItems = useMemo(() => {
    const proofById = new Map(proofItems.map((item) => [item.id, item]));
    return [
      proofById.get("api_live"),
      proofById.get("packet_file"),
      proofById.get("worker_ack"),
    ].filter((item): item is ProofItem => Boolean(item)).slice(0, 3);
  }, [proofItems]);

  const submitPacket = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setPacketResult(null);
    setThreadError(null);

    try {
      const formData = new FormData();
      formData.append("payload", JSON.stringify({
        message: message.trim(),
        targetId: selectedTarget.id,
        targetLabel: selectedTarget.label,
	        modelModeId: selectedModelMode.id,
	        modelMode: selectedModelMode,
	        actionMode: selectedActionMode,
	        attachments: attachments.map(toAttachmentMetadata),
	        requestedMode: "local_queue_packet",
      }));
      attachments.forEach((attachment, index) => {
        formData.append(`attachment_${index}`, attachment.file, attachment.name);
      });

      const response = await fetch("/api/cofiatrading-world-control/console-ia", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as PacketResponse;
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? `HTTP_${response.status}`);
      }
      setPacketResult(data);
      setActivePacketId(data.packetId ?? null);
      setThread(data.thread ?? null);
      setMessage("");
      clearAttachments();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "CONSOLE_IA_PACKET_FAILED");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 left-5 z-50 grid h-14 min-w-[196px] grid-cols-[42px_1fr] items-center gap-2 rounded-2xl border border-cyan-300/60 bg-cyan-950/85 p-2 text-left text-cyan-50 shadow-[0_0_32px_rgba(34,211,238,.25)] backdrop-blur transition hover:border-cyan-200"
        aria-label="Ouvrir console IA"
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-200/30 bg-cyan-400/15 text-sm font-black">
          cIA
        </span>
        <span>
          <span className="block text-sm font-black leading-tight">console.IA</span>
          <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100/70">
            chat + media
          </span>
        </span>
      </button>

      {isOpen ? (
        <section
          aria-label="Console IA Central Brain"
          className="fixed bottom-24 left-5 z-50 grid max-h-[78vh] w-[min(1180px,calc(100vw-40px))] grid-rows-[auto_1fr] overflow-hidden rounded-2xl border border-cyan-300/50 bg-slate-950/96 text-slate-100 shadow-[0_28px_100px_rgba(0,0,0,.72)] backdrop-blur"
        >
          <header className="flex items-start justify-between gap-3 border-b border-slate-700/40 bg-cyan-950/35 p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
                Central Brain
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Console IA</h2>
              <p className="mt-1.5 text-xs leading-5 text-slate-400">
                Packet local durable · aucune API externe cachée.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-slate-600 bg-slate-900 text-slate-200 transition hover:border-cyan-300"
              aria-label="Fermer console IA"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="grid min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[260px_1fr_310px]">
            <aside className="max-h-56 overflow-auto border-b border-slate-800/80 p-3 lg:max-h-none lg:border-b-0 lg:border-r">
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
                Cibles console
              </p>
              <div className="grid gap-2">
                {TARGETS.map((target) => {
                  const bus = TARGET_BUS_BY_ID[target.id];
                  const visual = targetVisualStatus(target, selectedTargetId, activeRouteBuses, bus ? participantStatusById.get(bus) : undefined);
                  return (
                    <button
                      key={target.id}
                      type="button"
                      onClick={() => setSelectedTargetId(target.id)}
                      className={`rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-200/50 ${
                        target.id === selectedTargetId
                          ? "border-cyan-300/60 bg-cyan-400/10"
                          : "border-slate-800 bg-slate-900/70 hover:border-cyan-300/25"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-200/20 bg-cyan-400/10 text-[10px] font-black text-cyan-100">
                          {target.label.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-black text-white">{target.label}</span>
                          <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.08em] text-slate-400">
                            {target.scope}
                          </span>
                        </span>
                      </div>
                      {visual.showBadge ? (
                        <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black ${visualClassFor(visual.tone)}`}>
                          {visual.label}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </aside>

            <main className="grid min-h-0 grid-rows-[auto_1fr_auto] overflow-hidden">
	              <div className="border-b border-slate-800/80 p-4">
                <div className="grid gap-3 rounded-2xl border border-cyan-300/20 bg-slate-950/55 p-3 sm:grid-cols-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Cible</p>
                    <p className="mt-1 truncate text-sm font-black text-white">{selectedTarget.label}</p>
                  </div>
                  <div className="min-w-0 sm:border-l sm:border-slate-800 sm:pl-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Modèle</p>
                    <p className="mt-1 truncate text-sm font-black text-cyan-100">{selectedModelMode.label}</p>
                  </div>
                  <div className="min-w-0 sm:border-l sm:border-slate-800 sm:pl-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">Action</p>
                    <p className="mt-1 truncate text-sm font-black text-emerald-100">{selectedActionMode}</p>
                  </div>
                </div>
                <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100">
                    <Brain className="h-3.5 w-3.5" />
                    Modèle / lane
                  </div>
	                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                    {MODEL_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setSelectedModelModeId(mode.id)}
                        className={`rounded-xl border p-2 text-left transition ${
                          mode.id === selectedModelModeId
                            ? "border-cyan-200/80 bg-cyan-400/15 text-cyan-50 shadow-[0_0_0_1px_rgba(103,232,249,.18)]"
                            : "border-slate-800 bg-slate-900/65 text-slate-300 hover:border-slate-500/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-slate-400/40"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-xs font-black">
                          <Cpu className="h-3.5 w-3.5" />
                          {mode.label}
                        </span>
                        <span className="mt-1 block truncate text-[10px] uppercase tracking-[0.06em] text-slate-500">
                          {mode.model} · {mode.reasoning}
                        </span>
                      </button>
                    ))}
	                  </div>
	                  <PacketModeSelector value={selectedActionMode} onChange={setSelectedActionMode} />
	                </div>
	              </div>

              <div className="overflow-auto p-4">
                {thread?.messages.length ? (
                  <div className="grid gap-3">
                    {thread.messages.map((item) => {
                      const displayMessage = sanitizeMessageForDisplay(item.content, item.evidencePaths);
                      return (
                        <div
                          key={item.id}
                          className={`max-w-[88%] rounded-2xl border p-3 text-sm leading-6 ${
                            item.role === "user"
                              ? "ml-auto border-blue-300/35 bg-blue-950/35 text-blue-50"
                              : item.role === "agent"
                                ? "border-emerald-300/30 bg-emerald-950/25 text-emerald-50"
                                : item.role === "system"
                                  ? "border-slate-700 bg-slate-900/55 text-slate-300"
                                  : "border-cyan-300/25 bg-slate-900/80 text-slate-100"
                          }`}
                        >
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-cyan-200">
                              {item.title}
                            </p>
                            {item.status ? (
                              <span className="rounded-full border border-slate-600/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-300">
                                {item.status}
                              </span>
                            ) : null}
                            {displayMessage.proofCount ? (
                              <button
                                type="button"
                                onClick={() => setOpenInspectorSection("proofs")}
                                className="rounded-full border border-sky-300/30 bg-sky-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-sky-100"
                              >
                                {displayMessage.proofCount} preuves locales
                              </button>
                            ) : null}
                          </div>
                          <p className="whitespace-pre-wrap break-words">{displayMessage.content}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid place-items-center rounded-2xl border border-slate-800 bg-slate-950/40 p-8 text-center">
                    <p className="text-sm font-black text-slate-300">Prêt à envoyer un packet</p>
                    <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
                      Écris ton message, ajoute micro / écran / caméra / fichier si besoin, puis envoie.
                    </p>
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-cyan-300/20 bg-slate-950/70 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
                    Pièces jointes locales
                  </p>
                  {attachments.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">Aucune pièce jointe. Ajoute micro, écran, caméra, photo ou fichier.</p>
                  ) : (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {attachments.map((attachment) => (
                        <div key={attachment.id} className="rounded-xl border border-slate-800 bg-slate-900/75 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-white">{attachment.name}</p>
                              <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-400">
                                {attachment.kind} · {formatBytes(attachment.sizeBytes)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAttachment(attachment.id)}
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:border-rose-300 hover:text-rose-200"
                              aria-label={`Retirer ${attachment.name}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {attachment.previewUrl && attachment.mimeType.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element -- Local object URL preview; Next/Image cannot optimize this.
                            <img
                              src={attachment.previewUrl}
                              alt=""
                              className="mt-2 h-24 w-full rounded-lg border border-slate-800 object-cover"
                            />
                          ) : null}
                          {attachment.previewUrl && attachment.kind === "audio" ? (
                            <audio controls src={attachment.previewUrl} className="mt-2 w-full" />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

	                {packetResult ? (
	                  <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-100">
                    <p className="font-black uppercase tracking-[0.14em]">
                      {packetResult.status ?? "Packet local créé"}
                    </p>
                    <p className="mt-1">ID : {packetResult.packetId}</p>
                    <p>{proofItems.length} preuves locales disponibles.</p>
	                    {packetResult.files?.length ? <p>Fichiers stockés : {packetResult.files.length}</p> : null}
	                    {packetResult.routes?.length ? <p>Routes bus : {packetResult.routes.length}</p> : null}
	                    {packetResult.approval?.required ? <p>Action réelle : validation requise, aucune exécution dispatchée.</p> : null}
                    <button
                      type="button"
                      onClick={() => setOpenInspectorSection("proofs")}
                      className="mt-2 rounded-lg border border-emerald-300/35 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-100 hover:border-emerald-200"
                    >
                      Voir preuves
                    </button>
	                  </div>
	                ) : null}

                {submitError || mediaError ? (
                  <div className="mt-4 rounded-2xl border border-rose-400/35 bg-rose-500/10 p-3 text-xs text-rose-100">
                    {submitError ?? mediaError}
                  </div>
                ) : null}
                {threadError ? (
                  <div className="mt-4 rounded-2xl border border-amber-400/35 bg-amber-500/10 p-3 text-xs text-amber-100">
                    Thread polling: {threadError}
                  </div>
                ) : null}
              </div>

              <footer className="border-t border-slate-800 bg-slate-950/90 p-3">
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="tool-button is-primary">
                    <Bot className="h-4 w-4" /> Texte
                  </button>
                  <button
                    type="button"
                    onClick={isRecordingAudio ? stopAudioRecording : startAudioRecording}
                    className="tool-button is-media"
                  >
                    {isRecordingAudio ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {isRecordingAudio ? "Stop micro" : "Micro"}
                  </button>
                  <button type="button" onClick={captureScreen} className="tool-button is-media">
                    <MonitorUp className="h-4 w-4" /> Écran
                  </button>
                  <button type="button" onClick={captureCamera} className="tool-button is-media">
                    <Camera className="h-4 w-4" /> Caméra
                  </button>
                  <button type="button" onClick={() => imageInputRef.current?.click()} className="tool-button">
                    <ImageIcon className="h-4 w-4" /> Photo
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="tool-button">
                    <FileUp className="h-4 w-4" /> Fichier
                  </button>
                  <button
                    type="button"
                    onClick={submitPacket}
                    disabled={!canSubmit || isSubmitting}
                    className="tool-button is-send disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Send className="h-4 w-4" /> {isSubmitting ? "Création..." : "Envoyer packet"}
                  </button>
                  {attachments.length > 0 ? (
                    <button type="button" onClick={clearAttachments} className="tool-button">
                      <Paperclip className="h-4 w-4" /> Vider
                    </button>
                  ) : null}
                </div>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Message Erwin... cible: Central Council / Codex / Claude / ChatGPT / Kevin / Jarod / maison / agent"
                  className="mt-3 min-h-20 w-full resize-y rounded-xl border border-slate-700 bg-slate-900/90 p-3 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/60"
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.currentTarget.files) addFiles(event.currentTarget.files, "image");
                    event.currentTarget.value = "";
                  }}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.currentTarget.files) addFiles(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
              </footer>
            </main>

            <aside className="max-h-64 overflow-auto border-t border-slate-800 p-3 lg:max-h-none lg:border-l lg:border-t-0">
              <div className="mb-3 rounded-xl border border-cyan-300/20 bg-slate-950/70 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">Thread local</p>
                <h4 className="mt-2 truncate text-sm font-black text-white">
                  {thread?.target?.label ?? selectedTarget.label}
                </h4>
                <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-400">
                  {shortPacketId(thread?.packetId ?? activePacketId)} · {thread?.modelMode?.label ?? selectedModelMode.label}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1.5">
                  <span className="truncate text-xs font-black text-slate-100">
                    {primaryParticipant?.label ?? "Aucun agent actif"}
                  </span>
                  {primaryParticipant ? (
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${
                      primaryParticipant.status === "answered"
                        ? "border-emerald-300/35 text-emerald-200"
                        : primaryParticipant.status === "working"
                          ? "border-cyan-300/35 text-cyan-200"
                          : primaryParticipant.status === "queued"
                            ? "border-sky-300/30 text-sky-200"
                            : "border-slate-600 text-slate-400"
                    }`}
                    >
                      {primaryParticipant.status === "working" ? "ACTIF" : primaryParticipant.status === "answered" ? "ACTIF" : primaryParticipant.status}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
                {[
                  ["summary", "Résumé"],
                  ["timeline", `Timeline ${activeTimeline?.length ? `(${activeTimeline.length})` : ""}`],
                  ["proofs", `Preuves ${proofItems.length ? `(${proofItems.length})` : ""}`],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setOpenInspectorSection(id as InspectorSection)}
                    className={`rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] transition ${
                      openInspectorSection === id
                        ? "bg-cyan-400/14 text-cyan-50"
                        : "text-slate-500 hover:bg-slate-800/70 hover:text-slate-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {openInspectorSection === "summary" ? (
                <div className="grid gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    {primaryStatusBadges.length ? (
                      primaryStatusBadges.map((badge) => (
                        <ConsoleStatusBadge key={badge.id} label={badge.label} status={badge.status} detail={badge.detail} tone={badge.tone} />
                      ))
                    ) : (
                      <>
                        <ConsoleStatusBadge label="Console" status="LOCAL_GREEN" detail="Packet local OK" tone="ok" />
                        <ConsoleStatusBadge label="Externe" status="SAFE_LOCKED" detail="Verrouillé volontairement" tone="safe" />
                      </>
                    )}
                  </div>

	                  {secondaryStatusBadges.length ? (
	                    <p className="rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-1.5 text-[10px] leading-4 text-slate-400">
	                      {secondaryStatusBadges.map((badge) => `${badge.label}: ${badge.status}`).join(" · ")}
	                    </p>
	                  ) : null}

                  <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/8 p-3">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">Preuve live</p>
                    <div className="grid gap-1.5">
                      {liveProofItems.length ? liveProofItems.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 text-[10px] leading-4">
                          <span className="truncate text-slate-300">{item.label} · {item.status}</span>
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] ${visualClassFor(proofTone(item.status))}`}>
                            {item.status}
                          </span>
                        </div>
                      )) : (
                        <p className="text-[10px] text-slate-500">Preuves runtime en attente de thread.</p>
                      )}
                    </div>
                  </div>

	                  <div>
                    <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">Dernier event</p>
                    <LastTimelineEvent event={lastTimelineEvent} />
                  </div>

                  <p className="rounded-xl border border-sky-300/20 bg-sky-400/10 p-3 text-xs leading-5 text-sky-100">
                    {compactWhyText(displayStatusBadges)}
                  </p>

                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => setOpenInspectorSection("timeline")}
                      className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-200 hover:border-cyan-300/50"
                    >
                      Voir timeline
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenInspectorSection("proofs")}
                      className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-200 hover:border-cyan-300/50"
                    >
                      Voir preuves
                    </button>
                  </div>
                </div>
              ) : null}

              {openInspectorSection === "timeline" ? (
                <div>
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
                    Timeline complète
                  </p>
                  <ThreadTimeline timeline={activeTimeline} showPaths />
                </div>
              ) : null}

              {openInspectorSection === "proofs" ? (
                <div className="grid gap-4">
                  <div>
                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
                      Preuves locales
                    </p>
                    <LocalPathList items={proofItems} />
                  </div>
                  <div>
                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">
                      Pourquoi ce statut ?
                    </p>
                    <WhyStatusPanel actionMode={activeActionMode} routedBuses={activeRouteBuses} whyStatus={activeWhyStatus} />
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </section>
      ) : null}

      <style jsx>{`
        .tool-button {
          display: inline-flex;
          min-height: 34px;
          align-items: center;
          gap: 0.4rem;
          border-radius: 0.75rem;
          border: 1px solid rgba(148, 163, 184, 0.24);
          background: rgba(15, 23, 42, 0.78);
          padding: 0.45rem 0.65rem;
          color: #dbeafe;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          transition: border-color 120ms ease, background-color 120ms ease;
        }
        .tool-button:hover {
          border-color: rgba(103, 232, 249, 0.55);
        }
        .tool-button.is-primary {
          border-color: rgba(52, 211, 153, 0.42);
          background: rgba(6, 78, 59, 0.2);
          color: #bbf7d0;
        }
        .tool-button.is-media {
          border-color: rgba(125, 211, 252, 0.34);
          background: rgba(7, 89, 133, 0.14);
          color: #bae6fd;
        }
        .tool-button.is-send {
          margin-left: auto;
          border-color: rgba(52, 211, 153, 0.52);
          background: rgba(6, 78, 59, 0.34);
          color: #bbf7d0;
        }
      `}</style>
    </>
  );
}
