"use client";

import { useMemo, useState } from "react";
import type { CibleEnrichie, Show, Stage } from "@/lib/types";
import { ARCHETYPE_LABELS, ARCHETYPE_ORDER, VOIE_LABELS, computeResurgence } from "@/lib/domain";
import { TargetCard } from "./TargetCard";

/** Tri de résurgence : voie froide devant, puis score décroissant. */
function sortResurgence(a: CibleEnrichie, b: CibleEnrichie) {
  if (a.voie !== b.voie) return a.voie === "froid" ? -1 : 1;
  return computeResurgence(b).score - computeResurgence(a).score;
}

function Column({ title, hint, cibles, show }: { title: string; hint?: string; cibles: CibleEnrichie[]; show: Show }) {
  return (
    <div className="flex w-80 shrink-0 flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide">{title}</h2>
          {hint && <p className="text-xs text-blanc-muted">{hint}</p>}
        </div>
        <span className="text-xs text-blanc-muted">{cibles.length}</span>
      </div>
      <div className="flex flex-col gap-3">
        {cibles.length === 0 ? (
          <p className="rounded-card border border-dashed border-noir-600 p-4 text-center text-xs text-blanc-muted">
            Aucune cible
          </p>
        ) : (
          cibles.sort(sortResurgence).map((c) => <TargetCard key={c.id} cible={c} show={show} />)
        )}
      </div>
    </div>
  );
}

export function Board({ show, stages, cibles }: { show: Show; stages: Stage[]; cibles: CibleEnrichie[] }) {
  const [watchlists, setWatchlists] = useState<Set<string>>(new Set());
  const [voie, setVoie] = useState<"all" | "froid" | "chaud">("all");
  const [query, setQuery] = useState("");

  // Clés de watchlist présentes dans les données → chips de filtre.
  const availableWatchlists = useMemo(() => {
    const set = new Set<string>();
    for (const c of cibles) for (const k of c.watchlist_keys ?? []) set.add(k);
    return Array.from(set).sort();
  }, [cibles]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cibles.filter((c) => {
      if (voie !== "all" && c.voie !== voie) return false;
      if (watchlists.size > 0 && !(c.watchlist_keys ?? []).some((k) => watchlists.has(k))) return false;
      if (q && !c.nom.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cibles, voie, watchlists, query]);

  function toggleWatchlist(key: string) {
    setWatchlists((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasFilter = watchlists.size > 0 || voie !== "all" || query.trim() !== "";

  return (
    <div>
      {/* Barre de filtres : restreint toutes les colonnes (axe « qui »), les
          colonnes gardent l'axe « avancement » (archétype / étape). */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un nom…"
          className="w-44 rounded-lg border border-noir-600 bg-noir-900 px-3 py-1.5 text-sm outline-none placeholder:text-blanc-muted/60 focus:border-jaune"
        />

        <span className="ml-1 text-xs text-blanc-muted">Voie</span>
        {(["all", "froid", "chaud"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVoie(v)}
            className={`chip border-transparent ${voie === v ? "bg-jaune text-noir-900" : "bg-noir-700 text-blanc-muted hover:text-blanc"}`}
          >
            {v === "all" ? "Toutes" : VOIE_LABELS[v]}
          </button>
        ))}

        {availableWatchlists.length > 0 && <span className="ml-1 text-xs text-blanc-muted">Watchlist</span>}
        {availableWatchlists.map((k) => (
          <button
            key={k}
            onClick={() => toggleWatchlist(k)}
            className={`chip ${watchlists.has(k) ? "border-transparent bg-jaune text-noir-900" : "border-jaune/40 text-jaune hover:bg-jaune/10"}`}
          >
            {k.toUpperCase()}
          </button>
        ))}

        {hasFilter && (
          <button
            onClick={() => {
              setWatchlists(new Set());
              setVoie("all");
              setQuery("");
            }}
            className="chip border-noir-600 text-blanc-muted hover:text-blanc"
          >
            Réinitialiser ✕
          </button>
        )}
      </div>

      {show.type_pipe === "invites" ? (
        <div className="flex gap-5 overflow-x-auto pb-4">
          {ARCHETYPE_ORDER.map((arch) => (
            <Column
              key={arch}
              title={ARCHETYPE_LABELS[arch]}
              cibles={filtered.filter((c) => c.archetype === arch)}
              show={show}
            />
          ))}
          <Column title="À classer" hint="archétype manquant" cibles={filtered.filter((c) => !c.archetype)} show={show} />
        </div>
      ) : (
        <div className="flex gap-5 overflow-x-auto pb-4">
          {stages.map((st) => (
            <Column key={st.id} title={st.label} cibles={filtered.filter((c) => c.stage_id === st.id)} show={show} />
          ))}
        </div>
      )}
    </div>
  );
}
