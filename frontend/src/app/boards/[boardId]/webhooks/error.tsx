"use client";

import { useEffect } from "react";

export default function WebhooksError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[webhooks] ErrorBoundary caught:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-10 text-center">
      <p className="text-sm font-medium text-red-700">Failed to load webhooks</p>
      <p className="text-xs text-red-500">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
      >
        Try again
      </button>
    </div>
  );
}

export function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[webhooks] GlobalError caught:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-10 text-center">
      <p className="text-sm font-medium text-red-700">
        Something went wrong loading webhooks
      </p>
      <p className="text-xs text-red-500">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
      >
        Reload page
      </button>
    </div>
  );
}
