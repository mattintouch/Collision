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
import { processRedaction } from "../fiche/redaction";
import { classifyApiError, sanitizeError, breakerOuvert, breakerEchec, breakerSucces } from "../ai/sante";
import { verifierBudget } from "../ai/cout";
import type { WebSearchUsage } from "../ai/websearch";
import { alerteEchecGeneration, alerteDisjoncteur, alerteBudget } from "../recap/alertes";
import type { FicheRow } from "../fiche/store";
import type { CibleEnrichie } from "../types";

const STALE_MINUTES = 10;
// Pause avant la seconde tentative d'un groupe de fiche (erreur transitoire).
const RETRY_PAUSE_MS = 3_000;
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
  // Jobs de rédaction différés dans CE drainage (les groupes de recherche
  // d'abord) : un job ne se re-diffère pas en boucle, il attend le kick suivant.
  const differes = new Set<string>();

  // Disjoncteur (chantier 2 §3.3) : API durablement indisponible → les jobs
  // restent en file, aucun token n'est consommé, on ressort immédiatement.
  const circuit = await breakerOuvert(sb);
  if (circuit.ouvert) {
    return { traites: 0, details: [{ disjoncteur: `ouvert jusqu'à ${circuit.jusqu_a}`, cause: circuit.cause }] };
  }

  // Plafond budget (chantier 3 §4.3, décision §1.3) : alerte à 80 pour cent
  // (une par mois), coupure des générations non urgentes à 100 pour cent sauf
  // override admin. Les jobs restent en file.
  const budget = await verifierBudget(sb);
  for (const seuil of budget.alertes_dues) {
    await alerteBudget(sb, { seuil, depense_eur: budget.depense_eur ?? 0, plafond_eur: budget.plafond_eur });
  }
  if (budget.bloque) {
    return {
      traites: 0,
      details: [{ budget: `plafond mensuel atteint (${(budget.depense_eur ?? 0).toFixed(2)} € sur ${budget.plafond_eur} €)`, override: "outil budget_override (admin)" }],
    };
  }

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

    // Revendication ATOMIQUE (tâche 1) : le cron 5 min et les kickQueue
    // coexistent ; seul le drain qui bascule pending → running traite le job,
    // l'autre passe au suivant sans doublonner.
    const { data: revendique } = await sb
      .from("enrichment_jobs")
      .update({ statut: "running", updated_at: nowIso() })
      .eq("id", job.id)
      .eq("statut", "pending")
      .select("id")
      .maybeSingle();
    if (!revendique) continue;
    // Contexte pour l'alerte d'échec (rempli au fil du try, lu dans le catch).
    let cibleNom: string | null = null;
    let ficheSlug: string | null = null;
    let circuitVientDOuvrir = false;
    // Télémétrie de coût (chantier 3) : tokens accumulés sur toutes les
    // tentatives du job, écrits à part (best-effort tant que 0039 n'est pas
    // appliquée, pour ne jamais casser l'écriture du statut).
    const usage: WebSearchUsage = { tokens_in: 0, tokens_out: 0 };
    const ecrireTelemetrie = async () => {
      if (usage.tokens_in === 0 && usage.tokens_out === 0) return;
      try {
        await sb.from("enrichment_jobs").update({ tokens_in: usage.tokens_in, tokens_out: usage.tokens_out, model }).eq("id", job.id);
      } catch {
        /* colonnes absentes : migration 0039 non appliquée */
      }
    };
    try {
      const { data: row } = await sb.from("cibles_enrichies").select("*").eq("id", job.cible_id).single();
      if (!row) throw new Error("Cible introuvable");
      cibleNom = (row as CibleEnrichie).nom ?? null;

      // Jobs de GÉNÉRATION DE FICHE (objectif "fiche:<groupe>") : une recherche
      // web = quelques sections écrites sur la fiche structurée de la cible.
      if (job.objectif.startsWith(FICHE_JOB_PREFIX)) {
        const groupe = job.objectif.slice(FICHE_JOB_PREFIX.length) as FicheGroupe;
        if (!FICHE_GROUPES.includes(groupe)) throw new Error(`Groupe de génération inconnu : ${groupe}`);
        // Passe de RÉDACTION (contrat v3) : elle consolide la fiche entière,
        // elle passe donc APRÈS tous les groupes de recherche de la cible.
        // Tant qu'il en reste en file, elle retourne en fin de file (une seule
        // fois par drainage : au-delà, elle attend le prochain kick).
        if (groupe === "redaction") {
          const { data: autres } = await sb
            .from("enrichment_jobs")
            .select("id")
            .eq("cible_id", job.cible_id)
            .like("objectif", `${FICHE_JOB_PREFIX}%`)
            .in("statut", ["pending", "running"])
            .neq("id", job.id)
            .limit(1);
          if ((autres ?? []).length) {
            await sb.from("enrichment_jobs").update({ statut: "pending", created_at: nowIso(), updated_at: nowIso() }).eq("id", job.id);
            if (differes.has(job.id)) break; // déjà différé dans ce drainage : au prochain kick
            differes.add(job.id);
            continue; // sans consommer le quota de jobs
          }
        }
        const { data: fiche } = await sb.from("fiches").select("*").eq("cible_id", job.cible_id).maybeSingle();
        if (!fiche) throw new Error("Fiche introuvable pour cette cible (create_fiche d'abord).");
        ficheSlug = (fiche as FicheRow).slug ?? null;
        // Retry SÉLECTIF (brief §3.3) : seule une erreur transitoire (surcharge,
        // 5xx, réseau) mérite une seconde tentative, après une courte pause. Un
        // JSON illisible est déjà couvert par le finisher ; un crédit épuisé ne
        // se réessaie pas, il alimente le disjoncteur.
        let r: { sections: string[]; rapport?: unknown } | null = null;
        let lastErr: unknown;
        for (let tentative = 1; tentative <= 2 && !r; tentative++) {
          try {
            r = groupe === "redaction"
              ? await processRedaction(sb, row as CibleEnrichie, fiche as FicheRow, { model, usageOut: usage })
              : await processFicheGroupe(sb, groupe, row as CibleEnrichie, fiche as FicheRow, { model, maxSearches, usageOut: usage });
          } catch (e) {
            lastErr = e;
            const msg = e instanceof Error ? e.message : String(e);
            if (tentative >= 2 || classifyApiError(msg) !== "transitoire") break;
            await new Promise((res) => setTimeout(res, RETRY_PAUSE_MS));
          }
        }
        if (!r) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
        await breakerSucces(sb);
        await sb
          .from("enrichment_jobs")
          .update({ statut: "done", resultat: { groupe, sections: r.sections, ...(r.rapport ? { rapport: r.rapport } : {}) }, error: null, updated_at: nowIso() })
          .eq("id", job.id);
        await ecrireTelemetrie();
        details.push({ id: job.id, ok: true, groupe, sections: r.sections });
        traites += 1;
        continue;
      }

      const proposal = await enrichCibleProfile(row as CibleEnrichie, { maxSearches, model, usageOut: usage });
      if (!proposal) throw new Error("Recherche web sans résultat exploitable");
      await breakerSucces(sb);
      let applied: string[] | undefined;
      if (job.apply) applied = await applyProfileProposal(sb, row as CibleEnrichie, proposal);
      await sb
        .from("enrichment_jobs")
        .update({ statut: "done", resultat: proposal, sources: proposal.sources ?? [], applied: applied ?? null, error: null, updated_at: nowIso() })
        .eq("id", job.id);
      await ecrireTelemetrie();
      details.push({ id: job.id, ok: true, applied });
    } catch (e) {
      const brut = e instanceof Error ? e.message : String(e);
      // Aucun secret dans les journaux visibles (garde-fou §8.2) : le message
      // stocké dans enrichment_jobs.error est affiché sur la fiche.
      const msg = sanitizeError(brut);
      await sb
        .from("enrichment_jobs")
        .update({ statut: "failed", error: msg, updated_at: nowIso() })
        .eq("id", job.id);
      await ecrireTelemetrie(); // les tokens d'un échec ont été consommés aussi
      details.push({ id: job.id, ok: false, error: msg });

      // Santé API : un échec transitoire ou de crédit alimente le disjoncteur ;
      // l'ouverture du circuit déclenche UNE alerte, au moment de l'ouverture.
      const classe = classifyApiError(brut);
      if (classe !== "autre") {
        circuitVientDOuvrir = await breakerEchec(sb, brut, classe);
        if (circuitVientDOuvrir) {
          const apres = await breakerOuvert(sb);
          await alerteDisjoncteur(sb, { cause: msg, jusqu_a: apres.jusqu_a ?? nowIso() });
        }
      }
      // Échec DÉFINITIF d'un groupe de fiche (après retry) : alerte immédiate.
      if (job.objectif.startsWith(FICHE_JOB_PREFIX)) {
        await alerteEchecGeneration(sb, {
          fiche_slug: ficheSlug,
          cible_nom: cibleNom,
          groupe: job.objectif.slice(FICHE_JOB_PREFIX.length),
          erreur: msg,
        });
      }
    }
    traites += 1;
    // Circuit ouvert pendant ce lot : inutile de consommer la suite de la file.
    if (circuitVientDOuvrir) break;
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
