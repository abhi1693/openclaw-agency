"use client";

export const dynamic = "force-dynamic";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { TeamFormationWizard } from "@/components/teams/TeamFormationWizard";
import { useTranslation } from "@/lib/i18n";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

export default function NewTeamPage() {
  const { isSignedIn } = useAuth();
  const { t } = useTranslation();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  return (
    <DashboardPageLayout
      signedOut={{
        message: t("teams.signInPrompt"),
        forceRedirectUrl: "/teams/new",
        signUpForceRedirectUrl: "/teams/new",
      }}
      title={t("teams.createTeam")}
      description={t("teams.noTeamsDesc")}
      isAdmin={isAdmin}
      adminOnlyMessage={t("teams.adminOnly")}
    >
      <TeamFormationWizard />
    </DashboardPageLayout>
  );
}
