"use client";

export default function WorldControlError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-slate-200">
      <h2 className="text-lg font-black uppercase tracking-[0.2em] text-rose-300">
        World Control — erreur de rendu
      </h2>
      <p className="max-w-xl text-center text-sm text-slate-400">
        {error.message || "Une exception est survenue pendant le rendu de la ville."}
        {error.digest ? ` (digest ${error.digest})` : ""}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-cyan-300/40 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20"
      >
        Recharger la ville
      </button>
    </div>
  );
}
