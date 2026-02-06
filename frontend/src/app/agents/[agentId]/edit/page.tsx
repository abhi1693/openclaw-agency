"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { SignInButton, SignedIn, SignedOut, useAuth } from "@clerk/nextjs";

import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SearchableSelect, {
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getApiBaseUrl } from "@/lib/api-base";
import {
  DEFAULT_IDENTITY_PROFILE,
  DEFAULT_SOUL_TEMPLATE,
} from "@/lib/agent-templates";

const apiBase = getApiBaseUrl();

type Agent = {
  id: string;
  name: string;
  board_id?: string | null;
  is_gateway_main?: boolean;
  heartbeat_config?: {
    every?: string;
    target?: string;
  } | null;
  identity_profile?: IdentityProfile | null;
  identity_template?: string | null;
  soul_template?: string | null;
};

type Board = {
  id: string;
  name: string;
  slug: string;
};

type IdentityProfile = {
  role: string;
  communication_style: string;
  emoji: string;
};

const EMOJI_OPTIONS = [
  { value: ":gear:", label: "Gear", glyph: "⚙️" },
  { value: ":sparkles:", label: "Sparkles", glyph: "✨" },
  { value: ":rocket:", label: "Rocket", glyph: "🚀" },
  { value: ":megaphone:", label: "Megaphone", glyph: "📣" },
  { value: ":chart_with_upwards_trend:", label: "Growth", glyph: "📈" },
  { value: ":bulb:", label: "Idea", glyph: "💡" },
  { value: ":wrench:", label: "Builder", glyph: "🔧" },
  { value: ":shield:", label: "Shield", glyph: "🛡️" },
  { value: ":memo:", label: "Notes", glyph: "📝" },
  { value: ":brain:", label: "Brain", glyph: "🧠" },
];

const HEARTBEAT_TARGET_OPTIONS: SearchableSelectOption[] = [
  { value: "none", label: "None (no outbound message)" },
  { value: "last", label: "Last channel" },
];

const getBoardOptions = (boards: Board[]): SearchableSelectOption[] =>
  boards.map((board) => ({
    value: board.id,
    label: board.name,
  }));

const normalizeIdentityProfile = (
  profile: IdentityProfile
): IdentityProfile | null => {
  const normalized: IdentityProfile = {
    role: profile.role.trim(),
    communication_style: profile.communication_style.trim(),
    emoji: profile.emoji.trim(),
  };
  const hasValue = Object.values(normalized).some((value) => value.length > 0);
  return hasValue ? normalized : null;
};

const withIdentityDefaults = (
  profile: Partial<IdentityProfile> | null | undefined
): IdentityProfile => ({
  role: profile?.role ?? DEFAULT_IDENTITY_PROFILE.role,
  communication_style:
    profile?.communication_style ?? DEFAULT_IDENTITY_PROFILE.communication_style,
  emoji: profile?.emoji ?? DEFAULT_IDENTITY_PROFILE.emoji,
});

export default function EditAgentPage() {
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const params = useParams();
  const agentIdParam = params?.agentId;
  const agentId = Array.isArray(agentIdParam) ? agentIdParam[0] : agentIdParam;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [name, setName] = useState("");
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState("");
  const [boardTouched, setBoardTouched] = useState(false);
  const [isGatewayMain, setIsGatewayMain] = useState(false);
  const [heartbeatEvery, setHeartbeatEvery] = useState("10m");
  const [heartbeatTarget, setHeartbeatTarget] = useState("none");
  const [identityProfile, setIdentityProfile] = useState<IdentityProfile>({
    ...DEFAULT_IDENTITY_PROFILE,
  });
  const [soulTemplate, setSoulTemplate] = useState(DEFAULT_SOUL_TEMPLATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBoards = async () => {
    if (!isSignedIn) return;
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/v1/boards`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!response.ok) {
        throw new Error("Unable to load boards.");
      }
      const data = (await response.json()) as Board[];
      setBoards(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const loadAgent = async () => {
    if (!isSignedIn || !agentId) return;
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/v1/agents/${agentId}`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!response.ok) {
        throw new Error("Unable to load agent.");
      }
      const data = (await response.json()) as Agent;
      setAgent(data);
      setName(data.name);
      setIsGatewayMain(Boolean(data.is_gateway_main));
      if (!data.is_gateway_main && data.board_id) {
        setBoardId(data.board_id);
      } else {
        setBoardId("");
      }
      setBoardTouched(false);
      if (data.heartbeat_config?.every) {
        setHeartbeatEvery(data.heartbeat_config.every);
      }
      if (data.heartbeat_config?.target) {
        setHeartbeatTarget(data.heartbeat_config.target);
      }
      setIdentityProfile(withIdentityDefaults(data.identity_profile));
      setSoulTemplate(data.soul_template?.trim() || DEFAULT_SOUL_TEMPLATE);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBoards();
    loadAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, agentId]);

  useEffect(() => {
    if (boardTouched || boardId || isGatewayMain) return;
    if (agent?.board_id) {
      setBoardId(agent.board_id);
      return;
    }
    if (boards.length > 0) {
      setBoardId(boards[0].id);
    }
  }, [agent, boards, boardId, isGatewayMain, boardTouched]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSignedIn || !agentId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Agent name is required.");
      return;
    }
    if (!isGatewayMain && !boardId) {
      setError("Select a board or mark this agent as the gateway main.");
      return;
    }
    if (isGatewayMain && !boardId && !agent?.is_gateway_main && !agent?.board_id) {
      setError(
        "Select a board once so we can resolve the gateway main session key."
      );
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const payload: Record<string, unknown> = {
        name: trimmed,
        heartbeat_config: {
          every: heartbeatEvery.trim() || "10m",
          target: heartbeatTarget,
        },
        identity_profile: normalizeIdentityProfile(identityProfile),
        soul_template: soulTemplate.trim() || null,
      };
      if (!isGatewayMain) {
        payload.board_id = boardId || null;
      } else if (boardId) {
        payload.board_id = boardId;
      }
      if (agent?.is_gateway_main !== isGatewayMain) {
        payload.is_gateway_main = isGatewayMain;
      }
      const response = await fetch(
        `${apiBase}/api/v1/agents/${agentId}?force=true`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        throw new Error("Unable to update agent.");
      }
      router.push(`/agents/${agentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DashboardShell>
      <SignedOut>
        <div className="col-span-2 flex min-h-[calc(100vh-64px)] items-center justify-center bg-slate-50 p-10 text-center">
          <div className="rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-sm">
            <p className="text-sm text-slate-600">Sign in to edit agents.</p>
            <SignInButton
              mode="modal"
              forceRedirectUrl={`/agents/${agentId}/edit`}
              signUpForceRedirectUrl={`/agents/${agentId}/edit`}
            >
              <Button className="mt-4">Sign in</Button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
      <SignedIn>
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-8 py-6">
            <div>
              <h1 className="font-heading text-2xl font-semibold text-slate-900 tracking-tight">
                {agent?.name ?? "Edit agent"}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Status is controlled by agent heartbeat.
              </p>
            </div>
          </div>

          <div className="p-8">
            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Basic configuration
                </p>
                <div className="mt-4 space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-900">
                        Agent name <span className="text-red-500">*</span>
                      </label>
                      <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="e.g. Deploy bot"
                        disabled={isLoading}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-900">
                        Role
                      </label>
                      <Input
                        value={identityProfile.role}
                        onChange={(event) =>
                          setIdentityProfile((current) => ({
                            ...current,
                            role: event.target.value,
                          }))
                        }
                        placeholder="e.g. Founder, Social Media Manager"
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-900">
                          Board
                          {isGatewayMain ? (
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              optional
                            </span>
                          ) : (
                            <span className="text-red-500"> *</span>
                          )}
                        </label>
                        {boardId ? (
                          <button
                            type="button"
                            className="text-xs font-medium text-slate-600 hover:text-slate-900"
                            onClick={() => {
                              setBoardTouched(true);
                              setBoardId("");
                            }}
                            disabled={isLoading}
                          >
                            Clear board
                          </button>
                        ) : null}
                      </div>
                      <SearchableSelect
                        ariaLabel="Select board"
                        value={boardId}
                        onValueChange={(value) => {
                          setBoardTouched(true);
                          setBoardId(value);
                        }}
                        options={getBoardOptions(boards)}
                        placeholder={isGatewayMain ? "No board (main agent)" : "Select board"}
                        searchPlaceholder="Search boards..."
                        emptyMessage="No matching boards."
                        triggerClassName="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        contentClassName="rounded-xl border border-slate-200 shadow-lg"
                        itemClassName="px-4 py-3 text-sm text-slate-700 data-[selected=true]:bg-slate-50 data-[selected=true]:text-slate-900"
                        disabled={boards.length === 0}
                      />
                      {isGatewayMain ? (
                        <p className="text-xs text-slate-500">
                          Main agents are not attached to a board. If a board is
                          selected, it is only used to resolve the gateway main
                          session key and will be cleared on save.
                        </p>
                      ) : boards.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          Create a board before assigning agents.
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-900">
                        Emoji
                      </label>
                      <Select
                        value={identityProfile.emoji}
                        onValueChange={(value) =>
                          setIdentityProfile((current) => ({
                            ...current,
                            emoji: value,
                          }))
                        }
                        disabled={isLoading}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select emoji" />
                        </SelectTrigger>
                        <SelectContent>
                          {EMOJI_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.glyph} {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-200"
                      checked={isGatewayMain}
                      onChange={(event) => setIsGatewayMain(event.target.checked)}
                      disabled={isLoading}
                    />
                    <span>
                      <span className="block font-medium text-slate-900">
                        Gateway main agent
                      </span>
                      <span className="block text-xs text-slate-500">
                        Uses the gateway main session key and is not tied to a
                        single board.
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Personality & behavior
                </p>
                <div className="mt-4 space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">
                      Communication style
                    </label>
                    <Input
                      value={identityProfile.communication_style}
                      onChange={(event) =>
                        setIdentityProfile((current) => ({
                          ...current,
                          communication_style: event.target.value,
                        }))
                      }
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">
                      Soul template
                    </label>
                    <Textarea
                      value={soulTemplate}
                      onChange={(event) => setSoulTemplate(event.target.value)}
                      rows={10}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Schedule & notifications
                </p>
                <div className="mt-4 grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">
                      Interval
                    </label>
                    <Input
                      value={heartbeatEvery}
                      onChange={(event) => setHeartbeatEvery(event.target.value)}
                      placeholder="e.g. 10m"
                      disabled={isLoading}
                    />
                    <p className="text-xs text-slate-500">
                      Set how often this agent runs HEARTBEAT.md.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900">
                      Target
                    </label>
                    <SearchableSelect
                      ariaLabel="Select heartbeat target"
                      value={heartbeatTarget}
                      onValueChange={setHeartbeatTarget}
                      options={HEARTBEAT_TARGET_OPTIONS}
                      placeholder="Select target"
                      searchPlaceholder="Search targets..."
                      emptyMessage="No matching targets."
                      triggerClassName="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                      contentClassName="rounded-xl border border-slate-200 shadow-lg"
                      itemClassName="px-4 py-3 text-sm text-slate-700 data-[selected=true]:bg-slate-50 data-[selected=true]:text-slate-900"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>

              {error ? (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600 shadow-sm">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => router.push(`/agents/${agentId}`)}
                >
                  Back to agent
                </Button>
              </div>
            </form>
          </div>
        </main>
      </SignedIn>
    </DashboardShell>
  );
}
