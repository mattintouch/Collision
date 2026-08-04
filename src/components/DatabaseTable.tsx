"use client";

// Table Database : recherche + filtres statut/sujet/série sur les cibles du
// show. Ligne cliquable → fiche cible existante (/cible/[id]), même source de
// vérité que le Board.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CibleEnrichie } from "@/lib/types";
import type { EpisodePubliRef } from "@/lib/data";
import { PRIORITE_LABELS } from "@/lib/domain";

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export function DatabaseTable({
  showSlug,
  cibles,
  watchlists,
  episodeRefs,
}: {
  showSlug: string;
  cibles: CibleEnrichie[];
  watchlists: { key: string; label: string }[];
  episodeRefs: EpisodePubliRef[];
}) {
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("tous");
  const [sujet, setSujet] = useState("tous");
  const [serie, setSerie] = useState("toutes");

  const labelSerie = useMemo(() => new Map(watchlists.map((w) => [w.key, w.label])), [watchlists]);
  const episodeParCible = useMemo(() => new Map(episodeRefs.map((e) => [e.cible_id, e])), [episodeRefs]);

  const statuts = useMemo(
    () => [...new Set(cibles.map((c) => c.stage_label).filter((s): s is string => !!s))],
    [cibles]
  );
  const sujets = useMemo(
    () => [...new Set(cibles.flatMap((c) => c.sujets ?? []))].sort(),
    [cibles]
  );

  const filtered = cibles.filter((c) => {
    if (statut !== "tous" && c.stage_label !== statut) return false;
    if (sujet !== "tous" && !(c.sujets ?? []).includes(sujet)) return false;
    if (serie !== "toutes" && !(c.watchlist_keys ?? []).includes(serie)) return false;
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      const haystack = `${c.nom} ${c.organisation ?? ""}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });

  const select = "rounded-control border border-noir-600 bg-noir-800 px-3 py-2 text-sm text-blanc";

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un invité, une entreprise…"
          className={`${select} min-w-56 flex-1`}
        />
        <select value={statut} onChange={(e) => setStatut(e.target.value)} className={select}>
          <option value="tous">Tous les statuts</option>
          {statuts.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={sujet} onChange={(e) => setSujet(e.target.value)} className={select}>
          <option value="tous">Tous les sujets</option>
          {sujets.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={serie} onChange={(e) => setSerie(e.target.value)} className={select}>
          <option value="toutes">Toutes les séries</option>
          {watchlists.map((w) => (
            <option key={w.key} value={w.key}>{w.label}</option>
          ))}
        </select>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-noir-600 text-xs text-blanc-muted">
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Organisation</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Priorité</th>
              <th className="px-4 py-3 font-medium">Sujets</th>
              <th className="px-4 py-3 font-medium">Série</th>
              <th className="px-4 py-3 font-medium">Épisode</th>
              <th className="px-4 py-3 font-medium">Publication</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-blanc-dim">
                  Aucune cible ne correspond à ces filtres.
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const ep = episodeParCible.get(c.id);
              return (
                <tr key={c.id} className="border-b border-noir-700 last:border-0 hover:bg-[var(--glass-1)]">
                  <td className="px-4 py-3">
                    <Link href={`/${showSlug}/cible/${c.id}`} className="font-medium text-blanc hover:text-jaune">
                      {c.nom}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-blanc-muted">{c.organisation ?? c.secteur ?? "—"}</td>
                  <td className="px-4 py-3">
                    {c.stage_label ? <span className="chip border-noir-600 text-blanc-muted">{c.stage_label}</span> : "—"}
                  </td>
                  <td className="px-4 py-3 text-blanc-muted">{PRIORITE_LABELS[c.priorite] ?? c.priorite}</td>
                  <td className="px-4 py-3 text-blanc-muted">{(c.sujets ?? []).join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-blanc-muted">
                    {(c.watchlist_keys ?? []).map((k) => labelSerie.get(k) ?? k).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-blanc-muted">
                    {ep ? `${ep.numero != null ? `#${ep.numero} · ` : ""}${ep.titre ?? "—"}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-blanc-muted">{ep ? fmt(ep.date_publication) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
