// S3 — traitement des jobs d'enrichissement.
//
// Deux déclencheurs, selon le plan Vercel :
//  • Pro  : le cron (vercel.json) appelle /api/cron/enrich (maxDuration 300).
//  • Hobby : pas de cron < 1×/jour → la file se draine via `waitUntil` au moment
//    où on met un job en file (enrich_cible/colonne) ou sur les lectures chaudes
//    (daily_five, page « Aujourd'hui »). `kickQueue()` lance ce drainage en
//    tâche de fond après la réponse, dans le budget ~60 s de la fonction.

import { waitUntil } from "@vercel/functions";
import { createServiceClient } from "../supabase/service";
import { enrichCibleProfile, applyProfileProposal } from "./profile";
import { processFicheGroupe, FICHE_JOB_PREFIX, FICHE_GROUPES, type FicheGroupe } from "../fiche/generation";
import type { FicheRow } from "../fiche/store";
import type { CibleEnrichie } from "../types";

const STALE_MINUTES = 10;
// Modèle profond quand on a le budget (cron 300 s) ; modèle rapide sinon.
const DEEP_MODEL = process.env.ENRICH_MODEL_DEEP ?? "claude-sonnet-4-6";
const FAST_MODEL = process.env.ENRICH_MODEL ?? "claude-haiku-4-5-20251001";

export interface ProcessOpts {
  /** Nombre max de jobs traités sur cet appel (défaut 2). */
  max?: number;
  /** Modèle d'enrichissement (défaut : profond). */
  model?: string;
  /** Recherches web par job (défaut 5). */
  maxSearches?: number;
  /** Budget mural : on cesse de réclamer de nouveaux jobs passé ce délai (défaut : illimité). */
  budgetMs?: number;
}

export async function processEnrichmentJobs(opts: ProcessOpts = {}): Promise<{ traites: number; details: unknown[] }> {
  const { max = 2, model = DEEP_MODEL, maxSearches = 5, budgetMs = Infinity } = opts;
  const sb = createServiceClient();
  const nowIso = () => new Date().toISOString();
  const startedAt = Date.now();

  // 1) Requalifier les jobs bloqués (running trop vieux) en échec.
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  await sb
    .from("enrichment_jobs")
    .update({ statut: "failed", error: `timeout (> ${STALE_MINUTES} min)`, updated_at: nowIso() })
    .eq("statut", "running")
    .lt("updated_at", staleBefore);

  const details: unknown[] = [];
  let traites = 0;

  // 2) Traiter les jobs en attente un par un, dans la limite `max` et le budget mural.
  while (traites < max && Date.now() - startedAt < budgetMs) {
    const { data: pending } = await sb
      .from("enrichment_jobs")
      .select("id, cible_id, objectif, apply")
      .eq("statut", "pending")
      .order("created_at", { ascending: true })
      .limit(1);
    const job = (pending ?? [])[0] as { id: string; cible_id: string; objectif: string; apply: boolean } | undefined;
    if (!job) break;

    await sb.from("enrichment_jobs").update({ statut: "running", updated_at: nowIso() }).eq("id", job.id);
    try {
      const { data: row } = await sb.from("cibles_enrichies").select("*").eq("id", job.cible_id).single();
      if (!row) throw new Error("Cible introuvable");

      // Jobs de GÉNÉRATION DE FICHE (objectif "fiche:<groupe>") : une recherche
      // web = quelques sections écrites sur la fiche structurée de la cible.
      if (job.objectif.startsWith(FICHE_JOB_PREFIX)) {
        const groupe = job.objectif.slice(FICHE_JOB_PREFIX.length) as FicheGroupe;
        if (!FICHE_GROUPES.includes(groupe)) throw new Error(`Groupe de génération inconnu : ${groupe}`);
        const { data: fiche } = await sb.from("fiches").select("*").eq("cible_id", job.cible_id).maybeSingle();
        if (!fiche) throw new Error("Fiche introuvable pour cette cible (create_fiche d'abord).");
        // Contrat v2 §3.6 : retry automatique (2 tentatives) sur erreur API/JSON.
        let r: { sections: string[] } | null = null;
        let lastErr: unknown;
        for (let tentative = 1; tentative <= 2 && !r; tentative++) {
          try {
            r = await processFicheGroupe(sb, groupe, row as CibleEnrichie, fiche as FicheRow, { model, maxSearches });
          } catch (e) {
            lastErr = e;
          }
        }
        if (!r) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
        await sb
          .from("enrichment_jobs")
          .update({ statut: "done", resultat: { groupe, sections: r.sections }, error: null, updated_at: nowIso() })
          .eq("id", job.id);
        details.push({ id: job.id, ok: true, groupe, sections: r.sections });
        traites += 1;
        continue;
      }

      const proposal = await enrichCibleProfile(row as CibleEnrichie, { maxSearches, model });
      if (!proposal) throw new Error("Recherche web sans résultat exploitable");
      let applied: string[] | undefined;
      if (job.apply) applied = await applyProfileProposal(sb, row as CibleEnrichie, proposal);
      await sb
        .from("enrichment_jobs")
        .update({ statut: "done", resultat: proposal, sources: proposal.sources ?? [], applied: applied ?? null, error: null, updated_at: nowIso() })
        .eq("id", job.id);
      details.push({ id: job.id, ok: true, applied });
    } catch (e) {
      await sb
        .from("enrichment_jobs")
        .update({ statut: "failed", error: e instanceof Error ? e.message : String(e), updated_at: nowIso() })
        .eq("id", job.id);
      details.push({ id: job.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    traites += 1;
  }
  return { traites, details };
}

/**
 * Draine la file en tâche de fond APRÈS la réponse (plan Hobby, sans cron).
 * Borné par le budget de la fonction Vercel (maxDuration 300, Fluid compute).
 * No-op silencieux hors Vercel (waitUntil absent) : on lance quand même la
 * promesse pour l'environnement de dev.
 */
export function kickQueue(): void {
  // Budget 240 s : les fonctions qui appellent kickQueue déclarent
  // maxDuration 300 (Fluid compute). Un kick draine une fiche entière.
  const work = processEnrichmentJobs({ max: 6, model: FAST_MODEL, maxSearches: 3, budgetMs: 240_000 }).catch(() => {});
  try {
    waitUntil(work);
  } catch {
    // Hors runtime Vercel : la promesse tourne en fire-and-forget.
  }
}
