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
