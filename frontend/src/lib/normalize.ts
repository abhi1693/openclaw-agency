import type { Department } from "@/api/generated/model/department";

// Local activity shape (not generated as a model)
export type Activity = {
  id?: number;
  actor_employee_id?: number | null;
  entity_type?: string;
  entity_id?: number | null;
  verb?: string;
  payload?: unknown;
  created_at?: string;
};
import type { Employee } from "@/api/generated/model/employee";
import type { AgentOnboarding } from "@/api/generated/model/agentOnboarding";
import type { EmploymentAction } from "@/api/generated/model/employmentAction";
import type { HeadcountRequest } from "@/api/generated/model/headcountRequest";
import type { Project } from "@/api/generated/model/project";
import type { Task } from "@/api/generated/model/task";
import type { ProjectMember } from "@/api/generated/model/projectMember";
import type { TaskComment } from "@/api/generated/model/taskComment";

export function normalizeEmployees(data: unknown): Employee[] {
  if (Array.isArray(data)) return data as Employee[];
  if (data && typeof data === "object" && "data" in data) {
    const maybe = (data as { data?: unknown }).data;
    if (Array.isArray(maybe)) return maybe as Employee[];
  }
  return [];
}

export function normalizeDepartments(data: unknown): Department[] {
  if (Array.isArray(data)) return data as Department[];
  if (data && typeof data === "object" && "data" in data) {
    const maybe = (data as { data?: unknown }).data;
    if (Array.isArray(maybe)) return maybe as Department[];
  }
  return [];
}

export function normalizeHeadcountRequests(data: unknown): HeadcountRequest[] {
  if (Array.isArray(data)) return data as HeadcountRequest[];
  if (data && typeof data === "object" && "data" in data) {
    const maybe = (data as { data?: unknown }).data;
    if (Array.isArray(maybe)) return maybe as HeadcountRequest[];
  }
  return [];
}

export function normalizeEmploymentActions(data: unknown): EmploymentAction[] {
  if (Array.isArray(data)) return data as EmploymentAction[];
  if (data && typeof data === "object" && "data" in data) {
    const maybe = (data as { data?: unknown }).data;
    if (Array.isArray(maybe)) return maybe as EmploymentAction[];
  }
  return [];
}

export function normalizeAgentOnboardings(data: unknown): AgentOnboarding[] {
  if (Array.isArray(data)) return data as AgentOnboarding[];
  if (data && typeof data === "object" && "data" in data) {
    const maybe = (data as { data?: unknown }).data;
    if (Array.isArray(maybe)) return maybe as AgentOnboarding[];
  }
  return [];
}

export function normalizeActivities(data: unknown): Activity[] {
  if (Array.isArray(data)) return data as Activity[];
  if (data && typeof data === "object" && "data" in data) {
    const maybe = (data as { data?: unknown }).data;
    if (Array.isArray(maybe)) return maybe as Activity[];
  }
  return [];
}

export function normalizeProjects(data: unknown): Project[] {
  if (Array.isArray(data)) return data as Project[];
  if (data && typeof data === "object" && "data" in data) {
    const maybe = (data as { data?: unknown }).data;
    if (Array.isArray(maybe)) return maybe as Project[];
  }
  return [];
}

export function normalizeTasks(data: unknown): Task[] {
  if (Array.isArray(data)) return data as Task[];
  if (data && typeof data === "object" && "data" in data) {
    const maybe = (data as { data?: unknown }).data;
    if (Array.isArray(maybe)) return maybe as Task[];
  }
  return [];
}

export function normalizeTaskComments(data: unknown): TaskComment[] {
  if (Array.isArray(data)) return data as TaskComment[];
  if (data && typeof data === "object" && "data" in data) {
    const maybe = (data as { data?: unknown }).data;
    if (Array.isArray(maybe)) return maybe as TaskComment[];
  }
  return [];
}

export function normalizeProjectMembers(data: unknown): ProjectMember[] {
  if (Array.isArray(data)) return data as ProjectMember[];
  if (data && typeof data === "object" && "data" in data) {
    const maybe = (data as { data?: unknown }).data;
    if (Array.isArray(maybe)) return maybe as ProjectMember[];
  }
  return [];
}
