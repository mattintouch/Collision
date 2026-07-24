// Chantier 3 — télémétrie de coût et plafond mensuel (brief §4).
//
// Le coût est ESTIMÉ depuis les tokens enregistrés par job (enrichment_jobs,
// migration 0039) et une grille de prix par famille de modèle. Le plafond est
// une décision actée (§1.3) : alerte à 80 pour cent, coupure des générations
// non urgentes à 100 pour cent, override manuel réservé à l'admin. Tout est
// défensif : sans la migration 0039, la dépense est inconnue et rien ne bloque.

import type { createServiceClient } from "../supabase/service";

type SB = ReturnType<typeof createServiceClient>;

/** Plafond mensuel en euros (décision §1.3, recalibrable par l'env). */
export function plafondEur(): number {
  const v = Number(process.env.BUDGET_API_EUR ?? 200);
  return Number.isFinite(v) && v > 0 ? v : 200;
}

// Grille de prix ESTIMÉS, en euros par million de tokens, par famille de
// modèle (ordre de grandeur des tarifs Anthropic, parité euro/dollar assumée).
// La recherche web est facturée en sus par requête : non comptée ici, le
// plafond se recalibrera sur la facture réelle (brief §4.4).
const PRIX_EUR_MTOK: { motif: RegExp; entree: number; sortie: number }[] = [
  { motif: /haiku/i, entree: 1, sortie: 5 },
  { motif: /sonnet/i, entree: 3, sortie: 15 },
  { motif: /opus/i, entree: 15, sortie: 75 },
];
const PRIX_DEFAUT = { entree: 3, sortie: 15 };
// Recherche web : facturée en sus par requête (tâche 6 du handoff, le
// disjoncteur était à moitié aveugle sans ce poste). Estimation 10 € les 1000.
const PRIX_RECHERCHE_EUR = 0.01;

/** Coût estimé d'un appel en euros. */
export function coutEstimeEur(model: string | null, tokensIn: number, tokensOut: number): number {
  const prix = PRIX_EUR_MTOK.find((p) => p.motif.test(model ?? "")) ?? PRIX_DEFAUT;
  return (tokensIn * prix.entree + tokensOut * prix.sortie) / 1_000_000;
}

interface LigneJob { objectif: string; model: string | null; tokens_in: number | null; tokens_out: number | null; web_searches?: number | null }

/** Jobs instrumentés depuis une date. null si la télémétrie est absente (0039).
 *  La colonne web_searches (0042) est optionnelle : repli sans elle. */
async function jobsDepuis(sb: SB, depuisIso: string): Promise<LigneJob[] | null> {
  try {
    const { data, error } = await sb
      .from("enrichment_jobs")
      .select("objectif, model, tokens_in, tokens_out, web_searches")
      .gte("updated_at", depuisIso)
      .not("tokens_in", "is", null)
      .limit(5000);
    if (!error) return (data ?? []) as LigneJob[];
    // Repli : 0042 non appliquée, on compte les tokens sans les recherches.
    const sansRecherches = await sb
      .from("enrichment_jobs")
      .select("objectif, model, tokens_in, tokens_out")
      .gte("updated_at", depuisIso)
      .not("tokens_in", "is", null)
      .limit(5000);
    if (sansRecherches.error) return null; // 0039 non appliquée
    return (sansRecherches.data ?? []) as LigneJob[];
  } catch {
    return null;
  }
}

function somme(jobs: LigneJob[]): number {
  return jobs.reduce(
    (acc, j) => acc + coutEstimeEur(j.model, j.tokens_in ?? 0, j.tokens_out ?? 0) + (j.web_searches ?? 0) * PRIX_RECHERCHE_EUR,
    0
  );
}

export function debutMoisIso(now = Date.now()): string {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

export function moisCourant(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 7); // "2026-07"
}

/** Dépense estimée du mois en cours, en euros. null si télémétrie absente. */
export async function depenseMoisEur(sb: SB, now = Date.now()): Promise<number | null> {
  const jobs = await jobsDepuis(sb, debutMoisIso(now));
  return jobs === null ? null : somme(jobs);
}

/** Dépense estimée sur une fenêtre glissante (récap hebdo). null si absente. */
export async function depenseDepuisEur(sb: SB, depuisIso: string): Promise<number | null> {
  const jobs = await jobsDepuis(sb, depuisIso);
  return jobs === null ? null : somme(jobs);
}

/** Ventilation du mois par objectif (fiche:portrait, profil...), triée. */
export async function ventilationMois(
  sb: SB,
  now = Date.now()
): Promise<{ objectif: string; jobs: number; tokens_in: number; tokens_out: number; recherches: number; cout_eur: number }[]> {
  const jobs = await jobsDepuis(sb, debutMoisIso(now));
  if (!jobs) return [];
  const par = new Map<string, { objectif: string; jobs: number; tokens_in: number; tokens_out: number; recherches: number; cout_eur: number }>();
  for (const j of jobs) {
    const cle = j.objectif.startsWith("fiche:") ? j.objectif : "profil";
    const cur = par.get(cle) ?? { objectif: cle, jobs: 0, tokens_in: 0, tokens_out: 0, recherches: 0, cout_eur: 0 };
    cur.jobs += 1;
    cur.tokens_in += j.tokens_in ?? 0;
    cur.tokens_out += j.tokens_out ?? 0;
    cur.recherches += j.web_searches ?? 0;
    cur.cout_eur += coutEstimeEur(j.model, j.tokens_in ?? 0, j.tokens_out ?? 0) + (j.web_searches ?? 0) * PRIX_RECHERCHE_EUR;
    par.set(cle, cur);
  }
  return Array.from(par.values()).sort((a, b) => b.cout_eur - a.cout_eur);
}

const OVERRIDE_KEY = "budget_override";
const ALERTES_KEY = "budget_alertes";

interface OverrideState { mois?: string; actif?: boolean }
interface AlertesState { mois?: string; seuil80?: boolean; seuil100?: boolean }

async function readState<T>(sb: SB, key: string): Promise<T> {
  const { data } = await sb.from("system_state").select("value").eq("key", key).maybeSingle();
  return (((data as { value?: T } | null)?.value) ?? {}) as T;
}

async function writeState(sb: SB, key: string, value: unknown): Promise<void> {
  await sb.from("system_state").upsert({ key, value, updated_at: new Date().toISOString() });
}

/** Pose ou lève l'override admin du plafond, valable pour le mois en cours. */
export async function setBudgetOverride(sb: SB, actif: boolean, now = Date.now()): Promise<void> {
  await writeState(sb, OVERRIDE_KEY, { mois: moisCourant(now), actif } satisfies OverrideState);
}

/** Lecture SANS effet de bord (aucun marqueur d'alerte posé) : pour l'outil
 *  MCP budget_api. verifierBudget, elle, marque les seuils franchis. */
export async function etatBudgetLecture(sb: SB, now = Date.now()): Promise<Omit<EtatBudget, "alertes_dues">> {
  const plafond = plafondEur();
  const depense = await depenseMoisEur(sb, now);
  if (depense === null) return { depense_eur: null, plafond_eur: plafond, ratio: null, override: false, bloque: false };
  const ratio = depense / plafond;
  let override = false;
  try {
    const ov = await readState<OverrideState>(sb, OVERRIDE_KEY);
    override = ov.actif === true && ov.mois === moisCourant(now);
  } catch {
    /* system_state absente */
  }
  return { depense_eur: depense, plafond_eur: plafond, ratio, override, bloque: ratio >= 1 && !override };
}

export interface EtatBudget {
  depense_eur: number | null; // null : télémétrie absente (0039 non appliquée)
  plafond_eur: number;
  ratio: number | null;
  override: boolean;
  bloque: boolean;
  /** Seuils qui viennent d'être franchis sur CET appel (déclencheurs d'alerte,
   *  une seule fois par mois et par seuil). */
  alertes_dues: ("80" | "100")[];
}

/**
 * État du budget du mois, avec franchissements de seuil marqués dans
 * system_state (une alerte par seuil et par mois). À 100 pour cent sans
 * override, les générations non urgentes sont bloquées.
 */
export async function verifierBudget(sb: SB, now = Date.now()): Promise<EtatBudget> {
  const plafond = plafondEur();
  const depense = await depenseMoisEur(sb, now);
  if (depense === null) {
    return { depense_eur: null, plafond_eur: plafond, ratio: null, override: false, bloque: false, alertes_dues: [] };
  }
  const ratio = depense / plafond;
  const mois = moisCourant(now);

  let override = false;
  const alertes_dues: ("80" | "100")[] = [];
  try {
    const ov = await readState<OverrideState>(sb, OVERRIDE_KEY);
    override = ov.actif === true && ov.mois === mois;

    const marques = await readState<AlertesState>(sb, ALERTES_KEY);
    const duMois: AlertesState = marques.mois === mois ? marques : { mois };
    if (ratio >= 0.8 && !duMois.seuil80) { duMois.seuil80 = true; alertes_dues.push("80"); }
    if (ratio >= 1 && !duMois.seuil100) { duMois.seuil100 = true; alertes_dues.push("100"); }
    if (alertes_dues.length) await writeState(sb, ALERTES_KEY, duMois);
  } catch {
    // system_state absente (0038) : pas de marqueurs, pas d'override, pas d'alerte.
  }

  return { depense_eur: depense, plafond_eur: plafond, ratio, override, bloque: ratio >= 1 && !override, alertes_dues };
}
