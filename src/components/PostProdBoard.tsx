"use client";

// Board Post-prod (kanban) + fiche rédac en modale, sur la même page.
// Colonne d'une carte = l'étape la moins avancée des trois statuts
// (script/montage/illustration) : c'est elle qui bloque l'épisode.

import { useMemo, useState } from "react";
import type { PostProdEpisode } from "@/lib/data";
import { Modal } from "./Modal";
import { EpisodePublicationForm } from "./EpisodePublicationForm";

const STATUT_DOT: Record<string, string> = {
  "à faire": "#C6C2B9",
  "en cours": "#F2C14E",
  "à revoir": "#D0803F",
  "en review": "#3B82F6",
  validé: "#1F9D6B",
};

const LANES: { champ: "statut_script" | "statut_montage" | "statut_illustration"; label: string }[] = [
  { champ: "statut_script", label: "Script" },
  { champ: "statut_montage", label: "Montage" },
  { champ: "statut_illustration", label: "Illustration" },
];

function dot(statut: string) {
  return STATUT_DOT[statut] ?? "#C6C2B9";
}

/** Étape la moins avancée des trois = colonne de la carte. Égalité : script
 *  passe avant montage avant illustration (ordre de la chaîne de prod). */
function colonneBottleneck(ep: PostProdEpisode, ordre: string[]): string {
  const position = (statut: string) => {
    const i = ordre.indexOf(statut);
    return i === -1 ? ordre.length : i;
  };
  return LANES.map((l) => String(ep.episode[l.champ] ?? ordre[0]))
    .sort((a, b) => position(a) - position(b))[0];
}

export function PostProdBoard({
  showSlug,
  episodes,
  statutsProduction,
  statutsMedia,
  estAdmin,
}: {
  showSlug: string;
  episodes: PostProdEpisode[];
  statutsProduction: string[];
  statutsMedia: string[];
  estAdmin: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const colonnes = useMemo(() => {
    const parColonne = new Map<string, PostProdEpisode[]>(statutsProduction.map((s) => [s, []]));
    for (const ep of episodes) {
      const colonne = colonneBottleneck(ep, statutsProduction);
      if (!parColonne.has(colonne)) parColonne.set(colonne, []);
      parColonne.get(colonne)!.push(ep);
    }
    return parColonne;
  }, [episodes, statutsProduction]);

  const selected = episodes.find((ep) => ep.id === selectedId) ?? null;

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {statutsProduction.map((statut) => {
          const items = colonnes.get(statut) ?? [];
          return (
            <div key={statut} className="w-72 flex-shrink-0">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-blanc">{statut}</h2>
                <span className="rounded-chip bg-noir-700 px-2 py-0.5 text-xs text-blanc-muted">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.length === 0 && (
                  <div className="rounded-card border border-dashed border-noir-600 p-4 text-center text-xs text-blanc-dim">
                    Aucun épisode ici
                  </div>
                )}
                {items.map((ep) => {
                  const titre = String(ep.episode.titre ?? "") || ep.cible_nom;
                  const numero = ep.episode.numero as number | null;
                  return (
                    <button
                      key={ep.id}
                      onClick={() => setSelectedId(ep.id)}
                      className="card block w-full p-3 text-left transition-shadow hover:shadow-raised"
                    >
                      {numero != null && (
                        <div className="mb-1 font-mono text-xs text-blanc-dim">#{numero}</div>
                      )}
                      <div className="text-sm font-semibold leading-snug text-blanc">{titre}</div>
                      <div className="mt-0.5 text-xs text-blanc-muted">
                        {ep.cible_nom}
                        {ep.cible_organisation ? ` · ${ep.cible_organisation}` : ""}
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {LANES.map((l) => {
                          const v = String(ep.episode[l.champ] ?? "à faire");
                          return (
                            <span key={l.champ} className="chip border-noir-600 text-blanc-muted">
                              <span
                                className="inline-block h-1.5 w-1.5 rounded-full"
                                style={{ background: dot(v) }}
                              />
                              {l.label}
                            </span>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? `Rédac — ${String(selected.episode.titre ?? "") || selected.cible_nom}` : ""}
        maxWidthClassName="max-w-3xl"
      >
        {selected && (
          <div className="max-h-[75vh] overflow-y-auto pr-1">
            <EpisodePublicationForm
              showSlug={showSlug}
              episode={selected.episode as Record<string, unknown> & { id: string; nom: string }}
              estAdmin={estAdmin}
              statutsProduction={statutsProduction}
              statutsMedia={statutsMedia}
            />
          </div>
        )}
      </Modal>
    </>
  );
}
