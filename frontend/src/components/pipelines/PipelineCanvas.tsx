"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, Plus, Trash2 } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export type StageConfig = {
  id: string;
  name: string;
  type: "ai_task" | "approval" | "manual" | "webhook" | "condition";
  config: Record<string, unknown>;
  next_stage_id?: string | null;
  condition?: Record<string, unknown> | null;
};

type StageType = StageConfig["type"];

const STAGE_TYPES: StageType[] = [
  "ai_task",
  "approval",
  "manual",
  "webhook",
  "condition",
];

function generateId(): string {
  return `stage_${Math.random().toString(36).slice(2, 9)}`;
}

function buildLinkedList(stages: StageConfig[]): StageConfig[] {
  return stages.map((stage, index) => ({
    ...stage,
    next_stage_id: index < stages.length - 1 ? stages[index + 1].id : null,
  }));
}

function StageForm({
  stage,
  onUpdate,
  readOnly,
}: {
  stage: StageConfig;
  onUpdate: (updated: StageConfig) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();

  const handleNameChange = (name: string) => {
    onUpdate({ ...stage, name });
  };

  const handleConfigChange = (rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      onUpdate({ ...stage, config: parsed });
    } catch {
      // Keep existing config if JSON is invalid
    }
  };

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          {t("pipelines.canvas.stageName")}
        </label>
        <input
          type="text"
          disabled={readOnly}
          value={stage.name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          {t("pipelines.canvas.stageConfig")}
        </label>
        <textarea
          rows={3}
          disabled={readOnly}
          defaultValue={JSON.stringify(stage.config, null, 2)}
          onBlur={(e) => handleConfigChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          placeholder="{}"
        />
      </div>
    </div>
  );
}

function StageCard({
  stage,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUpdate,
  readOnly,
}: {
  stage: StageConfig;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onUpdate: (updated: StageConfig) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">
            {stage.name}
          </p>
          <p className="text-xs text-slate-500">
            {t(
              `pipelines.stageTypes.${stage.type}` as Parameters<
                typeof t
              >[0],
            ) ?? stage.type}
          </p>
        </div>

        {!readOnly ? (
          <div className="flex items-center gap-1">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              aria-label={t("pipelines.canvas.moveUp")}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === total - 1}
              aria-label={t("pipelines.canvas.moveDown")}
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              onClick={onRemove}
              aria-label={t("pipelines.canvas.removeStage")}
              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <button
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? t("pipelines.canvas.collapse") : t("pipelines.canvas.expand")}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {expanded ? (
        <StageForm stage={stage} onUpdate={onUpdate} readOnly={readOnly} />
      ) : null}
    </div>
  );
}

export function PipelineCanvas({
  stages,
  onChange,
  readOnly = false,
}: {
  stages: StageConfig[];
  onChange: (stages: StageConfig[]) => void;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const [newStageType, setNewStageType] = useState<StageType>("ai_task");

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...stages];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(buildLinkedList(next));
  };

  const handleMoveDown = (index: number) => {
    if (index === stages.length - 1) return;
    const next = [...stages];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(buildLinkedList(next));
  };

  const handleRemove = (index: number) => {
    const next = stages.filter((_, i) => i !== index);
    onChange(buildLinkedList(next));
  };

  const handleUpdate = (index: number, updated: StageConfig) => {
    const next = stages.map((s, i) => (i === index ? updated : s));
    onChange(buildLinkedList(next));
  };

  const handleAddStage = () => {
    const newStage: StageConfig = {
      id: generateId(),
      name: t(
        `pipelines.stageTypes.${newStageType}` as Parameters<typeof t>[0],
      ) ?? newStageType,
      type: newStageType,
      config: {},
      next_stage_id: null,
    };
    onChange(buildLinkedList([...stages, newStage]));
  };

  return (
    <div className="space-y-3">
      {stages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-400">{t("pipelines.canvas.noStages")}</p>
        </div>
      ) : (
        stages.map((stage, index) => (
          <div key={stage.id}>
            <StageCard
              stage={stage}
              index={index}
              total={stages.length}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
              onRemove={() => handleRemove(index)}
              onUpdate={(updated) => handleUpdate(index, updated)}
              readOnly={readOnly}
            />
            {index < stages.length - 1 ? (
              <div className="my-1 flex justify-center">
                <div className="h-4 w-0.5 bg-slate-200" />
              </div>
            ) : null}
          </div>
        ))
      )}

      {!readOnly ? (
        <div className="flex items-center gap-2 pt-2">
          <select
            value={newStageType}
            onChange={(e) => setNewStageType(e.target.value as StageType)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {STAGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(
                  `pipelines.stageTypes.${type}` as Parameters<typeof t>[0],
                ) ?? type}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={handleAddStage}>
            <Plus className="h-4 w-4" />
            {t("pipelines.canvas.addStage")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
