// S10 — construit les données de fiche depuis le dossier enrichi. Sections
// factuelles remplies depuis les données (mission, qui, sources) ; les sections
// de prose (questions, masterclass) restent vides tant que le copilote ne les a
// pas rédigées → elles s'affichent « à alimenter » (contrôle qualité de la prep).

import type { CibleEnrichie } from "../types";
import type { FicheData, FicheSource } from "./generate";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function dateLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`;
}

function sourcesFrom(urls: unknown): FicheSource[] {
  if (!Array.isArray(urls)) return [];
  return urls
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
    .map((u) => {
      let host = u;
      try { host = new URL(u).hostname.replace(/^www\./, ""); } catch { /* garde l'url */ }
      return { titre: host, url: u, type: null, date: null };
    });
}

export interface BuildFicheInput {
  cible: CibleEnrichie;
  show_nom: string;
  date_enregistrement?: string | null;
  lieu?: string | null;
  /** résultat d'enrichissement (ProfileProposal) le plus récent, si présent. */
  enrichissement?: { resume?: string | null; raison_de_selection?: string | null; sources?: string[] } | null;
  fiche_date?: string | null;
}

export function buildFicheData(input: BuildFicheInput): FicheData {
  const c = input.cible;
  const enr = input.enrichissement ?? {};
  const soustitre = [c.role, c.organisation].filter(Boolean).join(" · ") || c.raison_de_selection || null;

  // 00 Lecture stratégique : dérivée du playbook + de la raison de sélection.
  const pb = (c.playbook ?? {}) as { angle?: string };
  const lecture: { tag: string; texte: string }[] = [];
  if (c.raison_de_selection) lecture.push({ tag: "Le vrai sujet", texte: c.raison_de_selection });
  if (pb.angle) lecture.push({ tag: "Le levier", texte: pb.angle });

  // 01 Mission : angle ou raison ; sinon vide (→ à alimenter).
  const mission = pb.angle || c.raison_de_selection || null;

  return {
    nom: c.nom,
    soustitre,
    entretien: dateLabel(input.date_enregistrement),
    lieu: input.lieu ?? null,
    diffusion: null,
    fiche_date: input.fiche_date ?? dateLabel(new Date().toISOString()),
    lecture_strategique: lecture.length ? lecture : undefined,
    mission,
    a_verrouiller: undefined,
    // Qui : le résumé d'enrichissement en une puce datée « à ce jour » si présent.
    qui: enr.resume ? { role: soustitre, puces: [{ d: "Profil", t: enr.resume }] } : undefined,
    chiffres: undefined, // figures structurées : à venir (décision #10)
    questions_reseaux: undefined, // prose copilote : à venir
    axes_profonds: undefined,
    masterclass: undefined,
    arrivee: undefined,
    sources: sourcesFrom(enr.sources),
  };
}
