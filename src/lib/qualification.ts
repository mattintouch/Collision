// Chantier 3 (brief du 27/07) — la file de qualification, correctif durable
// de la cause racine : le pipeline crée et enrichit beaucoup mais ne qualifie
// jamais, l'archétype reste vide, le tri par valeur (récap 2e, scoring) n'a
// rien à trier. Deux pièces :
//   1. La porte de la file de génération : une cible de test, un placeholder
//      ou (pour une fiche) une cible non qualifiée ne déclenche aucun job.
//   2. La vue « à qualifier » (page /[show]/qualifier) qui vide le stock.

import { isPlaceholder } from "./domain";
import type { createServiceClient } from "./supabase/service";

type SB = ReturnType<typeof createServiceClient>;

export interface CibleGeneration {
  nom: string | null;
  role?: string | null;
  organisation?: string | null;
  archetype?: string | null;
}

/**
 * Motif d'inéligibilité d'une cible à la file de génération, null si rien ne
 * s'y oppose. `pourFiche` ajoute l'exigence de qualification : une génération
 * de fiche complète ne se dépense pas sur une cible dont la valeur n'est pas
 * posée (archétype vide). L'enrichissement de profil reste permis sur une
 * cible réelle non qualifiée : c'est lui qui aide à qualifier.
 */
export function motifIneligibleGeneration(
  c: CibleGeneration,
  opts: { test?: boolean; pourFiche?: boolean } = {}
): string | null {
  if (opts.test) return "cible de test (is_test) : jamais de job de génération";
  if (isPlaceholder(c.nom ?? null, c.role ?? null, c.organisation ?? null)) {
    return "nom factice (placeholder) : à archiver ou à renommer avant toute génération";
  }
  if (opts.pourFiche && !c.archetype) {
    return "cible non qualifiée (archétype vide) : assigner un archétype dans la file à qualifier avant de générer la fiche";
  }
  return null;
}

// Qualification enrichie (schéma de référence, rebranchement 2) : les
// attributs de Louis se posent au même geste que l'archétype. Helper PUR,
// testable : construit le patch et signale les valeurs refusées au lieu de
// laisser Postgres répondre par une violation de contrainte brute.

export interface ReferenceInput {
  genre?: string | null;
  categorie?: string[];
  social_score?: number;
  premiere_neige?: boolean;
  tag_investisseur?: boolean;
}

/**
 * Patch des attributs de référence d'une cible. Ne pose que les champs
 * fournis. `genresValides` vient de ref_statuts (domaine genre) : une liste
 * vide désactive le contrôle (la table de référence fait foi, pas le code).
 */
export function patchReference(
  input: ReferenceInput,
  genresValides: string[] = []
): { patch: Record<string, unknown>; refuses: string[] } {
  const patch: Record<string, unknown> = {};
  const refuses: string[] = [];
  if (input.genre !== undefined) {
    if (input.genre && genresValides.length && !genresValides.includes(input.genre)) {
      refuses.push(`genre « ${input.genre} » (valeurs : ${genresValides.join(", ")})`);
    } else {
      patch.genre = input.genre || null;
    }
  }
  if (input.categorie !== undefined) {
    // Nettoyage : entrées vides retirées, doublons fusionnés, ordre conservé.
    patch.categorie = [...new Set(input.categorie.map((c) => c.trim()).filter(Boolean))];
  }
  if (input.social_score !== undefined) {
    if (!Number.isInteger(input.social_score) || input.social_score < 0 || input.social_score > 3) {
      refuses.push(`social_score ${input.social_score} (entier de 0 à 3)`);
    } else {
      patch.social_score = input.social_score;
    }
  }
  if (input.premiere_neige !== undefined) patch.premiere_neige = input.premiere_neige;
  if (input.tag_investisseur !== undefined) patch.tag_investisseur = input.tag_investisseur;
  return { patch, refuses };
}

/** La cible est-elle marquée de test ? Défensif : colonne is_test absente
 *  (migration 0032 dormante) → false, aucune régression. */
export async function cibleEstTest(sb: SB, cibleId: string): Promise<boolean> {
  try {
    const { data, error } = await sb.from("cibles").select("id").eq("id", cibleId).eq("is_test", true).maybeSingle();
    return !error && !!data;
  } catch {
    return false;
  }
}
