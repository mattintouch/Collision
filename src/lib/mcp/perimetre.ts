// Prérequis 1.3 du brief La Martingale (25/09) : restreindre un membre à un
// seul show, côté connecteur MCP.
//
// Côté application, la restriction EXISTE déjà et fonctionne : la RLS filtre
// par user_shows (has_show_access, can_write_show, migration 0002). Le trou est
// ailleurs : les outils MCP passent par le client service role, qui contourne
// la RLS par construction. Un membre restreint à La Martingale voyait donc tout
// GDIY dès qu'il branchait son connecteur.
//
// Mécanique : le jeton d'accès porte la liste des shows autorisés quand le
// membre est restreint. Chaque appel d'outil s'exécute dans un contexte qui
// porte cette liste, et les deux points de résolution (un show, une cible par
// id) la consultent. Hors périmètre, la ressource répond INTROUVABLE plutôt
// qu'interdite : un membre externe n'a pas à apprendre l'existence des shows
// des autres.
//
// Pour débrancher : cesser de poser `shows` dans le jeton. Sans cette clé, le
// périmètre est nul et rien ne filtre.

import { AsyncLocalStorage } from "node:async_hooks";

export interface Perimetre {
  /** Ids de shows autorisés. null = aucune restriction (admin, interne). */
  shows: string[] | null;
}

const stockage = new AsyncLocalStorage<Perimetre>();

/** Exécute un appel d'outil dans un périmètre donné.
 *
 *  Une LISTE VIDE est une restriction totale, pas une absence de restriction :
 *  un membre externe sans aucune ligne user_shows n'a accès à aucun show, et
 *  doit voir une base vide plutôt que la base entière. Seuls null et undefined
 *  (la clé absente du jeton, donc un admin ou un interne) lèvent le filtre. */
export function avecPerimetre<T>(shows: string[] | null | undefined, fn: () => Promise<T>): Promise<T> {
  return stockage.run({ shows: Array.isArray(shows) ? shows : null }, fn);
}

export function perimetreCourant(): Perimetre {
  return stockage.getStore() ?? { shows: null };
}

/** Un show est-il dans le périmètre courant (PURE au sens du contexte) ? */
export function showDansPerimetre(showId: string | null | undefined): boolean {
  const { shows } = perimetreCourant();
  if (!shows) return true;
  return !!showId && shows.includes(showId);
}

/** Périmètre restreint en cours : utile pour les listes multi shows. */
export function showsAutorises(): string[] | null {
  return perimetreCourant().shows;
}
