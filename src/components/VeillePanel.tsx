"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runVeilleAction } from "@/lib/actions";
import { SIGNAL_LABELS } from "@/lib/domain";
import type { VeilleItem } from "@/lib/veille/engine";

export function VeillePanel({ showSlug }: { showSlug: string }) {
  const [items, setItems] = useState<VeilleItem[] | null>(null);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function run() {
    setError(null);
    start(async () => {
      const res = await runVeilleAction({ show_slug: showSlug });
      if (res.ok) {
        setItems(res.items);
        setDemo(res.demo);
        if (!res.demo) router.refresh();
      } else {
        setError(res.error ?? "Erreur");
      }
    });
  }

  return (
    <div>
      <button onClick={run} disabled={pending} className="btn-jaune">
        {pending ? "Veille en cours…" : "Lancer la veille"}
      </button>
      {demo && items && (
        <span className="ml-3 chip border-transparent bg-jaune/10 text-jaune">
          démo
        </span>
      )}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      {items && (
        <div className="mt-5 space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-blanc-muted">
              Rien de saillant. Pas de relance sans raison fraîche.
            </p>
          ) : (
            items.map((it, i) => (
              <div key={i} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{it.cible_nom}</span>
                      <span className="chip border-jaune/40 text-jaune">
                        {SIGNAL_LABELS[it.type]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm">{it.titre}</p>
                    {it.resume && (
                      <p className="mt-1 text-sm text-blanc-muted">{it.resume}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-blanc-muted">
                    {it.date ?? ""} · pertinence {it.pertinence}/5
                  </span>
                </div>
                {it.source && (
                  <a
                    href={it.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs text-blanc-muted underline hover:text-blanc"
                  >
                    Source
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
