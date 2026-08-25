// Récap hebdomadaire v3 (décisions Matthieu du 25/08) : un document
// ACTIONNABLE et COURT (cible : moins de 4 000 caractères), structure A/B/C/D.
//   A « ce qui a bougé » : mouvements prioritaires nommés (inchangé v2).
//   B « échecs et coûts » : causes nommées, coûts, prompt de correction
//     seulement sur échec systématique (inchangé v2).
//   C « Magellan cette semaine » : ce qui a été LIVRÉ, résumé en langage
//     utilisateur (PR mergées + items livre, cf. livraisons.ts).
//   D « demandes produit » : SEULS les items de la semaine, résumés en 2
//     lignes (colonne resume, lot 4), avec liens Valider / Rejeter (claude.ai
//     prérempli) et Voir le détail (/backlog). Le stock est UNE ligne de
//     compteur : fini le stock réimprimé verbatim chaque lundi.
// Style : AUCUN tiret dans l'email, sauf les séparateurs du sandbox (demande
// explicite de Matthieu). Envoi via l'identité Vadim, destinataires
// RECAP_EMAILS sinon staff des shows.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "../ai/websearch";
import { assurerResumes, tronqueProprement } from "./resume";
import { collecteLivraisons, type Livraison } from "./livraisons";
import { depenseDepuisEur, depenseMoisEur, plafondEur } from "../ai/cout";
import { estivalActif, isPlaceholder } from "../domain";
import { evaluerCouverture } from "../editorial";
import { ENRICH_MODEL, hasAnthropicKey } from "../copilot/config";
import type { createServiceClient } from "../supabase/service";
import type { StaffMember } from "../types";

type SB = ReturnType<typeof createServiceClient>;

export interface MouvementCible {
  nom: string;
  organisation: string | null;
  etape: string;   // « programmée » / « enregistrée cette semaine » / « passée à Contacté »
  statut: string;  // « enregistrement calé le 28 juillet » / « en progression » ...
  allies: string[];
  rang: 1 | 2 | 3; // 1 validés, 2 urgents en progression, 3 notables
}

export interface EchecCause {
  cause: string;
  jobs: { nom: string; type: string }[];
}

export interface DemandeBrute {
  id: string;
  auteur: string | null;
  contenu: string;
  contexte: Record<string, unknown>;
  /** Lot 2 (0048) : feature, bug, correction ou note ; absent avant migration. */
  type?: string;
  /** Lot 4 (0048) : résumé court persisté, garanti par assurerResumes. */
  resume?: string | null;
  created_at?: string;
}

export interface RecapData {
  depuis: string;
  mouvements: MouvementCible[];
  sandbox: string[];
  notes: { invite: string; note: number; commentaire: string | null }[];
  besoins: { show: string; contrainte: string; periode: string | null; candidates: number | null }[];
  generations: { done: number; failed: number };
  echecs: EchecCause[];
  cout: { semaine_eur: number; mois_eur: number; plafond_eur: number } | null;
  prompt_correction: string | null;
  /** Le stock complet des items nouveau (pour le triage proposé du cron et
   *  les compteurs) : l'email n'en imprime plus le verbatim. */
  backlog: DemandeBrute[];
  /** Section C v3 : les livraisons de la semaine en langage utilisateur. */
  livraisons: Livraison[];
  livraisons_incompletes: boolean;
  /** Section D v3 : les seuls items de la semaine (feature, bug, correction). */
  demandes_semaine: DemandeBrute[];
  /** Ligne de stock : total en attente de triage, dont anciens (> 14 jours). */
  stock: { total: number; anciens: number };
}

export interface TriageProposal { id: string; triage: "a_faire" | "a_preciser" | "rejete"; justification: string }

const dateFr = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" }) : null;

/** Normalise la cause d'un échec de job pour le regroupement B1. */
export function normaliseCause(error: string): string {
  const e = error.toLowerCase();
  if (e.startsWith("timeout")) return "timeout au delà du délai de garde";
  if (e.includes("sans résultat exploitable") || e.includes("sans json exploitable")) return "recherche web sans résultat exploitable";
  if (e.includes("credit balance")) return "crédit API épuisé";
  return error.slice(0, 80);
}

/**
 * B3 : prompt de correction CONDITIONNEL. Une cause est systématique quand
 * elle frappe en masse sur plusieurs semaines (au moins 3 jobs cette semaine
 * ET au moins 3 jobs la semaine précédente) ou en masse cette semaine (au
 * moins 5 fiches distinctes). Un incident ponctuel, ou une cause qui n'était
 * qu'anecdotique la semaine passée, ne produit qu'une liste à relancer.
 */
export function promptCorrection(
  cetteSemaine: { cause: string; cible_id: string | null }[],
  semainePrecedente: { cause: string }[]
): string | null {
  const parCause = new Map<string, { jobs: number; cibles: Set<string> }>();
  for (const j of cetteSemaine) {
    const cur = parCause.get(j.cause) ?? { jobs: 0, cibles: new Set<string>() };
    cur.jobs += 1;
    if (j.cible_id) cur.cibles.add(j.cible_id);
    parCause.set(j.cause, cur);
  }
  const jobsPrec = new Map<string, number>();
  for (const j of semainePrecedente) jobsPrec.set(j.cause, (jobsPrec.get(j.cause) ?? 0) + 1);
  for (const [cause, stats] of parCause) {
    const systematique = (stats.jobs >= 3 && (jobsPrec.get(cause) ?? 0) >= 3) || stats.cibles.size >= 5;
    if (!systematique) continue;
    if (cause.startsWith("timeout")) {
      return "Les jobs de génération dépassent régulièrement le délai de garde du worker et tombent en timeout. Découpe la recherche web en sous-requêtes plus courtes, réduis le nombre de requêtes par passe, et ajoute au worker un retry avec backoff. Si le dépassement persiste, relève le délai de garde et documente la nouvelle valeur.";
    }
    if (cause.startsWith("recherche web")) {
      return "La recherche web revient régulièrement sans résultat exploitable sur plusieurs fiches. Vérifie le prompt de recherche (trop restrictif ?), ajoute un repli à une seule requête large quand la première passe est vide, et journalise la requête envoyée pour diagnostic.";
    }
    return `La cause « ${cause} » revient de façon systématique sur les jobs de génération. Diagnostique la, corrige le code ou la configuration en cause, et ajoute un test qui la couvre.`;
  }
  return null;
}

/* ── Logique de la partie A (brief du 27/07, chantier 2) : helpers purs. */

const normaliseNom = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Distance d'édition, plafonnée : au delà de 2 le calcul exact est inutile. */
function distanceEdition(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  const dp = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

/** Deux graphies désignent-elles la même personne ? (2b : « Kevin Beesly »
 *  contre « Kevin Beesley »). Accents et ponctuation neutralisés, distance
 *  d'édition faible (2 sur les noms longs, 1 sur les courts). */
export function nomsProches(a: string, b: string): boolean {
  const na = normaliseNom(a), nb = normaliseNom(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return distanceEdition(na, nb) <= (Math.min(na.length, nb.length) >= 6 ? 2 : 1);
}

/** 2b : dédoublonne les alliés d'une ligne par correspondance approchée,
 *  première graphie rencontrée conservée (les relais arrivent en tête). */
export function dedoublonneAllies(allies: string[]): string[] {
  const out: string[] = [];
  for (const a of allies) {
    if (!out.some((x) => nomsProches(x, a))) out.push(a);
  }
  return out;
}

/** 2c : une personne qui a sa propre ligne de mouvement n'est pas répétée
 *  comme allié sur une autre ligne. La ligne de mouvement prime. */
export function retireCiblesDesAllies(mouvements: MouvementCible[]): MouvementCible[] {
  const noms = mouvements.map((m) => m.nom);
  return mouvements.map((m) => ({
    ...m,
    allies: m.allies.filter((a) => !noms.some((n) => nomsProches(n, a))),
  }));
}

/** 2d : le statut d'une cible validée. « enregistrement à caler » ne
 *  s'applique qu'aux stages confirme et programme sans date planifiée,
 *  jamais à une cible déjà enregistrée ou publiée (cas Rafaèle Tordjman). */
export function statutValide(stageKey: string | null, dateCalee: string | null): string {
  if (dateCalee) return `enregistrement calé le ${dateCalee}`;
  if (stageKey === "enregistre") return "publication à venir";
  if (stageKey === "publie") return "épisode publié";
  if (stageKey === "produit") return "en production";
  return "enregistrement à caler";
}

/** 2e, le correctif central : la bascule liste prioritaire / sandbox se fait
 *  sur l'archétype et la priorité, pas sur le stage. Le sandbox ne contient
 *  que les cibles à la fois SANS archétype, SANS priorité haute et SANS
 *  allié : un big fish au stage identifie va en liste prioritaire. */
export function vaAuSandbox(c: { archetype: string | null; priorite: string | null; nb_allies: number }): boolean {
  return !c.archetype && (c.priorite ?? "").toLowerCase() !== "haute" && c.nb_allies === 0;
}

/* ── Logique v3 des sections C et D : helpers purs (testés). Le méga-prompt
      hebdomadaire du v2 disparaît : la section D vit de résumés et de liens,
      le texte complet vit sur /backlog, et le prompt consolidé recopiait le
      stock entier dans l'email chaque semaine (cause n°2 du problème). */

const JOURS_STOCK_ANCIEN = 14;

/** Section D : les seuls items AFFICHÉS en détail, créés dans la fenêtre,
 *  encore en statut nouveau côté requête, de type feature, bug ou correction.
 *  Les notes ne paraissent JAMAIS (décision 5 du 25/08). Un item sans type
 *  (migration 0048 non appliquée) vaut feature. */
export function demandesSemaine(backlog: DemandeBrute[], depuisIso: string): DemandeBrute[] {
  return backlog.filter((i) => (i.type ?? "feature") !== "note" && (i.created_at ?? "") >= depuisIso);
}

/** Ligne de stock : N demandes (hors notes) en attente de triage, dont M de
 *  plus de deux semaines. */
export function stockDemandes(backlog: DemandeBrute[], maintenant = Date.now()): { total: number; anciens: number } {
  const demandes = backlog.filter((i) => (i.type ?? "feature") !== "note");
  const seuil = maintenant - JOURS_STOCK_ANCIEN * 24 * 3600 * 1000;
  return {
    total: demandes.length,
    anciens: demandes.filter((i) => i.created_at && new Date(i.created_at).getTime() < seuil).length,
  };
}

/** Âge en jours d'un item, pour l'affichage D. */
export function ageJours(createdAt: string | undefined, maintenant = Date.now()): number {
  if (!createdAt) return 0;
  return Math.max(0, Math.floor((maintenant - new Date(createdAt).getTime()) / 86_400_000));
}

/** Compile le récap v2. Chaque source est best-effort : une table absente ou
 *  une requête en échec produit une section vide, jamais un email bloqué. */
export async function compileRecap(sb: SB, joursFenetre = 7): Promise<RecapData> {
  const maintenant = Date.now();
  const depuis = new Date(maintenant - joursFenetre * 24 * 3600 * 1000).toISOString();
  const depuisPrecedente = new Date(maintenant - 2 * joursFenetre * 24 * 3600 * 1000).toISOString();

  /* ── A1, mouvements réels : épisodes créés, enregistrements clos,
        changements d'étape (journal mcp_audit, payload.stage), alliés ajoutés. */
  type Flags = { episode?: string | null; enregistre?: boolean; valide?: boolean; nouvelleEtape?: string; appuiAjoute?: boolean };
  const flags = new Map<string, Flags>();
  const flag = (cibleId: string, f: Flags) => flags.set(cibleId, { ...(flags.get(cibleId) ?? {}), ...f });

  try {
    const { data: eps } = await sb.from("episodes").select("cible_id, date_enregistrement, created_at").gte("created_at", depuis).limit(50);
    for (const e of ((eps ?? []) as { cible_id: string; date_enregistrement: string | null }[])) {
      if (e.cible_id) flag(e.cible_id, { episode: e.date_enregistrement, valide: true });
    }
  } catch { /* table sans created_at : section sans épisodes */ }

  try {
    const { data: recs } = await sb
      .from("fiche_rec_sessions")
      .select("fiche_id, ended_at, fiches(cible_id)")
      .not("ended_at", "is", null)
      .gte("ended_at", depuis)
      .limit(20);
    for (const r of ((recs ?? []) as unknown as { fiches: { cible_id: string | null } | null }[])) {
      const cid = r.fiches?.cible_id;
      if (cid) flag(cid, { enregistre: true });
    }
  } catch { /* 0041 absente */ }

  // Changements d'étape de la semaine : journal MCP (payload.stage des
  // update_cible/create_cible réussis, cible résolue par nom plus bas).
  const stageParNom = new Map<string, string>();
  const { data: audit } = await sb
    .from("mcp_audit")
    .select("tool, ok, payload, ts")
    .gte("ts", depuis)
    .in("tool", ["update_cible", "validate_cible", "create_cible"])
    .order("ts")
    .limit(1000);
  const nomsValides: string[] = [];
  for (const r of ((audit ?? []) as { tool: string; ok: boolean; payload: Record<string, unknown> }[])) {
    if (!r.ok) continue;
    const nomCible = typeof r.payload?.cible === "string" ? r.payload.cible : typeof r.payload?.nom === "string" ? r.payload.nom : null;
    if (!nomCible) continue;
    if (r.tool === "validate_cible") nomsValides.push(nomCible);
    const stage = typeof r.payload?.stage === "string" ? r.payload.stage : null;
    if (stage) stageParNom.set(nomCible, stage);
  }

  try {
    const { data: appuis } = await sb.from("appuis").select("cible_id, created_at").gte("created_at", depuis).limit(100);
    for (const a of ((appuis ?? []) as { cible_id: string | null }[])) {
      if (a.cible_id) flag(a.cible_id, { appuiAjoute: true });
    }
  } catch { /* rien */ }

  // Résolution des cibles touchées (par id, plus par nom pour l'audit), avec
  // l'archétype et la priorité (2e) et les champs du détecteur de placeholder.
  const COLS = "id, nom, organisation, role, stage_key, stage_label, archive, archetype, priorite";
  type CibleRow = {
    id: string; nom: string; organisation: string | null; role: string | null;
    stage_key: string | null; stage_label: string | null; archive: boolean;
    archetype: string | null; priorite: string | null;
  };
  const ids = new Set(flags.keys());
  const noms = new Set([...stageParNom.keys(), ...nomsValides]);
  const cibles = new Map<string, CibleRow>();
  if (ids.size) {
    const { data } = await sb.from("cibles_enrichies").select(COLS).in("id", [...ids]);
    for (const c of ((data ?? []) as CibleRow[])) cibles.set(c.id, c);
  }
  if (noms.size) {
    const { data } = await sb.from("cibles_enrichies").select(COLS).in("nom", [...noms]);
    for (const c of ((data ?? []) as CibleRow[])) {
      cibles.set(c.id, c);
      if (nomsValides.includes(c.nom)) flag(c.id, { valide: true });
      const stage = stageParNom.get(c.nom);
      if (stage) flag(c.id, { nouvelleEtape: stage });
    }
  }

  // Mouvements de faible enjeu (candidats) : créations de la semaine et
  // profils enrichis, quel que soit le stage. La bascule liste / sandbox se
  // décide plus bas sur l'archétype, la priorité et les alliés (2e), plus
  // jamais sur le stage : un big fish créé au stade identifie sort du sandbox.
  const faibles = new Map<string, "creation" | "enrichissement">();
  {
    const { data: neuves } = await sb
      .from("cibles_enrichies")
      .select(`${COLS}, created_at`)
      .gte("created_at", depuis)
      .eq("archive", false)
      .limit(200);
    for (const c of ((neuves ?? []) as CibleRow[])) {
      cibles.set(c.id, c);
      if (!flags.has(c.id)) faibles.set(c.id, "creation");
    }
    const { data: enrichis } = await sb
      .from("enrichment_jobs")
      .select("cible_id, statut, objectif, updated_at")
      .eq("statut", "done")
      .eq("objectif", "profil")
      .gte("updated_at", depuis)
      .limit(200);
    const idsEnrichis = [...new Set(((enrichis ?? []) as { cible_id: string }[]).map((j) => j.cible_id))]
      .filter((id) => id && !flags.has(id) && !faibles.has(id));
    if (idsEnrichis.length) {
      const { data } = await sb.from("cibles_enrichies").select(COLS).in("id", idsEnrichis);
      for (const c of ((data ?? []) as CibleRow[])) {
        cibles.set(c.id, c);
        faibles.set(c.id, "enrichissement");
      }
    }
  }

  // 2a : les cibles de test (colonne is_test, défensif tant que 0032 n'est
  // pas appliquée) et les placeholders ne paraissent JAMAIS dans le récap.
  const testIds = new Set<string>();
  try {
    const { data, error } = await sb.from("cibles").select("id").eq("is_test", true);
    if (!error) for (const r of ((data ?? []) as { id: string }[])) testIds.add(r.id);
  } catch { /* colonne absente */ }
  const exclue = (c: CibleRow) => c.archive || testIds.has(c.id) || isPlaceholder(c.nom, c.role, c.organisation);

  // Alliés par cible concernée (relais d'abord), graphies dédoublonnées (2b).
  const alliesPar = new Map<string, string[]>();
  const idsConcernes = [...new Set([...flags.keys(), ...faibles.keys()])];
  if (idsConcernes.length) {
    const { data } = await sb.from("appuis").select("cible_id, nom, est_relais").in("cible_id", idsConcernes).limit(1000);
    for (const a of ((data ?? []) as { cible_id: string; nom: string; est_relais: boolean | null }[])) {
      const liste = alliesPar.get(a.cible_id) ?? [];
      if (a.est_relais) liste.unshift(a.nom);
      else liste.push(a.nom);
      alliesPar.set(a.cible_id, liste);
    }
  }
  const alliesDe = (cid: string) => dedoublonneAllies(alliesPar.get(cid) ?? []).slice(0, 4);

  const ETAPES_HAUTES = new Set(["confirme", "programme", "enregistre", "publie", "produit"]);
  let mouvements: MouvementCible[] = [];
  for (const [cid, f] of flags) {
    const c = cibles.get(cid);
    if (!c || exclue(c)) continue;
    let rang: 1 | 2 | 3;
    let etape: string;
    let statut: string;
    if (f.enregistre) {
      rang = 1; etape = "enregistrée cette semaine"; statut = "publication à venir";
    } else if (f.episode !== undefined || f.valide || (f.nouvelleEtape && ETAPES_HAUTES.has(f.nouvelleEtape))) {
      rang = 1;
      etape = c.stage_label ? c.stage_label.toLowerCase() : "validée";
      statut = statutValide(c.stage_key, dateFr(f.episode ?? null));
    } else {
      rang = 2;
      etape = f.nouvelleEtape && c.stage_label ? `passée à ${c.stage_label.toLowerCase()}` : (c.stage_label ?? "en pipeline").toLowerCase();
      statut = f.appuiAjoute ? "allié ajouté cette semaine" : "en progression";
    }
    mouvements.push({ nom: c.nom, organisation: c.organisation, etape, statut, allies: alliesDe(cid), rang });
  }

  /* ── A2, sandbox, et candidats faibles requalifiés (2e) : un candidat sans
        archétype, sans priorité haute et sans allié va au sandbox ; les
        autres (big fish, pépites, priorités hautes, cibles avec allié)
        rejoignent la liste prioritaire en mouvements notables. */
  const sandbox: string[] = [];
  for (const [cid, source] of faibles) {
    const c = cibles.get(cid);
    if (!c || exclue(c)) continue;
    const nbAllies = (alliesPar.get(cid) ?? []).length;
    if (vaAuSandbox({ archetype: c.archetype, priorite: c.priorite, nb_allies: nbAllies })) {
      if (!sandbox.some((n) => nomsProches(n, c.nom))) sandbox.push(c.nom);
    } else {
      mouvements.push({
        nom: c.nom,
        organisation: c.organisation,
        etape: (c.stage_label ?? "en pipeline").toLowerCase(),
        statut: source === "creation" ? "entrée au pipeline cette semaine" : "profil enrichi cette semaine",
        allies: alliesDe(cid),
        rang: 3,
      });
    }
  }
  // 2c : la ligne de mouvement prime sur la mention en allié.
  mouvements = retireCiblesDesAllies(mouvements);
  mouvements.sort((a, b) => a.rang - b.rang || a.nom.localeCompare(b.nom));
  const nomsMouvements = mouvements.map((m) => m.nom);
  const sandboxFinal = sandbox.filter((n) => !nomsMouvements.some((m) => nomsProches(m, n)));

  /* ── B1, échecs détaillés : chaque échec nomme sa cible et sa cause. */
  const { data: jobs } = await sb
    .from("enrichment_jobs")
    .select("objectif, statut, error, cible_id, updated_at")
    .gte("updated_at", depuisPrecedente)
    .limit(1000);
  // Les lignes recap:* sont de la pure télémétrie de coût (résumés du récap,
  // 0048) : elles comptent dans les coûts B2, jamais dans les générations B1.
  const rows = ((jobs ?? []) as { objectif: string; statut: string; error: string | null; cible_id: string | null; updated_at: string }[])
    .filter((j) => !j.objectif.startsWith("recap:"));
  const semaine = rows.filter((j) => j.updated_at >= depuis);
  const precedente = rows.filter((j) => j.updated_at < depuis);
  const failed = semaine.filter((j) => j.statut === "failed" && j.error);

  const idsEchec = [...new Set(failed.map((j) => j.cible_id).filter((x): x is string => !!x))];
  const nomsEchec = new Map<string, string>();
  if (idsEchec.length) {
    const { data } = await sb.from("cibles_enrichies").select("id, nom").in("id", idsEchec);
    for (const c of ((data ?? []) as { id: string; nom: string }[])) nomsEchec.set(c.id, c.nom);
  }
  const parCause = new Map<string, EchecCause>();
  for (const j of failed) {
    const cause = normaliseCause(j.error ?? "");
    const cur = parCause.get(cause) ?? { cause, jobs: [] };
    cur.jobs.push({
      nom: (j.cible_id && nomsEchec.get(j.cible_id)) ?? "cible inconnue",
      type: j.objectif.startsWith("fiche:") ? j.objectif.slice("fiche:".length) : j.objectif,
    });
    parCause.set(cause, cur);
  }
  const echecs = [...parCause.values()].sort((a, b) => b.jobs.length - a.jobs.length);

  const generations = {
    done: semaine.filter((j) => j.statut === "done").length,
    failed: semaine.filter((j) => j.statut === "failed").length,
  };

  /* ── B3 : prompt de correction seulement sur échec SYSTÉMATIQUE. */
  const prompt_correction = promptCorrection(
    failed.map((j) => ({ cause: normaliseCause(j.error ?? ""), cible_id: j.cible_id })),
    precedente.filter((j) => j.statut === "failed" && j.error).map((j) => ({ cause: normaliseCause(j.error ?? "") }))
  );

  /* ── C1, demandes brutes. Colonnes type et resume (0048) défensives :
        repli sans elles tant que la migration n'est pas appliquée. */
  let backlog: DemandeBrute[] = [];
  {
    const enrichi = await sb
      .from("product_backlog")
      .select("id, auteur, contenu, contexte, created_at, type, resume")
      .eq("statut", "nouveau")
      .order("created_at")
      .limit(50);
    if (!enrichi.error) {
      backlog = (enrichi.data ?? []) as DemandeBrute[];
    } else {
      const { data: items } = await sb
        .from("product_backlog")
        .select("id, auteur, contenu, contexte, created_at")
        .eq("statut", "nouveau")
        .order("created_at")
        .limit(50);
      backlog = ((items ?? []) as DemandeBrute[]);
    }
  }
  // Lot 4 : chaque item porte un résumé court persistant (généré au modèle
  // rapide au premier passage, fallback troncature). Jamais bloquant.
  try {
    const resumes = await assurerResumes(sb, backlog);
    for (const i of backlog) i.resume = resumes.get(i.id) ?? i.resume ?? null;
  } catch { /* le récap part sans résumés */ }

  /* ── C v3, livraisons de la semaine (GitHub + items livre, jamais bloquant). */
  let livraisons: Livraison[] = [];
  let livraisons_incompletes = false;
  try {
    const c = await collecteLivraisons(sb, depuis);
    livraisons = c.livraisons;
    livraisons_incompletes = c.incomplet;
  } catch {
    livraisons_incompletes = true;
  }

  /* ── D v3, demandes de la semaine et ligne de stock. */
  const demandes_semaine = demandesSemaine(backlog, depuis);
  const stock = stockDemandes(backlog);

  /* ── Notes de plateau et besoins (inchangés du v1, défensifs). */
  let notes: RecapData["notes"] = [];
  try {
    const { data: notees } = await sb
      .from("fiches")
      .select("invite_nom, note_plateau, note_commentaire")
      .gte("note_at", depuis)
      .not("note_plateau", "is", null)
      .limit(20);
    notes = ((notees ?? []) as { invite_nom: string; note_plateau: number; note_commentaire: string | null }[])
      .map((f) => ({ invite: f.invite_nom, note: f.note_plateau, commentaire: f.note_commentaire }));
  } catch { notes = []; }

  const besoins: RecapData["besoins"] = [];
  try {
    const { data: shows } = await sb.from("shows").select("id, slug");
    const estival = estivalActif();
    for (const s of ((shows ?? []) as { id: string; slug: string }[])) {
      const couverture = await evaluerCouverture(sb, s.id, estival);
      for (const b of couverture.filter((x) => x.alerte)) {
        besoins.push({ show: s.slug, contrainte: b.besoin.contrainte, periode: b.besoin.periode, candidates: b.candidates?.length ?? null });
      }
    }
  } catch { /* le récap part quand même */ }

  /* ── B2, coûts. */
  let cout: RecapData["cout"] = null;
  const coutSemaine = await depenseDepuisEur(sb, depuis);
  const coutMois = await depenseMoisEur(sb);
  if (coutSemaine !== null && coutMois !== null) {
    cout = { semaine_eur: coutSemaine, mois_eur: coutMois, plafond_eur: plafondEur() };
  }

  return { depuis, mouvements, sandbox: sandboxFinal, notes, besoins, generations, echecs, cout, prompt_correction, backlog, livraisons, livraisons_incompletes, demandes_semaine, stock };
}

/** Triage proposé par item (écrit en commentaire du backlog par le cron,
 *  la décision reste humaine). Repli a_preciser : ne bloque jamais l'envoi. */
export async function proposeTriage(items: RecapData["backlog"]): Promise<TriageProposal[]> {
  const repli: TriageProposal[] = items.map((i) => ({
    id: i.id,
    triage: "a_preciser",
    justification: "À préciser avec l'auteur (triage automatique indisponible).",
  }));
  if (!items.length || !hasAnthropicKey()) return repli;
  try {
    const client = new Anthropic();
    const liste = items.map((i) => `- id ${i.id} (${i.auteur ?? "inconnu"}) : ${i.contenu}`).join("\n");
    const res = await client.messages.create({
      model: ENRICH_MODEL,
      max_tokens: 1500,
      system: [
        "Tu tries le backlog produit de Magellan (moteur de conquête d'invités podcast, Collision Productions).",
        "Pour chaque item : a_faire (clair et utile), a_preciser (ambigu ou incomplet), rejete (hors périmètre ou doublon).",
        "Justification en UNE ligne, sobre, sans emoji ni tiret cadratin.",
        'Réponds UNIQUEMENT en JSON : [{"id", "triage", "justification"}].',
      ].join("\n"),
      messages: [{ role: "user", content: liste }],
    });
    const texte = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    const raw = extractJson<TriageProposal[]>(texte);
    if (!Array.isArray(raw)) return repli;
    const valides = new Set(["a_faire", "a_preciser", "rejete"]);
    const parId = new Map(raw.filter((t) => t?.id && valides.has(t.triage)).map((t) => [t.id, t]));
    return items.map((i) => parId.get(i.id) ?? repli.find((r) => r.id === i.id)!);
  } catch {
    return repli;
  }
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Base des liens console dans l'email (page /backlog). */
const appUrl = () => (process.env.APP_URL ?? "https://magellan.collision.studio").replace(/\/+$/, "");
/** Conversation Claude préremplie (liens Valider / Rejeter de la section D). */
export const lienClaude = (q: string) => `https://claude.ai/new?q=${encodeURIComponent(q)}`;

/** Corps HTML v3 : quatre parties A / B / C / D, aucun tiret hors sandbox.
 *  Cible de longueur : moins de 4 000 caractères hors semaine exceptionnelle. */
export function buildRecapEmail(data: RecapData): { subject: string; html: string } {
  const semaine = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });
  const subject = `Magellan, récap hebdo du ${semaine}`;
  const li = (s: string) => `<li style="margin:5px 0">${s}</li>`;
  const pre = (s: string) => `<pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#F6F4EF;padding:12px 14px;margin:8px 0">${esc(s)}</pre>`;

  /* A. Ce qui a bougé */
  const a: string[] = [];
  for (const m of data.mouvements) {
    const allies = m.allies.length ? m.allies.map(esc).join(", ") : "aucun";
    a.push(li(`<b>${esc(m.nom)}</b>${m.organisation ? ` (${esc(m.organisation)})` : ""}, ${esc(m.etape)}, ${esc(m.statut)}. Alliés : ${allies}.`));
  }
  if (!a.length) a.push(li("Aucun mouvement prioritaire cette semaine."));
  const partieA = [
    `<h2 style="font-size:17px">A. Ce qui a bougé</h2><ul style="padding-left:18px">${a.join("")}</ul>`,
    data.sandbox.length
      ? `<p style="margin:10px 0 0 0"><b>Sandbox</b> (exploratoire, aucune action requise) : ${data.sandbox.map(esc).join(" - ")}</p>`
      : "",
    data.notes.length
      ? `<p style="margin:10px 0 0 0">${data.notes.map((n) => `Note de plateau ${esc(n.invite)} : <b>${n.note}/5</b>${n.commentaire ? `. ${esc(n.commentaire)}` : ""}`).join("<br/>")}</p>`
      : "",
    data.besoins.length
      ? `<p style="margin:10px 0 0 0">${data.besoins.map((b) => `Besoin non couvert (${esc(b.show.toUpperCase())}) : « ${esc(b.contrainte)} »${b.periode ? ` (${esc(b.periode)})` : ""} : ${b.candidates === null ? "critères à évaluer à la main" : `${b.candidates} cible(s) actionnable(s), il en faut 2`}.`).join("<br/>")}</p>`
      : "",
  ].join("");

  /* B. Échecs et coûts */
  const b: string[] = [];
  b.push(li(`Générations : <b>${data.generations.done} réussie(s)</b>, ${data.generations.failed} en échec.`));
  for (const e of data.echecs) {
    const fiches = e.jobs.map((j) => `${esc(j.nom)} (job ${esc(j.type)})`).join(", ");
    b.push(li(`Cause ${esc(e.cause)} : ${fiches}. À relancer.`));
  }
  if (data.cout) {
    b.push(li(`Coût API estimé : <b>${data.cout.semaine_eur.toFixed(2)} €</b> cette semaine, ${data.cout.mois_eur.toFixed(2)} € sur le mois (plafond ${data.cout.plafond_eur} €).`));
  }
  const partieB = [
    `<h2 style="font-size:17px">B. Échecs et coûts</h2><ul style="padding-left:18px">${b.join("")}</ul>`,
    data.prompt_correction
      ? `<p style="margin:6px 0 0 0"><b>Échec systématique détecté.</b> Prompt de correction à coller dans Claude Code :</p>${pre(data.prompt_correction)}`
      : "",
  ].join("");

  /* C. Magellan cette semaine : les livraisons en langage utilisateur. */
  const lignesC = data.livraisons.map((l) =>
    li(`${esc(l.resume)}${l.url ? ` <a href="${esc(l.url)}" style="color:#8A857D;font-size:12px;text-decoration:none">détail</a>` : ""}`)
  );
  const partieC = [
    `<h2 style="font-size:17px">C. Magellan cette semaine</h2>`,
    lignesC.length
      ? `<ul style="padding-left:18px">${lignesC.join("")}</ul>`
      : `<p>Aucune livraison cette semaine.</p>`,
    data.livraisons_incompletes
      ? `<p style="color:#8a8d88;font-size:12px;margin:4px 0 0 0">Liste établie sans l'accès GitHub, elle peut être incomplète.</p>`
      : "",
  ].join("");

  /* D. Demandes produit : les items de la semaine seuls, résumés, avec les
     liens d'action en un clic. Le stock est une ligne de compteur. */
  const backlogUrl = `${appUrl()}/backlog`;
  const d: string[] = [];
  for (const item of data.demandes_semaine) {
    const id8 = item.id.slice(0, 8);
    const type = item.type ?? "feature";
    const resume = (item.resume ?? "").trim() || tronqueProprement(item.contenu);
    const age = ageJours(item.created_at);
    const liens = [
      `<a href="${esc(lienClaude(`passe l'item ${id8} en a_faire`))}" style="color:#177A4C;font-weight:600">Valider</a>`,
      `<a href="${esc(lienClaude(`rejette l'item ${id8}`))}" style="color:#E63946;font-weight:600">Rejeter</a>`,
      `<a href="${esc(`${backlogUrl}#${id8}`)}" style="color:#1D6FD8">Voir le détail</a>`,
    ].join(" &nbsp;·&nbsp; ");
    d.push(li(
      `${type !== "feature" ? `<b>[${esc(type)}]</b> ` : ""}${esc(resume)}<br/>` +
      `<span style="color:#8a8d88;font-size:12px">${esc(item.auteur ?? "inconnu")}, il y a ${age} jour${age > 1 ? "s" : ""}</span><br/>${liens}`
    ));
  }
  const ligneStock = data.stock.total > 0
    ? `<a href="${esc(backlogUrl)}" style="color:#1B1D1E">${data.stock.total} demande${data.stock.total > 1 ? "s" : ""} en attente de triage${data.stock.anciens > 0 ? `, dont ${data.stock.anciens} de plus de 2 semaines` : ""}</a>.`
    : `Le backlog est à jour : <a href="${esc(backlogUrl)}" style="color:#1B1D1E">aucune demande en attente de triage</a>.`;
  const partieD = [
    `<h2 style="font-size:17px">D. Demandes produit</h2>`,
    d.length ? `<ul style="padding-left:18px">${d.join("")}</ul>` : `<p>Aucune demande nouvelle cette semaine.</p>`,
    `<p style="margin:10px 0 0 0">${ligneStock}</p>`,
    `<p style="color:#8a8d88;font-size:12px;margin:12px 0 0 0">Les liens Valider et Rejeter ouvrent une conversation Claude préremplie, à envoyer telle quelle ou à compléter ; le triage manuel reste « passe l'item xxxxxxxx en a_faire » dans Claude.</p>`,
  ].join("");

  const html = [
    `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1D1E;line-height:1.55;max-width:640px;margin:0 auto;padding:8px 4px">`,
    partieA,
    partieB,
    partieC,
    partieD,
    `<p style="color:#8a8d88;font-size:12px;margin-top:24px">Collision Productions</p>`,
    `</body></html>`,
  ].join("");
  return { subject, html };
}

/** Destinataires : RECAP_EMAILS (env, séparés par virgules), sinon le staff
 *  configuré des shows, sinon EPISODE_STAFF_EMAILS. */
export async function recapRecipients(sb: SB): Promise<string[]> {
  const env = (process.env.RECAP_EMAILS ?? "").split(/[,\s]+/).map((e) => e.trim()).filter((e) => e.includes("@"));
  if (env.length) return Array.from(new Set(env));
  const { data } = await sb.from("shows").select("staff");
  const all = ((data ?? []) as { staff: StaffMember[] | null }[])
    .flatMap((s) => s.staff ?? [])
    .map((m) => m.email)
    .filter((e): e is string => !!e && e.includes("@"));
  if (all.length) return Array.from(new Set(all.map((e) => e.toLowerCase())));
  return (process.env.EPISODE_STAFF_EMAILS ?? "").split(/[,\s]+/).filter((e) => e.includes("@"));
}
