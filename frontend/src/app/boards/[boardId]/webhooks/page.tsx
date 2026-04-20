"use client";

export const dynamic = "force-dynamic";

import { useParams } from "next/navigation";

import { SignInButton, SignedIn, SignedOut } from "@/auth/clerk";

import { boardWebhooks } from "@/api/generated/board-webhooks/board-webhooks";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

export default function WebhooksPage() {
  const params = useParams();
  const boardIdParam = params?.boardId;
  const boardId = Array.isArray(boardIdParam) ? boardIdParam[0] : boardIdParam;

  return (
    <DashboardShell>
      <SignedOut>
        <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl surface-panel p-10 text-center">
          <p className="text-sm text-muted">Sign in to view webhooks.</p>
          <SignInButton
            mode="modal"
            forceRedirectUrl="/boards"
            signUpForceRedirectUrl="/boards"
          >
            <Button>Sign in</Button>
          </SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100">
          <div className="p-4 md:p-6">
            {boardId ? (
              <WebhooksPanel boardId={boardId} />
            ) : (
              <p className="text-sm text-muted">No board selected.</p>
            )}
          </div>
        </main>
      </SignedIn>
    </DashboardShell>
  );
}

function WebhooksPanel({ boardId }: { boardId: string }) {
  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["webhooks", boardId],
    queryFn: () => boardWebhooks({ boardId }),
  });

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-muted">Loading webhooks…</p>
      </div>
    );
  }

  if (!webhooks || webhooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
        <p className="text-sm font-medium">No webhooks configured</p>
        <p className="text-xs text-muted">
          Add a webhook to receive real-time event notifications for this board.
        </p>
        <Button asChild>
          <a href={`/boards/${boardId}/edit?tab=webhooks`} className="mt-2">
            Add webhook
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Webhooks</h2>
        <Button asChild size="sm">
          <a href={`/boards/${boardId}/edit?tab=webhooks`}>Add webhook</a>
        </Button>
      </div>
      <div className="space-y-2">
        {webhooks.map((wh) => (
          <div
            key={wh.id}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="font-medium">{wh.description || "Unnamed webhook"}</p>
              <p className="text-xs text-muted">{wh.id}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={`/boards/${boardId}/webhooks/${wh.id}/payloads`}>
                View payloads
              </a>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
