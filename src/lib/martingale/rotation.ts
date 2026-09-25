// La Martingale, brief 2.3 : rotation des familles de thème.
//
// La vue planning liste les épisodes en `a_programmer`, `enregistrement_a_venir`
// et `planifie`, ordonnés par date de diffusion, avec leur famille. Deux
// épisodes consécutifs de la même famille déclenchent une ALERTE NON BLOQUANTE.
// Aucune règle d'interdiction en base : le brief est explicite, l'alerte suffit.

/** Étapes qui composent le planning (brief 2.3). */
export const ETAPES_PLANNING = ["a_programmer", "enregistrement_a_venir", "planifie"] as const;

export interface LignePlanning {
  cible_id: string;
  nom: string;
  etape: string;
  famille: string | null;
  famille_label: string | null;
  date_diffusion: string | null;
  og: boolean;
}

export interface CollisionFamille {
  famille: string;
  famille_label: string | null;
  premier: { cible_id: string; nom: string; date_diffusion: string | null };
  second: { cible_id: string; nom: string; date_diffusion: string | null };
}

/** Tri du planning (PURE, testée) : par date de diffusion croissante, les
 *  dates absentes à la fin (un épisode non daté ne casse pas la rotation, il
 *  n'a pas encore de place), puis par nom pour rester déterministe. */
export function triePlanning(lignes: LignePlanning[]): LignePlanning[] {
  return [...lignes].sort((a, b) => {
    const da = a.date_diffusion ?? "";
    const db = b.date_diffusion ?? "";
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return a.nom.localeCompare(b.nom, "fr");
  });
}

/** Collisions de famille sur deux épisodes CONSÉCUTIFS du planning trié
 *  (PURE, testée). Les épisodes sans famille ne collisionnent jamais : une
 *  famille inconnue n'est pas une répétition, c'est une information manquante. */
export function collisionsFamille(lignes: LignePlanning[]): CollisionFamille[] {
  const ordonne = triePlanning(lignes);
  const out: CollisionFamille[] = [];
  for (let i = 1; i < ordonne.length; i++) {
    const prec = ordonne[i - 1];
    const cour = ordonne[i];
    if (!prec.famille || !cour.famille || prec.famille !== cour.famille) continue;
    out.push({
      famille: cour.famille,
      famille_label: cour.famille_label ?? prec.famille_label,
      premier: { cible_id: prec.cible_id, nom: prec.nom, date_diffusion: prec.date_diffusion },
      second: { cible_id: cour.cible_id, nom: cour.nom, date_diffusion: cour.date_diffusion },
    });
  }
  return out;
}

/** Phrase d'alerte, une par collision (PURE, testée). Non bloquante : elle
 *  informe, elle n'interdit rien. */
export function phraseAlerte(c: CollisionFamille): string {
  const famille = c.famille_label ?? c.famille;
  return `Deux épisodes consécutifs en ${famille} : ${c.premier.nom} puis ${c.second.nom}.`;
}
