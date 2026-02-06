"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@clerk/nextjs";

import {
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiBaseUrl } from "@/lib/api-base";

const apiBase = getApiBaseUrl();

type BoardDraft = {
  board_type?: string;
  objective?: string | null;
  success_metrics?: Record<string, unknown> | null;
  target_date?: string | null;
};

type BoardSummary = {
  id: string;
  name: string;
  slug: string;
  board_type?: string;
  objective?: string | null;
  success_metrics?: Record<string, unknown> | null;
  target_date?: string | null;
  goal_confirmed?: boolean;
};

type OnboardingSession = {
  id: string;
  board_id: string;
  session_key: string;
  status: string;
  messages?: Array<{ role: string; content: string }> | null;
  draft_goal?: BoardDraft | null;
};

type QuestionOption = { id: string; label: string };

type Question = {
  question: string;
  options: QuestionOption[];
};

const normalizeQuestion = (value: unknown): Question | null => {
  if (!value || typeof value !== "object") return null;
  const data = value as { question?: unknown; options?: unknown };
  if (typeof data.question !== "string" || !Array.isArray(data.options)) return null;
  const options: QuestionOption[] = data.options
    .map((option, index) => {
      if (typeof option === "string") {
        return { id: String(index + 1), label: option };
      }
      if (option && typeof option === "object") {
        const raw = option as { id?: unknown; label?: unknown };
        const label =
          typeof raw.label === "string" ? raw.label : typeof raw.id === "string" ? raw.id : null;
        if (!label) return null;
        return {
          id: typeof raw.id === "string" ? raw.id : String(index + 1),
          label,
        };
      }
      return null;
    })
    .filter((option): option is QuestionOption => Boolean(option));
  if (!options.length) return null;
  return { question: data.question, options };
};

const parseQuestion = (messages?: Array<{ role: string; content: string }> | null) => {
  if (!messages?.length) return null;
  const lastAssistant = [...messages].reverse().find((msg) => msg.role === "assistant");
  if (!lastAssistant?.content) return null;
  try {
    return normalizeQuestion(JSON.parse(lastAssistant.content));
  } catch {
    const match = lastAssistant.content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return normalizeQuestion(JSON.parse(match[1]));
      } catch {
        return null;
      }
    }
  }
  return null;
};

export function BoardOnboardingChat({
  boardId,
  onConfirmed,
}: {
  boardId: string;
  onConfirmed: (board: BoardSummary) => void;
}) {
  const { getToken } = useAuth();
  const [session, setSession] = useState<OnboardingSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  const question = useMemo(() => parseQuestion(session?.messages), [session]);
  const draft = session?.draft_goal ?? null;

  useEffect(() => {
    setSelectedOptions([]);
    setOtherText("");
  }, [question?.question]);

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = await getToken();
      return fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.headers ?? {}),
        },
      });
    },
    [getToken]
  );

  const startSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${apiBase}/api/v1/boards/${boardId}/onboarding/start`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Unable to start onboarding.");
      const data = (await res.json()) as OnboardingSession;
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start onboarding.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, boardId]);

  const refreshSession = useCallback(async () => {
    try {
      const res = await authFetch(`${apiBase}/api/v1/boards/${boardId}/onboarding`);
      if (!res.ok) return;
      const data = (await res.json()) as OnboardingSession;
      setSession(data);
    } catch {
      // ignore
    }
  }, [authFetch, boardId]);

  useEffect(() => {
    startSession();
    const interval = setInterval(refreshSession, 2000);
    return () => clearInterval(interval);
  }, [startSession, refreshSession]);

  const handleAnswer = useCallback(
    async (value: string, freeText?: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await authFetch(
          `${apiBase}/api/v1/boards/${boardId}/onboarding/answer`,
          {
            method: "POST",
            body: JSON.stringify({
              answer: value,
              other_text: freeText ?? null,
            }),
          }
        );
        if (!res.ok) throw new Error("Unable to submit answer.");
        const data = (await res.json()) as OnboardingSession;
        setSession(data);
        setOtherText("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit answer.");
      } finally {
        setLoading(false);
      }
    },
    [authFetch, boardId]
  );

  const toggleOption = useCallback((label: string) => {
    setSelectedOptions((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  }, []);

  const submitAnswer = useCallback(() => {
    const trimmedOther = otherText.trim();
    if (selectedOptions.length === 0 && !trimmedOther) return;
    const answer =
      selectedOptions.length > 0 ? selectedOptions.join(", ") : "Other";
    void handleAnswer(answer, trimmedOther || undefined);
  }, [handleAnswer, otherText, selectedOptions]);

  const confirmGoal = async () => {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(
        `${apiBase}/api/v1/boards/${boardId}/onboarding/confirm`,
        {
          method: "POST",
          body: JSON.stringify({
            board_type: draft.board_type ?? "goal",
            objective: draft.objective ?? null,
            success_metrics: draft.success_metrics ?? null,
            target_date: draft.target_date ?? null,
          }),
        }
      );
      if (!res.ok) throw new Error("Unable to confirm board goal.");
      const updated = await res.json();
      onConfirmed(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm board goal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Board onboarding</DialogTitle>
      </DialogHeader>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {draft ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Review the lead agent draft and confirm.
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-900">Objective</p>
            <p className="text-slate-700">{draft.objective || "—"}</p>
            <p className="mt-3 font-semibold text-slate-900">Success metrics</p>
            <pre className="mt-1 whitespace-pre-wrap text-xs text-slate-600">
              {JSON.stringify(draft.success_metrics ?? {}, null, 2)}
            </pre>
            <p className="mt-3 font-semibold text-slate-900">Target date</p>
            <p className="text-slate-700">{draft.target_date || "—"}</p>
            <p className="mt-3 font-semibold text-slate-900">Board type</p>
            <p className="text-slate-700">{draft.board_type || "goal"}</p>
          </div>
          <DialogFooter>
            <Button onClick={confirmGoal} disabled={loading}>
              Confirm goal
            </Button>
          </DialogFooter>
        </div>
      ) : question ? (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-900">{question.question}</p>
          <div className="space-y-2">
            {question.options.map((option) => {
              const isSelected = selectedOptions.includes(option.label);
              return (
                <Button
                  key={option.id}
                  variant={isSelected ? "primary" : "secondary"}
                  className="w-full justify-start"
                  onClick={() => toggleOption(option.label)}
                  disabled={loading}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
          <div className="space-y-2">
            <Input
              placeholder="Other..."
              value={otherText}
              onChange={(event) => setOtherText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (loading) return;
                submitAnswer();
              }}
            />
            <Button
              variant="outline"
              onClick={submitAnswer}
              disabled={
                loading ||
                (selectedOptions.length === 0 && !otherText.trim())
              }
            >
              {loading ? "Sending..." : "Next"}
            </Button>
            {loading ? (
              <p className="text-xs text-slate-500">Sending your answer…</p>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {loading ? "Waiting for the lead agent..." : "Preparing onboarding..."}
        </div>
      )}
    </div>
  );
}
