"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import {
  useCreateTeamTeamsPost,
  useListDepartmentsDepartmentsGet,
  useListEmployeesEmployeesGet,
  useListTeamsTeamsGet,
} from "@/api/generated/org/org";

export default function TeamsPage() {
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [leadEmployeeId, setLeadEmployeeId] = useState<string>("");

  const departments = useListDepartmentsDepartmentsGet();
  const employees = useListEmployeesEmployeesGet();
  const teams = useListTeamsTeamsGet({ department_id: undefined });

  const departmentList = useMemo(
    () => (departments.data?.status === 200 ? departments.data.data : []),
    [departments.data],
  );
  const employeeList = useMemo(
    () => (employees.data?.status === 200 ? employees.data.data : []),
    [employees.data],
  );
  const teamList = useMemo(() => (teams.data?.status === 200 ? teams.data.data : []), [teams.data]);

  const deptNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of departmentList) {
      if (d.id != null) m.set(d.id, d.name);
    }
    return m;
  }, [departmentList]);

  const empNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const e of employeeList) {
      if (e.id != null) m.set(e.id, e.name);
    }
    return m;
  }, [employeeList]);

  const createTeam = useCreateTeamTeamsPost({
    mutation: {
      onSuccess: () => {
        setName("");
        setDepartmentId("");
        setLeadEmployeeId("");
        teams.refetch();
      },
    },
  });

  const sorted = teamList
    .slice()
    .sort((a, b) => `${deptNameById.get(a.department_id) ?? ""}::${a.name}`.localeCompare(`${deptNameById.get(b.department_id) ?? ""}::${b.name}`));

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
          <p className="mt-1 text-sm text-muted-foreground">Teams live under departments. Projects are owned by teams.</p>
        </div>
        <Button variant="outline" onClick={() => teams.refetch()} disabled={teams.isFetching}>
          Refresh
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create team</CardTitle>
            <CardDescription>Define a team and attach it to a department.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">(select department)</option>
              {departmentList.map((d) => (
                <option key={d.id ?? d.name} value={d.id ?? ""}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select value={leadEmployeeId} onChange={(e) => setLeadEmployeeId(e.target.value)}>
              <option value="">(no lead)</option>
              {employeeList.map((e) => (
                <option key={e.id ?? e.name} value={e.id ?? ""}>
                  {e.name}
                </option>
              ))}
            </Select>
            <Button
              onClick={() =>
                createTeam.mutate({
                  data: {
                    name: name.trim(),
                    department_id: Number(departmentId),
                    lead_employee_id: leadEmployeeId ? Number(leadEmployeeId) : null,
                  },
                })
              }
              disabled={!name.trim() || !departmentId || createTeam.isPending}
            >
              Create
            </Button>
            {createTeam.error ? <div className="text-sm text-destructive">{(createTeam.error as Error).message}</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All teams</CardTitle>
            <CardDescription>{sorted.length} total</CardDescription>
          </CardHeader>
          <CardContent>
            {teams.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
            {teams.error ? <div className="text-sm text-destructive">{(teams.error as Error).message}</div> : null}
            {!teams.isLoading && !teams.error ? (
              <ul className="space-y-2">
                {sorted.map((t) => (
                  <li key={t.id ?? `${t.department_id}:${t.name}`} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-sm text-muted-foreground">{deptNameById.get(t.department_id) ?? `Dept#${t.department_id}`}</div>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {t.lead_employee_id ? <span>Lead: {empNameById.get(t.lead_employee_id) ?? `Emp#${t.lead_employee_id}`}</span> : <span>No lead</span>}
                    </div>
                  </li>
                ))}
                {sorted.length === 0 ? <li className="text-sm text-muted-foreground">No teams yet.</li> : null}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
