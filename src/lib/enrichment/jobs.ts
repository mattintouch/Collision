// S3 — traitement des jobs d'enrichissement (appelé par le cron). Hors du
// plafond ~60 s du client MCP : on peut chercher plus profond.

import { createServiceClient } from "../supabase/service";
import { enrichCibleProfile, applyProfileProposal } from "./profile";
import type { CibleEnrichie } from "../types";

const MAX_PER_TICK = 2; // borne par tick pour rester loin de maxDuration 300
const STALE_MINUTES = 10;
// Modèle plus profond pour le mode async (budget 300 s, pas de plafond MCP).
const DEEP_MODEL = process.env.ENRICH_MODEL_DEEP ?? "claude-sonnet-4-6";

interface JobRow {
  id: string;
  cible_id: string;
  objectif: string;
  apply: boolean;
}

export async function processEnrichmentJobs(): Promise<{ traites: number; details: unknown[] }> {
  const sb = createServiceClient();
  const nowIso = () => new Date().toISOString();

  // 1) Requalifier les jobs bloqués (running trop vieux) en échec.
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  await sb
    .from("enrichment_jobs")
    .update({ statut: "failed", error: `timeout (> ${STALE_MINUTES} min)`, updated_at: nowIso() })
    .eq("statut", "running")
    .lt("updated_at", staleBefore);

  // 2) Prendre quelques jobs en attente.
  const { data: pending } = await sb
    .from("enrichment_jobs")
    .select("id, cible_id, objectif, apply")
    .eq("statut", "pending")
    .order("created_at", { ascending: true })
    .limit(MAX_PER_TICK);
  const jobs = (pending ?? []) as JobRow[];
  const details: unknown[] = [];

  for (const job of jobs) {
    await sb.from("enrichment_jobs").update({ statut: "running", updated_at: nowIso() }).eq("id", job.id);
    try {
      const { data: row } = await sb.from("cibles_enrichies").select("*").eq("id", job.cible_id).single();
      if (!row) throw new Error("Cible introuvable");
      const proposal = await enrichCibleProfile(row as CibleEnrichie, { maxSearches: 5, model: DEEP_MODEL });
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
  }
  return { traites: jobs.length, details };
}
