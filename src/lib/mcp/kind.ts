// Logique kind-aware extraite pour être testable hors du handler MCP.
// Construit un patch de cible selon le kind (personne/entreprise) et signale les
// champs refusés (illégaux pour ce kind) — pour une erreur lisible plutôt qu'une
// violation de contrainte Postgres brute.

// Seuls role / organisation / archetype restent réservés aux personnes (une
// entreprise n'a ni archétype ni rôle perso — contrainte cible_entreprise_fields).
export const PERSONNE_ONLY = ["role", "organisation", "archetype"] as const;
// Plus aucun champ réservé aux entreprises : secteur/pays/ville/envergure et
// raison_de_selection/etat_recherche sont partagés (migrations 0020 + 0021).
export const ENTREPRISE_ONLY = [] as const;
export const SHARED_FIELDS = [
  "nom", "priorite", "voie", "sujets", "note", "note_priorite", "canal_reel", "via_qui",
  "ville", "photo_url", "playbook", "secteur", "pays", "envergure", "raison_de_selection", "etat_recherche",
] as const;

export function kindAwarePatch(
  kind: string,
  a: Record<string, unknown>
): { patch: Record<string, unknown>; rejected: string[]; allowed: string[] } {
  const allowed = [...SHARED_FIELDS, ...(kind === "personne" ? PERSONNE_ONLY : ENTREPRISE_ONLY)];
  const forbidden = (kind === "personne" ? ENTREPRISE_ONLY : PERSONNE_ONLY) as readonly string[];
  const patch: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const f of forbidden) if (a[f] !== undefined) rejected.push(f);
  for (const f of allowed) if (a[f] !== undefined) patch[f] = a[f];
  return { patch, rejected, allowed: [...allowed] };
}

/**
 * Traduit une violation de contrainte kind (Postgres brute) en message
 * actionnable. Cas connu (17/07) : cible_personne_fields de 0001 encore active
 * en base malgré 0021 (dérive base/registre), corrigée par la migration 0036.
 * Renvoie null si l'erreur n'est pas une contrainte kind.
 */
export function mapKindConstraintError(message: string): string | null {
  if (message.includes("cible_personne_fields")) {
    return "La base refuse secteur/pays/envergure/raison_de_selection/etat_recherche sur une personne : la contrainte d'origine (0001) est encore active. Appliquer la migration 0036_cibles_contraintes_kind.sql, puis réessayer.";
  }
  if (message.includes("cible_entreprise_fields")) {
    return "Une entreprise ne peut pas porter role ou archetype (contrainte cible_entreprise_fields). Retirer ces champs, ou corriger le kind de la cible d'abord (update_cible kind=personne).";
  }
  return null;
}
