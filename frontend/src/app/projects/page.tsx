"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "@/app/_components/Shell.module.css";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import {
  useCreateProjectProjectsPost,
  useListProjectsProjectsGet,
} from "@/api/generated/projects/projects";

import { useListTeamsTeamsGet } from "@/api/generated/org/org";

export default function ProjectsPage() {
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState<string>("");

  const projects = useListProjectsProjectsGet();
  const teams = useListTeamsTeamsGet({ department_id: undefined });
  const projectList = projects.data?.status === 200 ? projects.data.data : [];
  const teamList = teams.data?.status === 200 ? teams.data.data : [];
  const createProject = useCreateProjectProjectsPost({
    mutation: {
      onSuccess: () => {
        setName("");
        setTeamId("");
        projects.refetch();
      },
    },
  });

  const sorted = projectList.slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main>
      <div className={styles.topbar}>
        <div>
          <h1 className={styles.h1}>Projects</h1>
          <p className={styles.p}>Create, view, and drill into projects.</p>
        </div>
        <Button variant="outline" onClick={() => projects.refetch()} disabled={projects.isFetching}>
          Refresh
        </Button>
      </div>

      <div className={styles.grid2}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Create project</div>
          {projects.isLoading ? <div className={styles.mono}>Loading…</div> : null}
          {projects.error ? <div className={styles.mono}>{(projects.error as Error).message}</div> : null}
          <div className={styles.list}>
            <Input placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Owning team</span>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid #333', background: 'transparent' }}>
                <option value="">(none)</option>
                {teamList.map((t) => (
                  <option key={t.id ?? t.name} value={t.id ?? ''}>{t.name}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={() => createProject.mutate({ data: { name, status: "active", team_id: teamId ? Number(teamId) : null } })}
              disabled={!name.trim() || createProject.isPending || projects.isFetching}
            >
              Create
            </Button>
            {createProject.error ? (
              <div className={styles.mono}>{(createProject.error as Error).message}</div>
            ) : null}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All projects</CardTitle>
            <CardDescription>{sorted.length} total</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={styles.list}>
              {sorted.map((p) => (
                <div key={p.id ?? p.name} className={styles.item}>
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <div className={styles.mono} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span>{p.status}</span>
                    {p.id ? (
                      <Link href={`/projects/${p.id}`} className={styles.badge}>Open</Link>
                    ) : null}
                  </div>
                </div>
              ))}
              {sorted.length === 0 ? <div className={styles.mono}>No projects yet.</div> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
