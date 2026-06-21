// Libellés et logique métier partagés (archétypes, voies, signaux, résurgence).

import type {
  Archetype,
  AppuiType,
  CibleEnrichie,
  Priorite,
  SignalType,
  Voie,
} from "./types";

export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  big_fish: "Big Fish",
  quick_win: "Quick Win",
  pepite: "Pépite",
};

export const ARCHETYPE_HINTS: Record<Archetype, string> = {
  big_fish: "Gros poisson difficile",
  quick_win: "Joignable vite, bon épisode",
  pepite: "Peu connu, sujet brûlant ou fort charisme",
};

export const VOIE_LABELS: Record<Voie, string> = {
  froid: "Froid",
  chaud: "Chaud",
};

export const PRIORITE_LABELS: Record<Priorite, string> = {
  haute: "Haute",
  moyenne: "Moyenne",
  basse: "Basse",
};

export const PRIORITE_RANK: Record<Priorite, number> = {
  haute: 3,
  moyenne: 2,
  basse: 1,
};

export const APPUI_LABELS: Record<AppuiType, string> = {
  ancien_invite: "Ancien invité",
  conseiller: "Conseiller",
  entourage: "Entourage",
  contact_interne: "Contact interne",
};

export const SIGNAL_LABELS: Record<SignalType, string> = {
  levee: "Levée de fonds",
  livre: "Livre",
  nomination: "Nomination",
  prix: "Prix",
  passage_media: "Passage média",
  mouvement_entreprise: "Mouvement entreprise",
};

/** Colonnes d'archétype pour le board des pipes invités. */
export const ARCHETYPE_ORDER: Archetype[] = ["big_fish", "quick_win", "pepite"];

/**
 * Moteur de résurgence (§6) : calcule la raison de remontée d'une cible et un
 * score de priorité. Discipline de relance : jamais au minuteur seul — une
 * relance porte une raison. La voie froide passe devant par défaut.
 */
export interface Resurgence {
  raison: string | null; // pourquoi maintenant
  score: number; // plus haut = remonte en premier
  conseil: "relancer" | "attendre" | "passer_par_appui";
}

export function computeResurgence(c: CibleEnrichie): Resurgence {
  let score = PRIORITE_RANK[c.priorite] * 10;
  let raison: string | null = null;
  let conseil: Resurgence["conseil"] = "relancer";

  // 1. Actualité de la cible (le plus précieux).
  if (c.signal_frais && c.dernier_signal_type) {
    score += 50 + (c.dernier_signal_pertinence ?? 0) * 6;
    raison = `Actualité : ${SIGNAL_LABELS[c.dernier_signal_type]}`;
  }

  // 2. Temps écoulé — déclencheur, mais jamais une raison suffisante seule.
  const jours = c.jours_depuis_touche;
  if (jours !== null && jours >= 14) {
    score += Math.min(jours, 60) / 4;
    if (!raison) {
      // Sans raison fraîche : on ne relance pas à l'aveugle.
      if (c.priorite === "haute" && c.voie === "froid") {
        conseil = c.nb_appuis > 0 ? "passer_par_appui" : "attendre";
        raison =
          c.nb_appuis > 0
            ? "Silence prolongé sans actu — passer par un appui"
            : "Silence prolongé sans actu fraîche — attendre une raison";
      } else {
        raison = `Sans nouvelle depuis ${jours} jours`;
      }
    }
  }

  // 3. La voie froide passe devant par défaut (contenu décorrélé de l'actu).
  if (c.voie === "froid") score += 5;

  return { raison, score, conseil };
}

export const CONSEIL_LABELS: Record<Resurgence["conseil"], string> = {
  relancer: "Relancer",
  attendre: "Attendre une raison",
  passer_par_appui: "Passer par un appui",
};

export const SHOW_ACCENTS: Record<string, string> = {
  gdiy: "#1FB46A",
  ccg: "#3B82F6",
  fleurons: "#B45CFF",
};
