// La Martingale, brief 2.4 : les automatisations quotidiennes.
//
// Quatre règles, toutes décidées par une fonction PURE (decisionsDuJour) que le
// cron se contente d'exécuter. Séparer la décision de l'écriture permet la
// phase de simulation exigée par le cadre du brief (point 0.4) : le même calcul
// sert à dire ce qui SERAIT fait et à le faire.
//
//   1. `contacte` sans réponse depuis 5 jours (priorité haute) ou 10 jours
//      (normale) : passage en `a_relancer` et relance en BROUILLON. Deux
//      relances sans réponse : passage en `no_ok`.
//   2. `planifie` dont la date de diffusion est aujourd'hui : passage en `publie`.
//   3. `publie` depuis 14 jours : passage en `promo_finie`.
//   4. Alerte J-7 tournage : fiche absente, ou un des deux calls pas en `fait`.
//
// Aucune de ces règles n'envoie d'email : le show est en mode `validation`,
// tout part en brouillon (brief 2.5).

export const DELAI_RELANCE_HAUTE = 5;
export const DELAI_RELANCE_NORMALE = 10;
export const RELANCES_AVANT_ABANDON = 2;
export const DELAI_PROMO_FINIE = 14;
export const ALERTE_TOURNAGE_JOURS = 7;

export interface CibleMartingale {
  id: string;
  nom: string;
  etape: string | null;
  priorite: string | null;
  statut_sortie: string | null;
  relances_envoyees: number;
  date_derniere_touche: string | null;
  date_diffusion: string | null;
  date_tournage: string | null;
  date_publication: string | null;
  a_une_fiche: boolean;
  calls_faits: number;
}

export type ActionMartingale =
  | { type: "relancer"; cible_id: string; nom: string; jours_sans_reponse: number; motif: string }
  | { type: "abandonner"; cible_id: string; nom: string; motif: string }
  | { type: "publier"; cible_id: string; nom: string; motif: string }
  | { type: "promo_finie"; cible_id: string; nom: string; motif: string }
  | { type: "alerte_tournage"; cible_id: string; nom: string; manques: string[]; motif: string };

/** Jours pleins entre deux dates ISO (PURE). Renvoie null si la date manque. */
export function joursDepuis(iso: string | null | undefined, maintenant: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((maintenant.getTime() - t) / 86_400_000);
}

/** Jours pleins d'ici une date ISO (PURE). Négatif si la date est passée. */
export function joursAvant(iso: string | null | undefined, maintenant: Date): number | null {
  const d = joursDepuis(iso, maintenant);
  return d === null ? null : -d;
}

/** Date du jour en AAAA-MM-JJ, fuseau de Paris (les dates de diffusion sont
 *  des jours calendaires, pas des instants). */
export function jourParis(maintenant: Date): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(maintenant);
}

/** Délai de relance selon la priorité (PURE, testée). Le brief nomme les
 *  valeurs `haute` et `normale` ; la colonne priorite est un enum partagé avec
 *  GDIY dont la valeur courante est `moyenne`, lue ici comme « normale ». */
export function delaiRelance(priorite: string | null | undefined): number {
  return priorite === "haute" ? DELAI_RELANCE_HAUTE : DELAI_RELANCE_NORMALE;
}

/**
 * Les actions du jour (PURE, testée). Aucune écriture, aucune horloge
 * implicite : `maintenant` est toujours fourni, ce qui rend chaque règle
 * reproductible en test.
 *
 * Une cible sortie du pipe (`statut_sortie` renseigné) n'est jamais touchée :
 * `pour_plus_tard` et `no_ok` sortent du pipe actif sans archiver.
 */
export function decisionsDuJour(cibles: CibleMartingale[], maintenant: Date): ActionMartingale[] {
  const actions: ActionMartingale[] = [];
  const aujourdhui = jourParis(maintenant);

  for (const c of cibles) {
    if (c.statut_sortie) continue;

    // Règle 1 : relance, puis abandon à la deuxième relance sans réponse.
    if (c.etape === "contacte" || c.etape === "a_relancer") {
      const seuil = delaiRelance(c.priorite);
      const sansReponse = joursDepuis(c.date_derniere_touche, maintenant);
      if (sansReponse !== null && sansReponse >= seuil) {
        if (c.relances_envoyees >= RELANCES_AVANT_ABANDON) {
          actions.push({
            type: "abandonner",
            cible_id: c.id,
            nom: c.nom,
            motif: `${c.relances_envoyees} relances sans réponse, ${sansReponse} jours depuis la dernière touche`,
          });
        } else {
          actions.push({
            type: "relancer",
            cible_id: c.id,
            nom: c.nom,
            jours_sans_reponse: sansReponse,
            motif: `sans réponse depuis ${sansReponse} jours (seuil ${seuil} en priorité ${c.priorite === "haute" ? "haute" : "normale"})`,
          });
        }
      }
    }

    // Règle 2 : le jour de la sortie programmée, l'épisode passe en publié.
    if (c.etape === "planifie" && c.date_diffusion && c.date_diffusion <= aujourdhui) {
      actions.push({ type: "publier", cible_id: c.id, nom: c.nom, motif: `date de diffusion ${c.date_diffusion}` });
    }

    // Règle 3 : la promo se clôt quatorze jours après la publication.
    if (c.etape === "publie") {
      const depuis = joursDepuis(c.date_publication ?? c.date_diffusion, maintenant);
      if (depuis !== null && depuis >= DELAI_PROMO_FINIE) {
        actions.push({ type: "promo_finie", cible_id: c.id, nom: c.nom, motif: `publié depuis ${depuis} jours` });
      }
    }

    // Règle 4 : alerte J-7 tournage. Elle ne déplace rien, elle prévient.
    const avantTournage = joursAvant(c.date_tournage, maintenant);
    if (avantTournage !== null && avantTournage >= 0 && avantTournage <= ALERTE_TOURNAGE_JOURS) {
      const manques: string[] = [];
      if (!c.a_une_fiche) manques.push("la fiche de préparation n'existe pas");
      if (c.calls_faits < 2) manques.push(`${2 - c.calls_faits} call sur 2 n'est pas en statut fait`);
      if (manques.length) {
        actions.push({
          type: "alerte_tournage",
          cible_id: c.id,
          nom: c.nom,
          manques,
          motif: `tournage dans ${avantTournage} jour${avantTournage > 1 ? "s" : ""}`,
        });
      }
    }
  }
  return actions;
}

/** Étape visée par une action de transition (PURE, testée). Une alerte ne
 *  déplace aucune cible : elle renvoie null. */
export function etapeCible(action: ActionMartingale): string | null {
  switch (action.type) {
    case "relancer":
      return "a_relancer";
    case "publier":
      return "publie";
    case "promo_finie":
      return "promo_finie";
    case "abandonner":
    case "alerte_tournage":
      return null;
  }
}
