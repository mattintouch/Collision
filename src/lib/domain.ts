// Libellés et logique métier partagés (archétypes, voies, signaux, résurgence).

import type {
  Archetype,
  AppuiType,
  CibleEnrichie,
  ContactKind,
  Priorite,
  SignalType,
  Voie,
} from "./types";

export const CONTACT_LABELS: Record<ContactKind, string> = {
  email: "Email",
  telephone: "Téléphone",
  reseau: "Réseau",
  agence: "Agence / RP",
  site: "Site / formulaire",
  autre: "Autre",
};

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

// ── Audit live 28/06 ────────────────────────────────────────────────────────

/**
 * [C4] Détecte un nom factice (« Un chef étoilé local », « Founder Canvas »,
 * « XX Hugel », « Delphine H (Ernotte?) »…) pour ne pas le compter comme une
 * vraie cible ni le synchroniser dans Google Contacts. Heuristique, exposée en
 * clair (booléen `placeholder`) pour arbitrer les faux positifs.
 */
export function isPlaceholder(
  nom: string | null,
  role?: string | null,
  organisation?: string | null
): boolean {
  const n = (nom ?? "").trim();
  if (!n) return true;
  if (n.includes("?")) return true; // « (Ernotte?) », nom incertain
  if (/^xx\b/i.test(n)) return true; // « XX Hugel »
  if (/^(un|une)\s/i.test(n)) return true; // « Un chef étoilé local »
  // Commence par un mot de fonction au lieu d'un prénom → générique.
  if (/^(fondat\w*|founder|co-?founder|ceo|cto|pdg|dg|président\w*|dirigeant\w*|patron\w*)\b/i.test(n))
    return true;
  // Jeton unique sans rôle ni organisation pour une personne → trop maigre.
  if (n.split(/\s+/).length === 1 && !role && !organisation) return true;
  return false;
}

/** Entrée minimale pour le score (sous-ensemble de la vue cibles_enrichies). */
export interface ScoreInput {
  nom: string | null;
  role?: string | null;
  organisation?: string | null;
  archetype: Archetype | null;
  note_priorite: number | null;
  voie: Voie;
  stage_key: string | null;
  jours_depuis_touche: number | null;
  dernier_signal_date: string | null;
  dernier_signal_pertinence: number | null;
  nb_appuis: number;
  nb_relais_actionnables?: number | null;
  archive?: boolean | null;
  sujets?: string[] | null;
  watchlist_keys?: string[] | null;
}

// Programmation estivale (sourcing jusqu'à fin juillet, diffusion août → début
// sept.) : épisodes légers, grand public, partageables, personnalités iconiques.
// Le business dur / tech / profond se reporte à septembre.
const ESTIVAL_TAGS = new Set(["estival", "ete", "ete_ok", "été"]);
const ESTIVAL_LIGHT_SUJETS = new Set([
  "sport", "culture", "art", "cuisine", "gastronomie", "voyage", "musique",
  "cinema", "cinéma", "humour", "divertissement", "famille", "lifestyle",
  "aventure", "food", "mode",
]);
const ESTIVAL_HARD_SUJETS = new Set([
  "finance", "tech", "deeptech", "business", "strategie", "stratégie",
  "economie", "économie", "industrie", "b2b", "saas", "ia",
  "intelligence artificielle", "geopolitique", "géopolitique",
]);
const ESTIVAL_HARD_TAGS = new Set(["cac40", "sbf120"]);

/** Le modificateur estival est-il actif ? (auto = juin–juillet) */
export function estivalActif(saison?: "auto" | "ete" | "off"): boolean {
  if (saison === "ete") return true;
  if (saison === "off") return false;
  const m = new Date().getMonth() + 1; // 1–12
  return m === 6 || m === 7;
}

export interface CibleScore {
  score: number; // 0–100 (cibles travaillables) ; trié décroissant
  placeholder: boolean;
  badges: string[];
}

const ARCHETYPE_BASE: Record<Archetype, number> = { big_fish: 4, pepite: 3, quick_win: 3 };
const STAGE_OUTREACH = new Set(["qualifie", "contacte"]); // momentum positif
const STAGE_WON_OR_AFTER = new Set(["confirme", "programme", "enregistre", "publie", "produit"]);

/**
 * [C1] Score composite calculé au read-time. Fait remonter les cibles qui
 * bougent (signal frais, voie chaude, relais actionnable, fenêtre de relance)
 * et sort du flux outreach celles déjà gagnées (≥ confirme) ou archivées.
 * Spéc : docs/DEBRIEF.md §7 (repris de l'audit live).
 */
export function computeCibleScore(c: ScoreInput, estival = false): CibleScore {
  const placeholder = isPlaceholder(c.nom, c.role, c.organisation);
  const badges: string[] = [];

  // base_priorite (0–40)
  const base = (c.note_priorite ?? (c.archetype ? ARCHETYPE_BASE[c.archetype] : 2)) * 8;

  // signal (0–20) — frais = daté de ≤ 14 jours
  let signal = 0;
  if (c.dernier_signal_date) {
    const ageJours = (Date.now() - new Date(c.dernier_signal_date).getTime()) / 86_400_000;
    if (ageJours <= 14) {
      signal = (c.dernier_signal_pertinence ?? 0) * 4;
      if (signal > 0) badges.push("signal frais");
    }
  }

  // voie (0–15)
  const voie = c.voie === "chaud" ? 15 : 0;

  // relais (0–18)
  const actionnables = c.nb_relais_actionnables ?? 0;
  const autres = Math.max(0, c.nb_appuis - actionnables);
  const relais = Math.min(18, actionnables * 6 + autres * 2);
  if (actionnables > 0) badges.push("relais actionnable");

  // resurgence (0–10) — cadence 14 j froid / 21 j chaud
  const cadence = c.voie === "chaud" ? 21 : 14;
  const j = c.jours_depuis_touche;
  let resurgence: number;
  if (j === null) {
    resurgence = c.stage_key === "identifie" ? 5 : 3;
  } else if (j > 3 * cadence) {
    resurgence = 6;
    badges.push("risque d'abandon");
  } else if (j >= cadence && j <= 2 * cadence) {
    resurgence = 10;
    badges.push("fenêtre de relance");
  } else if (j > 2 * cadence) {
    resurgence = 8;
  } else {
    resurgence = 0; // touché récemment
  }

  // momentum_stage (−10 → +8)
  let momentum = 0;
  if (c.stage_key && STAGE_OUTREACH.has(c.stage_key)) momentum = 8;
  else if (c.stage_key && STAGE_WON_OR_AFTER.has(c.stage_key)) {
    momentum = -10;
    badges.push("gagné");
  }

  // modificateur_estival (−14 → +16) : en saison, on remonte le léger/iconique
  // (diffusion août) et on repousse le dur/tech/corporate à septembre.
  let estivalMod = 0;
  if (estival) {
    const wl = (c.watchlist_keys ?? []).map((w) => w.toLowerCase());
    const sj = (c.sujets ?? []).map((s) => s.toLowerCase());
    if (wl.some((w) => ESTIVAL_TAGS.has(w))) estivalMod += 10;
    if (sj.some((s) => ESTIVAL_LIGHT_SUJETS.has(s))) estivalMod += 6;
    if (wl.some((w) => ESTIVAL_HARD_TAGS.has(w))) estivalMod -= 8;
    if (sj.some((s) => ESTIVAL_HARD_SUJETS.has(s))) estivalMod -= 6;
    if (estivalMod > 0) badges.push("estival ☀");
    else if (estivalMod < 0) badges.push("à reporter (sept.)");
  }

  const raw = base + signal + voie + relais + resurgence + momentum + estivalMod;
  const score = Math.max(0, Math.min(100, raw));
  return { score, placeholder, badges };
}
