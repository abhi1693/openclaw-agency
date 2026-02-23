"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTranslation } from "@/lib/i18n";

export type AgentOption = {
  id: string;
  name: string;
  board_id?: string | null;
  board_name?: string | null;
};

export type AssignmentRow = {
  id: string;
  agent_id: string;
  agent_name?: string;
  board_id: string;
  board_name?: string;
  role: string;
};

type AgentAssignmentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  username: string;
  assignments: AssignmentRow[];
  agents: AgentOption[];
  isAssigning?: boolean;
  isUnassigning?: boolean;
  assignError?: string | null;
  onAssign: (agentId: string, boardId: string) => void;
  onUnassign: (agentId: string) => void;
};

export function AgentAssignmentDialog({
  open,
  onOpenChange,
  username,
  assignments,
  agents,
  isAssigning,
  isUnassigning,
  assignError,
  onAssign,
  onUnassign,
}: AgentAssignmentDialogProps) {
  const { t } = useTranslation();
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

  const assignedAgentIds = new Set(assignments.map((a) => a.agent_id));
  const availableAgents = agents.filter((a) => !assignedAgentIds.has(a.id));

  const handleAssign = () => {
    const agent = agents.find((a) => a.id === selectedAgentId);
    if (!agent || !agent.board_id) return;
    onAssign(agent.id, agent.board_id);
    setSelectedAgentId("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("h5Users.manageAssignments")}</DialogTitle>
          <DialogDescription>
            {t("h5Users.manageAssignmentsDesc").replace("{username}", username)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {assignments.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("h5Users.currentAssignments")}
              </p>
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {assignment.agent_name ?? assignment.agent_id}
                      </p>
                      {assignment.board_name ? (
                        <p className="text-xs text-slate-500">
                          {assignment.board_name}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-600 hover:text-rose-700"
                      disabled={isUnassigning}
                      onClick={() => onUnassign(assignment.agent_id)}
                    >
                      {t("h5Users.unassign")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t("h5Users.noAssignments")}</p>
          )}

          {availableAgents.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("h5Users.assignToAgent")}
              </p>
              <div className="flex gap-2">
                <select
                  className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                >
                  <option value="">{t("h5Users.selectAgent")}</option>
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                      {agent.board_name ? ` (${agent.board_name})` : ""}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={!selectedAgentId || isAssigning}
                  onClick={handleAssign}
                >
                  {isAssigning ? t("h5Users.assigning") : t("h5Users.assign")}
                </Button>
              </div>
            </div>
          ) : null}

          {assignError ? (
            <p className="text-sm text-rose-600">{assignError}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
