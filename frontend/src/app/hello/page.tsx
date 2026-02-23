"use client";

export const dynamic = "force-dynamic";

import { Waves } from "lucide-react";

import { ApiError } from "@/api/mutator";
import {
  type getHelloApiV1HelloGetResponse,
  useGetHelloApiV1HelloGet,
} from "@/api/generated/hello/hello";
import { DashboardShell } from "@/components/templates/DashboardShell";

export default function HelloPage() {
  const helloQuery = useGetHelloApiV1HelloGet<
    getHelloApiV1HelloGetResponse,
    ApiError
  >({
    query: {
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });

  const isLoading = helloQuery.isLoading;
  const error = helloQuery.error;
  const message = helloQuery.data?.status === 200 ? helloQuery.data.data.message : null;

  return (
    <DashboardShell>
      <main className="flex-1 overflow-y-auto bg-slate-50">
        <div className="mx-auto max-w-2xl px-8 py-16">
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="text-center">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                <Waves className="h-8 w-8 text-blue-600" />
              </div>
              
              <h1 className="font-heading text-2xl font-semibold text-slate-900 tracking-tight">
                Hello Page
              </h1>
              
              <p className="mt-2 text-sm text-slate-500">
                Basic connectivity test endpoint
              </p>
            </div>

            <div className="mt-8">
              {isLoading ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
                  Loading greeting message…
                </div>
              ) : error ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <p className="font-medium">Error loading greeting</p>
                  <p className="mt-1 text-red-600">{error.message}</p>
                </div>
              ) : message ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
                  <p className="text-lg font-medium text-slate-900">
                    {message}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </main>
    </DashboardShell>
  );
}
