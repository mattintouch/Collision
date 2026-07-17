// Chantier 4 (brief arbitrages 17/07, §5) — besoins éditoriaux et éligibilité.
//
// Constat déclencheur (cas Belkaid) : les critères d'éligibilité éditoriale de
// GDIY n'existaient nulle part dans le modèle de données ; une règle qui n'est
// pas écrite ne peut être appliquée ni par le score ni par un assistant. Ce
// module les ÉCRIT, par show, et les évalue en un indicateur DISTINCT du score
// d'actionnabilité (ne jamais mélanger valeur éditoriale et accessibilité).
//
// L'indicateur est une aide, pas un couperet : « hors_ligne » signale, il
// n'exclut pas. La décision éditoriale reste humaine.

import type { createServiceClient } from "./supabase/service";
import { computeCibleScore, type ScoreInput } from "./domain";
import type { CibleEnrichie } from "./types";

type SB = ReturnType<typeof createServiceClient>;

/* ── 1. Critères d'éligibilité par show (§5.1), écrits en dur ─────────────── */

export interface CriteresShow {
  /** Libellés en clair, affichés et cités dans les raisons. */
  criteres: string[];
  /** Motifs de rôle/notes qui signent un bâtisseur (entrepreneur, fondateur). */
  batisseur: RegExp;
  /** Motifs qui signent un profil hors ligne éditoriale (institutionnel pur,
   *  mandataire, chercheur sans société) SAUF si un motif bâtisseur matche aussi. */
  horsLigne: RegExp;
}

export const CRITERES_ELIGIBILITE: Record<string, CriteresShow> = {
  gdiy: {
    criteres: [
      "entrepreneur ou bâtisseur d'un système",
      "notoriété ou communauté forte",
      "traction d'audience attendue",
    ],
    batisseur:
      /fondat|founder|co-?fond|entrepren|créat|createur|bâtisseur|batisseur|self-?made|patron de|a (lancé|créé|fondé|monté)|serial/i,
    horsLigne:
      /institut|fonctionnaire|ministre|députe|député|sénat|haut[- ]fonctionnaire|administration|chercheu|académi|academi|universit|ong\b|association loi/i,
  },
};

export type IndicateurEligibilite = "eligible" | "a_verifier" | "hors_ligne";

export interface Eligibilite {
  indicateur: IndicateurEligibilite;
  raisons: string[];
}

/** Texte agrégé d'une cible où chercher les motifs (rôle, note, raison...). */
function corpus(c: Partial<CibleEnrichie>): string {
  return [c.role, c.organisation, c.raison_de_selection, c.note, (c.sujets ?? []).join(" ")]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Éligibilité éditoriale d'une cible pour un show (§5.1). Trois issues :
 * eligible (motif bâtisseur trouvé), hors_ligne (motif institutionnel sans
 * motif bâtisseur), a_verifier (rien de concluant : la règle est écrite mais
 * la donnée ne permet pas de trancher).
 */
export function computeEligibilite(showSlug: string, c: Partial<CibleEnrichie>): Eligibilite {
  const regles = CRITERES_ELIGIBILITE[showSlug.toLowerCase()];
  if (!regles) return { indicateur: "eligible", raisons: ["aucun critère défini pour ce show"] };
  const texte = corpus(c);
  // Une marque/entreprise dans le pipe = son bâtisseur en invité potentiel.
  if (c.kind === "entreprise") {
    return { indicateur: "eligible", raisons: ["entreprise : le bâtisseur est l'invité visé"] };
  }
  if (regles.batisseur.test(texte)) {
    return { indicateur: "eligible", raisons: ["profil bâtisseur détecté (rôle ou parcours)"] };
  }
  if (regles.horsLigne.test(texte)) {
    return {
      indicateur: "hors_ligne",
      raisons: [
        "profil institutionnel sans signe de système bâti",
        `critères ${showSlug.toUpperCase()} : ${regles.criteres.join(" ; ")}`,
      ],
    };
  }
  return {
    indicateur: "a_verifier",
    raisons: [`rien de concluant dans la donnée ; critères ${showSlug.toUpperCase()} : ${regles.criteres.join(" ; ")}`],
  };
}

/* ── 2 et 3. Besoins éditoriaux et couverture par le pipe (§5.2, §5.3) ────── */

export interface BesoinRow {
  id: string;
  show_id: string;
  periode: string | null;
  contrainte: string;
  criteres: { sujets?: string[]; archetype?: string; genre?: string; echeance?: string } | null;
  statut: "ouvert" | "couvert" | "expire";
  couvert_par: string | null;
}

export interface CouvertureBesoin {
  besoin: BesoinRow;
  /** Cibles actionnables qui matchent les critères structurés. null si les
   *  critères ne permettent aucun match automatique (contrainte en clair
   *  seulement, ou genre : non porté par le modèle de données). */
  candidates: { id: string; nom: string; score: number }[] | null;
  alerte: boolean; // ouvert et couvert par moins de deux cibles actionnables
}

const WON = new Set(["confirme", "programme", "enregistre", "publie", "produit"]);
const SCORE_ACTIONNABLE_MIN = 40;

/** Une cible matche-t-elle les critères STRUCTURÉS d'un besoin ? null si les
 *  critères ne sont pas automatisables (le genre n'est pas dans le modèle). */
function matche(c: CibleEnrichie, criteres: BesoinRow["criteres"]): boolean | null {
  if (!criteres || (!criteres.sujets?.length && !criteres.archetype)) return null;
  if (criteres.archetype && c.archetype !== criteres.archetype) return false;
  if (criteres.sujets?.length) {
    const sj = new Set((c.sujets ?? []).map((s) => s.toLowerCase()));
    if (!criteres.sujets.some((s) => sj.has(s.toLowerCase()))) return false;
  }
  return true;
}

/**
 * Évalue les besoins OUVERTS d'un show contre le pipe (§5.3) : chaque besoin
 * couvert par moins de deux cibles actionnables porte alerte=true. Défensif :
 * table absente (migration 0040) → liste vide, rien ne casse.
 */
export async function evaluerCouverture(sb: SB, showId: string, estival = false): Promise<CouvertureBesoin[]> {
  let besoins: BesoinRow[] = [];
  try {
    const { data, error } = await sb
      .from("besoins_editoriaux")
      .select("id, show_id, periode, contrainte, criteres, statut, couvert_par")
      .eq("show_id", showId)
      .eq("statut", "ouvert")
      .order("created_at")
      .limit(20);
    if (error) return [];
    besoins = (data ?? []) as BesoinRow[];
  } catch {
    return [];
  }
  if (!besoins.length) return [];

  const { data: rows } = await sb.from("cibles_enrichies").select("*").eq("show_id", showId).eq("archive", false).limit(1000);
  const actionnables = ((rows ?? []) as CibleEnrichie[])
    .map((c) => ({ c, s: computeCibleScore(c as unknown as ScoreInput, estival) }))
    .filter((x) => !x.s.placeholder && !(x.c.stage_key && WON.has(x.c.stage_key)) && x.s.score >= SCORE_ACTIONNABLE_MIN);

  return besoins.map((besoin) => {
    let candidates: CouvertureBesoin["candidates"] = null;
    const matchables = actionnables.map((x) => ({ x, m: matche(x.c, besoin.criteres) }));
    if (matchables.some((r) => r.m !== null)) {
      candidates = matchables
        .filter((r) => r.m === true)
        .map((r) => ({ id: r.x.c.id, nom: r.x.c.nom, score: r.x.s.score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }
    // Critères non automatisables : l'alerte reste levée tant qu'un humain n'a
    // pas marqué le besoin couvert (statut), plutôt qu'un faux « couvert ».
    const alerte = candidates === null ? true : candidates.length < 2;
    return { besoin, candidates, alerte };
  });
}
