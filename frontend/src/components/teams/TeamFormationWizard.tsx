"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useTranslation } from "@/lib/i18n";
import { customFetch } from "@/api/mutator";

type WizardStep = 1 | 2 | 3;

const TEAM_TYPES = [
  "custom",
  "task_force",
  "review_committee",
  "specialist_pool",
] as const;

type TeamType = (typeof TEAM_TYPES)[number];

export function TeamFormationWizard() {
  const { t } = useTranslation();
  const router = useRouter();

  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamType, setTeamType] = useState<TeamType>("custom");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canProceed = step === 1 ? name.trim().length > 0 : true;

  const handleNext = () => {
    if (step < 3) setStep((s) => (s + 1) as WizardStep);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as WizardStep);
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await customFetch<{ data: { id: string } }>(
        "/api/v1/agent-teams",
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            team_type: teamType,
          }),
        },
      );
      const id = response.data?.id;
      if (id) {
        router.push(`/teams/${id}`);
      } else {
        router.push("/teams");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      {/* Step indicators */}
      <div className="mb-8 flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                s <= step
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {s}
            </div>
            <span className="text-xs text-slate-500">
              {t(`teams.wizard.step${s}` as Parameters<typeof t>[0])}
            </span>
            {s < 3 && <div className="h-px w-8 bg-slate-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Team details */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("teams.teamName")}
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder={t("teams.teamNamePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("teams.description")}
            </label>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder={t("teams.descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {t("teams.teamType")}
            </label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={teamType}
              onChange={(e) => setTeamType(e.target.value as TeamType)}
            >
              {TEAM_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`teams.teamTypes.${type}` as Parameters<typeof t>[0])}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Step 2: Members (placeholder — members can be added after creation) */}
      {step === 2 && (
        <div className="py-8 text-center text-sm text-slate-500">
          <p>
            Members can be added after the team is created from the team detail
            page.
          </p>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-4 text-sm">
            <dl className="space-y-2">
              <div className="flex gap-3">
                <dt className="w-28 flex-shrink-0 font-medium text-slate-600">
                  {t("teams.teamName")}
                </dt>
                <dd className="text-slate-900">{name}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 flex-shrink-0 font-medium text-slate-600">
                  {t("teams.teamType")}
                </dt>
                <dd className="text-slate-900">
                  {t(`teams.teamTypes.${teamType}` as Parameters<typeof t>[0])}
                </dd>
              </div>
              {description ? (
                <div className="flex gap-3">
                  <dt className="w-28 flex-shrink-0 font-medium text-slate-600">
                    {t("teams.description")}
                  </dt>
                  <dd className="text-slate-900">{description}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          {error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : null}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={handleBack}
          disabled={step === 1}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("teams.wizard.back")}
        </button>
        {step < 3 ? (
          <button
            onClick={handleNext}
            disabled={!canProceed}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("teams.wizard.next")}
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? t("common.saving") : t("teams.wizard.finish")}
          </button>
        )}
      </div>
    </div>
  );
}
