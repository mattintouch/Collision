"use client";

// File de qualification (chantier 3 du 27/07). Chaque ligne se traite en deux
// gestes : un clic d'archétype (la priorité sélectionnée part avec) ou
// archiver. La ligne quitte la file dès que l'écriture aboutit. Les noms
// factices détectés portent un badge : l'archivage est leur sortie naturelle.
// Rebranchement 2 (schéma de référence) : les attributs de Louis (genre,
// catégories, score social, première neige, investisseur) se posent au même
// geste, sur une seconde ligne de réglages facultatifs.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { CibleEnrichie, Priorite, Show } from "@/lib/types";
import { ARCHETYPE_LABELS, ARCHETYPE_ORDER, PRIORITE_LABELS, isPlaceholder } from "@/lib/domain";
import { archiverCible, qualifierCible } from "@/lib/actions";
import type { ReferenceInput } from "@/lib/qualification";

const PRIORITES: Priorite[] = ["haute", "moyenne", "basse"];

export function QualifierQueue({ show, cibles, genres }: { show: Show; cibles: CibleEnrichie[]; genres: string[] }) {
  const [traitees, setTraitees] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState<string | null>(null);
  const [priorites, setPriorites] = useState<Record<string, Priorite>>({});
  const [refs, setRefs] = useState<Record<string, ReferenceInput & { categorieTexte?: string }>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [, start] = useTransition();

  const majRef = (id: string, champ: Partial<ReferenceInput & { categorieTexte?: string }>) =>
    setRefs((r) => ({ ...r, [id]: { ...r[id], ...champ } }));

  // Le patch de référence part avec le clic d'archétype : uniquement les
  // champs touchés par l'opérateur, rien par défaut.
  const referencePour = (id: string): ReferenceInput | undefined => {
    const r = refs[id];
    if (!r) return undefined;
    const out: ReferenceInput = {};
    if (r.genre !== undefined) out.genre = r.genre;
    if (r.social_score !== undefined) out.social_score = r.social_score;
    if (r.premiere_neige !== undefined) out.premiere_neige = r.premiere_neige;
    if (r.tag_investisseur !== undefined) out.tag_investisseur = r.tag_investisseur;
    if (r.categorieTexte !== undefined) out.categorie = r.categorieTexte.split(",").map((c) => c.trim()).filter(Boolean);
    return Object.keys(out).length ? out : undefined;
  };

  // Vraies cibles d'abord (priorité déclarée puis nom), noms factices en fin
  // de file : leur traitement est l'archivage, pas la qualification.
  const liste = useMemo(() => {
    const rangPrio: Record<string, number> = { haute: 0, moyenne: 1, basse: 2 };
    return [...cibles]
      .filter((c) => !traitees.has(c.id))
      .map((c) => ({ c, factice: isPlaceholder(c.nom, c.role, c.organisation) }))
      .sort((x, y) =>
        (x.factice === y.factice
          ? (rangPrio[x.c.priorite] ?? 1) - (rangPrio[y.c.priorite] ?? 1) || x.c.nom.localeCompare(y.c.nom)
          : x.factice ? 1 : -1)
      );
  }, [cibles, traitees]);

  const agir = (id: string, action: () => Promise<{ ok: boolean; error?: string }>) => {
    setEnCours(id);
    setErreur(null);
    start(async () => {
      const r = await action();
      setEnCours(null);
      if (!r.ok) setErreur(r.error ?? "Écriture impossible.");
      else setTraitees((prev) => new Set(prev).add(id));
    });
  };

  if (!liste.length) {
    return (
      <div className="card p-8 text-center text-sm text-blanc-muted">
        Rien à qualifier. Le récap et le scoring trient sur des archétypes complets.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {erreur && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-700">
          {erreur}
        </div>
      )}
      {liste.map(({ c, factice }) => {
        const sousTitre = [c.role, c.organisation].filter(Boolean).join(" · ");
        const prio = priorites[c.id] ?? (c.priorite || "moyenne");
        const occupe = enCours === c.id;
        const r = refs[c.id];
        return (
          <div key={c.id} className="card flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link href={`/${show.slug}/cible/${c.id}`} className="truncate font-medium no-underline hover:underline">
                  {c.nom}
                </Link>
                {factice && (
                  <span className="rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[11px] text-amber-700">
                    nom factice, à archiver
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-blanc-muted">
                {sousTitre || "sans rôle ni organisation"}
                {c.stage_label ? ` · ${c.stage_label}` : ""}
                {c.statut_ref ? ` · ${c.statut_ref}` : ""}
              </div>
            </div>
            <select
              value={prio}
              onChange={(e) => setPriorites((p) => ({ ...p, [c.id]: e.target.value as Priorite }))}
              disabled={occupe}
              className="rounded-lg border border-noir-600 bg-transparent px-2 py-1.5 text-sm"
              aria-label={`Priorité de ${c.nom}`}
            >
              {PRIORITES.map((p) => (
                <option key={p} value={p} className="bg-white">
                  {PRIORITE_LABELS[p]}
                </option>
              ))}
            </select>
            {ARCHETYPE_ORDER.map((a) => (
              <button
                key={a}
                disabled={occupe}
                onClick={() => agir(c.id, () => qualifierCible({ cible_id: c.id, archetype: a, priorite: prio, show_slug: show.slug, reference: referencePour(c.id) }))}
                className="btn-ghost rounded-lg px-3 py-1.5 text-sm"
              >
                {ARCHETYPE_LABELS[a]}
              </button>
            ))}
            <button
              disabled={occupe}
              onClick={() => agir(c.id, () => archiverCible({ cible_id: c.id, show_slug: show.slug }))}
              className="rounded-lg px-3 py-1.5 text-sm text-blanc-muted hover:bg-[var(--glass-2)] hover:text-blanc"
            >
              Archiver
            </button>
            <div className="flex w-full flex-wrap items-center gap-2 border-t border-noir-600 pt-2">
              <span className="text-[11px] uppercase tracking-wide text-blanc-muted">Référence</span>
              <select
                value={r?.genre !== undefined ? r.genre ?? "" : c.genre ?? ""}
                onChange={(e) => majRef(c.id, { genre: e.target.value || null })}
                disabled={occupe}
                className="rounded-lg border border-noir-600 bg-transparent px-2 py-1 text-xs"
                aria-label={`Genre de ${c.nom}`}
              >
                <option value="" className="bg-white">genre ?</option>
                {genres.map((g) => (
                  <option key={g} value={g} className="bg-white">{g}</option>
                ))}
              </select>
              <select
                value={r?.social_score !== undefined ? r.social_score : c.social_score ?? 0}
                onChange={(e) => majRef(c.id, { social_score: Number(e.target.value) })}
                disabled={occupe}
                className="rounded-lg border border-noir-600 bg-transparent px-2 py-1 text-xs"
                aria-label={`Score social de ${c.nom}`}
              >
                {[0, 1, 2, 3].map((s) => (
                  <option key={s} value={s} className="bg-white">social {s}</option>
                ))}
              </select>
              {([
                ["premiere_neige", "Première neige"],
                ["tag_investisseur", "Investisseur"],
              ] as const).map(([champ, label]) => {
                const actif = r?.[champ] !== undefined ? !!r[champ] : !!c[champ];
                return (
                  <button
                    key={champ}
                    type="button"
                    disabled={occupe}
                    onClick={() => majRef(c.id, { [champ]: !actif })}
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      actif
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-700"
                        : "border-noir-600 text-blanc-muted hover:text-blanc"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              <input
                type="text"
                value={r?.categorieTexte !== undefined ? r.categorieTexte : (c.categorie ?? []).join(", ")}
                onChange={(e) => majRef(c.id, { categorieTexte: e.target.value })}
                disabled={occupe}
                placeholder="catégories, séparées par des virgules"
                className="min-w-[220px] flex-1 rounded-lg border border-noir-600 bg-transparent px-2 py-1 text-xs"
                aria-label={`Catégories de ${c.nom}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
