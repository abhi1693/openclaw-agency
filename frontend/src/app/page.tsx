"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { useListProjectsProjectsGet } from "@/api/generated/projects/projects";

export default function Home() {
  const projects = useListProjectsProjectsGet();

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Company Mission Control</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Orval-generated client + React Query + shadcn-style components.
          </p>
        </div>
        <Button variant="outline" onClick={() => projects.refetch()} disabled={projects.isFetching}>
          Refresh
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>GET /projects</CardDescription>
          </CardHeader>
          <CardContent>
            {projects.isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
            {projects.error ? (
              <div className="text-sm text-destructive">{(projects.error as Error).message}</div>
            ) : null}
            {!projects.isLoading && !projects.error ? (
              <ul className="space-y-2">
                {projects.data?.map((p) => (
                  <li key={p.id ?? p.name} className="flex items-center justify-between rounded-md border p-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.status}</div>
                  </li>
                ))}
                {(projects.data?.length ?? 0) === 0 ? (
                  <li className="text-sm text-muted-foreground">No projects yet.</li>
                ) : null}
              </ul>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API</CardTitle>
            <CardDescription>Docs & health</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Docs:</span> <code className="ml-2">/docs</code>
            </div>
            <div className="text-muted-foreground">
              Set <code>NEXT_PUBLIC_API_URL</code> in <code>.env.local</code> (example: http://192.168.1.101:8000).
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
