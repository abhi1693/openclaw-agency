"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { PipelineCanvas } from "@/components/pipelines/PipelineCanvas";
import { PipelineTemplateSelector } from "@/components/pipelines/PipelineTemplateSelector";
import type { StageConfig } from "@/components/pipelines/PipelineCanvas";
import type { PipelineTemplate } from "@/components/pipelines/PipelineTemplateSelector";

import { customFetch } from "@/api/mutator";
import { useTranslation } from "@/lib/i18n";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

const PIPELINE_TYPES = [
  "general",
  "review_flow",
  "release_flow",
  "onboarding",
] as const;

type PipelineType = (typeof PIPELINE_TYPES)[number];

type CreateStep = "template" | "configure";

export default function NewPipelinePage() {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const { t } = useTranslation();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const [step, setStep] = useState<CreateStep>("template");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pipelineType, setPipelineType] = useState<PipelineType>("general");
  const [stages, setStages] = useState<StageConfig[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTemplateSelect = (template: PipelineTemplate) => {
    setName(template.name);
    setDescription(template.description);
    setPipelineType((template.pipeline_type as PipelineType) ?? "general");
    setStages(template.stages);
    setStep("configure");
  };

  const handleSkipTemplate = () => {
    setStep("configure");
  };

  const handleCreate = async () => {
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await customFetch<{ data: { id: string } }>(
        "/api/v1/pipelines",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            pipeline_type: pipelineType,
            stages,
            trigger_config: null,
            is_active: true,
          }),
        },
      );
      const id = res.data?.id;
      router.push(id ? `/pipelines/${id}` : "/pipelines");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create pipeline.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardPageLayout
      signedOut={{
        message: t("pipelines.signInPrompt"),
        forceRedirectUrl: "/pipelines/new",
        signUpForceRedirectUrl: "/pipelines/new",
      }}
      title={t("pipelines.newPipeline")}
      description={t("pipelines.description")}
      isAdmin={isAdmin}
      adminOnlyMessage={t("pipelines.adminOnly")}
    >
      {step === "template" ? (
        <div className="space-y-6">
          <PipelineTemplateSelector onSelect={handleTemplateSelect} />
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleSkipTemplate}>
              {t("pipelines.canvas.addStage")} &rarr;
            </Button>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Basic fields */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("common.name")}
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Release review flow"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("pipelines.columns.type")}
                </label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={pipelineType}
                  onChange={(e) =>
                    setPipelineType(e.target.value as PipelineType)
                  }
                >
                  {PIPELINE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(
                        `pipelines.types.${type}` as Parameters<typeof t>[0],
                      )}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  {t("common.noDescription")}
                </label>
                <textarea
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>
          </div>

          {/* Stage canvas */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">
              {t("pipelines.columns.stages")}
            </h2>
            <PipelineCanvas stages={stages} onChange={setStages} />
          </div>

          {error ? <p className="text-sm text-red-500">{error}</p> : null}

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setStep("template")}
            >
              {t("common.back")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name.trim() || isSubmitting}
            >
              {isSubmitting ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      )}
    </DashboardPageLayout>
  );
}
