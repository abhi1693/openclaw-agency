"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth, useUser } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";
import { Mail, RotateCcw, Save, Trash2, User } from "lucide-react";

import {
  useDeleteMeApiV1UsersMeDelete,
  getGetMeApiV1UsersMeGetQueryKey,
  type getMeApiV1UsersMeGetResponse,
  useGetMeApiV1UsersMeGet,
  useUpdateMeApiV1UsersMePatch,
} from "@/api/generated/users/users";
import { ApiError } from "@/api/mutator";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Input } from "@/components/ui/input";
import SearchableSelect from "@/components/ui/searchable-select";
import { getSupportedTimezones } from "@/lib/timezones";
import { useLanguage } from "@/lib/i18n";
import { t } from "@/lib/translations";

type ClerkGlobal = {
  signOut?: (options?: { redirectUrl?: string }) => Promise<void> | void;
};

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { language } = useLanguage();

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState<string | null>(null);
  const [nameEdited, setNameEdited] = useState(false);
  const [timezoneEdited, setTimezoneEdited] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const meQuery = useGetMeApiV1UsersMeGet<
    getMeApiV1UsersMeGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn),
      retry: false,
      refetchOnMount: "always",
    },
  });
  const meQueryKey = getGetMeApiV1UsersMeGetQueryKey();

  const profile = meQuery.data?.status === 200 ? meQuery.data.data : null;
  const clerkFallbackName =
    user?.fullName ?? user?.firstName ?? user?.username ?? "";
  const displayEmail =
    profile?.email ?? user?.primaryEmailAddress?.emailAddress ?? "";
  const resolvedName = nameEdited
    ? name
    : (profile?.name ?? profile?.preferred_name ?? clerkFallbackName);
  const resolvedTimezone = timezoneEdited
    ? (timezone ?? "")
    : (profile?.timezone ?? "");

  const timezones = useMemo(() => getSupportedTimezones(), []);
  const timezoneOptions = useMemo(
    () => timezones.map((value) => ({ value, label: value })),
    [timezones],
  );

  const updateMeMutation = useUpdateMeApiV1UsersMePatch<ApiError>({
    mutation: {
      onSuccess: async () => {
        setSaveError(null);
        setSaveSuccess(t(language, "settings_saved"));
        await queryClient.invalidateQueries({ queryKey: meQueryKey });
      },
      onError: (error) => {
        setSaveSuccess(null);
        setSaveError(error.message || t(language, "common_error"));
      },
    },
  });

  const deleteAccountMutation = useDeleteMeApiV1UsersMeDelete<ApiError>({
    mutation: {
      onSuccess: async () => {
        setDeleteError(null);
        if (typeof window !== "undefined") {
          const clerk = (window as Window & { Clerk?: ClerkGlobal }).Clerk;
          if (clerk?.signOut) {
            try {
              await clerk.signOut({ redirectUrl: "/sign-in" });
              return;
            } catch {
              // Fall through to local redirect.
            }
          }
        }
        router.replace("/sign-in");
      },
      onError: (error) => {
        setDeleteError(error.message || t(language, "common_error"));
      },
    },
  });

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSignedIn) return;
    if (!resolvedName.trim() || !resolvedTimezone.trim()) {
      setSaveSuccess(null);
      setSaveError(t(language, "settings_name_tz_required"));
      return;
    }
    setSaveError(null);
    setSaveSuccess(null);
    await updateMeMutation.mutateAsync({
      data: {
        name: resolvedName.trim(),
        timezone: resolvedTimezone.trim(),
      },
    });
  };

  const handleReset = () => {
    setName("");
    setTimezone(null);
    setNameEdited(false);
    setTimezoneEdited(false);
    setSaveError(null);
    setSaveSuccess(null);
  };

  const isSaving = updateMeMutation.isPending;

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: t(language, "settings_sign_in"),
          forceRedirectUrl: "/settings",
          signUpForceRedirectUrl: "/settings",
        }}
        title={t(language, "settings_title")}
        description={t(language, "settings_desc")}
      >
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">
              {t(language, "settings_profile")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {t(language, "settings_profile_desc")}
            </p>

            <form onSubmit={handleSave} className="mt-6 space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <User className="h-4 w-4 text-slate-500" />
                    {t(language, "settings_name")}
                  </label>
                  <Input
                    value={resolvedName}
                    onChange={(event) => {
                      setName(event.target.value);
                      setNameEdited(true);
                    }}
                    placeholder={t(language, "settings_name_placeholder")}
                    disabled={isSaving}
                    className="border-slate-300 text-slate-900 focus-visible:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    {t(language, "settings_timezone")}
                  </label>
                  <SearchableSelect
                    ariaLabel={t(language, "settings_timezone")}
                    value={resolvedTimezone}
                    onValueChange={(value) => {
                      setTimezone(value);
                      setTimezoneEdited(true);
                    }}
                    options={timezoneOptions}
                    placeholder={t(language, "settings_timezone")}
                    searchPlaceholder={language === "zh" ? "搜索时区…" : "Search timezones..."}
                    emptyMessage={language === "zh" ? "未找到匹配时区。" : "No matching timezones."}
                    disabled={isSaving}
                    triggerClassName="w-full h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    contentClassName="rounded-xl border border-slate-200 shadow-lg"
                    itemClassName="px-4 py-3 text-sm text-slate-700 data-[selected=true]:bg-slate-50 data-[selected=true]:text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Mail className="h-4 w-4 text-slate-500" />
                  {t(language, "settings_email")}
                </label>
                <Input
                  value={displayEmail}
                  readOnly
                  disabled
                  className="border-slate-200 bg-slate-50 text-slate-600"
                />
              </div>

              {saveError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {saveError}
                </div>
              ) : null}
              {saveSuccess ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  {saveSuccess}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={isSaving}>
                  <Save className="h-4 w-4" />
                  {isSaving ? t(language, "settings_saving") : t(language, "settings_save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleReset}
                  disabled={isSaving}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t(language, "settings_reset")}
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-rose-200 bg-rose-50/70 p-6 shadow-sm">
            <h2 className="text-base font-semibold text-rose-900">
              {t(language, "settings_delete_account")}
            </h2>
            <p className="mt-1 text-sm text-rose-800">
              {t(language, "settings_delete_desc")}
            </p>
            <div className="mt-4">
              <Button
                type="button"
                className="bg-rose-600 text-white hover:bg-rose-700"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteDialogOpen(true);
                }}
                disabled={deleteAccountMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
                {t(language, "settings_delete_account")}
              </Button>
            </div>
          </section>
        </div>
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={t(language, "settings_delete_title")}
        description={t(language, "settings_delete_dialog_desc")}
        onConfirm={() => deleteAccountMutation.mutate()}
        isConfirming={deleteAccountMutation.isPending}
        errorMessage={deleteError}
        confirmLabel={t(language, "settings_delete_account")}
        confirmingLabel={t(language, "settings_deleting")}
        ariaLabel={t(language, "settings_delete_title")}
      />
    </>
  );
}
