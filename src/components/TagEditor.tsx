"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkCreateAndTagWatchlist, removeCibleWatchlist } from "@/lib/actions";

// Éditeur de tags (watchlists) sur la fiche : ajoute un tag existant ou nouveau
// (CAC40, Sport, Politique…), retire un tag.
export function TagEditor({
  cibleId,
  showSlug,
  keys,
  watchlists,
}: {
  cibleId: string;
  showSlug: string;
  keys: string[];
  watchlists: { key: string; label: string }[];
}) {
  const [val, setVal] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function add(label: string) {
    if (!label.trim()) return;
    start(async () => {
      await bulkCreateAndTagWatchlist({ ids: [cibleId], label: label.trim(), show_slug: showSlug });
      setVal("");
      router.refresh();
    });
  }
  function remove(key: string) {
    start(async () => {
      await removeCibleWatchlist({ cible_id: cibleId, watchlist_key: key, show_slug: showSlug });
      router.refresh();
    });
  }

  return (
    <section className="card p-5">
      <h2 className="label">Tags</h2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {keys.length === 0 && <span className="text-sm text-blanc-muted">Aucun tag.</span>}
        {keys.map((k) => (
          <span key={k} className="chip border-jaune/40 text-jaune">
            {k.toUpperCase()}
            <button
              onClick={() => remove(k)}
              disabled={pending}
              className="ml-1 text-jaune/60 hover:text-jaune"
              aria-label={`Retirer ${k}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-1">
        <input
          list="wl-options"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add(val)}
          placeholder="Ajouter un tag (CAC40, Sport…)"
          className="w-full rounded-lg border border-noir-600 bg-noir-900 px-2 py-1 text-sm outline-none placeholder:text-blanc-muted/60 focus:border-jaune"
        />
        <datalist id="wl-options">
          {watchlists.map((w) => (
            <option key={w.key} value={w.label} />
          ))}
        </datalist>
        <button onClick={() => add(val)} disabled={pending || !val.trim()} className="btn-ghost px-3 py-1 text-sm disabled:opacity-40">
          +
        </button>
      </div>
    </section>
  );
}
