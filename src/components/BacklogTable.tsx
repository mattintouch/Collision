"use client";

// Lot 3 du chantier récap : liste filtrable du backlog produit. Tri par
// défaut : les nouveau d'abord, puis l'âge décroissant. Un item en statut
// nouveau depuis plus de 14 jours est signalé. Clic sur une ligne : le texte
// complet se déplie (les résumés de l'email renvoient ici, ancrés sur l'id
// court à 8 caractères).

import { useMemo, useState } from "react";

export interface BacklogItemVue {
  id: string;
  id8: string;
  type: string;
  resume: string;
  contenu: string;
  auteur: string;
  age_jours: number;
  statut: string;
  commentaire_triage: string | null;
  pr_url: string | null;
  en_retard: boolean;
}

const STATUTS = ["nouveau", "a_faire", "a_preciser", "rejete", "livre"] as const;
const TYPES = ["feature", "bug", "correction", "note"] as const;

const STATUT_STYLE: Record<string, { color: string; bg: string }> = {
  nouveau: { color: "#8A6E10", bg: "rgba(244,196,53,.18)" },
  a_faire: { color: "#1D6FD8", bg: "rgba(29,111,216,.1)" },
  a_preciser: { color: "#5C5850", bg: "rgba(20,20,20,.05)" },
  rejete: { color: "#8A857D", bg: "rgba(20,20,20,.04)" },
  livre: { color: "#177A4C", bg: "rgba(23,122,76,.1)" },
};
const TYPE_STYLE: Record<string, string> = {
  feature: "#141414",
  bug: "#E63946",
  correction: "#1D6FD8",
  note: "#8A857D",
};

export function BacklogTable({ items }: { items: BacklogItemVue[] }) {
  const [statut, setStatut] = useState<string>("tous");
  const [type, setType] = useState<string>("tous");
  const [ouvert, setOuvert] = useState<string | null>(null);

  const liste = useMemo(() => {
    return items
      .filter((i) => (statut === "tous" ? true : i.statut === statut))
      .filter((i) => (type === "tous" ? true : i.type === type))
      .sort((a, b) =>
        (a.statut === "nouveau" ? 0 : 1) - (b.statut === "nouveau" ? 0 : 1) || b.age_jours - a.age_jours
      );
  }, [items, statut, type]);

  const compteRetard = items.filter((i) => i.en_retard).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="label" style={{ fontSize: "10px" }}>Statut</span>
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="rounded-lg border border-noir-600 bg-transparent px-2 py-1 text-sm"
          aria-label="Filtrer par statut"
        >
          <option value="tous" className="bg-white">tous</option>
          {STATUTS.map((s) => (
            <option key={s} value={s} className="bg-white">{s}</option>
          ))}
        </select>
        <span className="label ml-3" style={{ fontSize: "10px" }}>Type</span>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-noir-600 bg-transparent px-2 py-1 text-sm"
          aria-label="Filtrer par type"
        >
          <option value="tous" className="bg-white">tous</option>
          {TYPES.map((t) => (
            <option key={t} value={t} className="bg-white">{t}</option>
          ))}
        </select>
        <span className="ml-auto text-blanc-muted">
          {liste.length} item{liste.length > 1 ? "s" : ""}
          {compteRetard > 0 ? `, ${compteRetard} en attente depuis plus de 14 jours` : ""}
        </span>
      </div>

      {liste.length === 0 && (
        <div className="card p-8 text-center text-sm text-blanc-muted">Rien avec ces filtres.</div>
      )}

      {liste.map((i) => {
        const st = STATUT_STYLE[i.statut] ?? STATUT_STYLE.a_preciser;
        const deplie = ouvert === i.id;
        return (
          <div
            key={i.id}
            id={i.id8}
            className="card cursor-pointer px-4 py-3"
            style={i.en_retard ? { borderLeft: "3px solid #E63946" } : undefined}
            onClick={() => setOuvert(deplie ? null : i.id)}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="chip mono" style={{ color: TYPE_STYLE[i.type] ?? "#141414", fontSize: "10px", fontWeight: 700, letterSpacing: ".08em" }}>
                {i.type.toUpperCase()}
              </span>
              <span className="chip mono" style={{ color: st.color, background: st.bg, borderColor: "transparent", fontSize: "10px", fontWeight: 600 }}>
                {i.statut}
              </span>
              <span className="text-blanc-muted">{i.auteur}</span>
              <span className="text-blanc-muted" title={i.en_retard ? "en statut nouveau depuis plus de 14 jours" : undefined}>
                {i.age_jours} j{i.en_retard ? " ⚠" : ""}
              </span>
              <span className="mono text-blanc-dim" style={{ fontSize: "11px" }}>{i.id8}</span>
              {i.pr_url && (
                <a
                  href={i.pr_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm"
                  style={{ color: "#1D6FD8" }}
                >
                  PR ↗
                </a>
              )}
            </div>
            <p className="mt-2 text-[13.5px] leading-[1.45]">{i.resume}</p>
            {i.commentaire_triage && (
              <p className="mt-1 text-[12.5px] text-blanc-muted">Triage : {i.commentaire_triage}</p>
            )}
            {deplie && (
              <div className="mt-3 border-t border-noir-600 pt-3">
                <p className="label mb-1" style={{ fontSize: "10px" }}>Texte complet</p>
                <p className="whitespace-pre-wrap text-[13px] leading-[1.5]">{i.contenu}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
