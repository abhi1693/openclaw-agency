"use client";

import { useParams } from "next/navigation";

import { SignInButton, SignedIn, SignedOut } from "@clerk/nextjs";

import { BoardApprovalsPanel } from "@/components/BoardApprovalsPanel";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { Button } from "@/components/ui/button";

export default function BoardApprovalsPage() {
  const params = useParams();
  const boardIdParam = params?.boardId;
  const boardId = Array.isArray(boardIdParam) ? boardIdParam[0] : boardIdParam;

  return (
    <DashboardShell>
      <SignedOut>
        <div className="flex h-full flex-col items-center justify-center gap-4 rounded-2xl surface-panel p-10 text-center">
          <p className="text-sm text-muted">Sign in to view approvals.</p>
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
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-slate-100">
          <div className="p-6">
            {boardId ? (
              <div className="h-[calc(100vh-160px)] min-h-[520px]">
                <BoardApprovalsPanel boardId={boardId} scrollable />
              </div>
            ) : null}
          </div>
        </main>
      </SignedIn>
    </DashboardShell>
  );
}
