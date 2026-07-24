// Cron d'enrichissement — DRAINAGE PRINCIPAL depuis le plan Pro (tâche 1,
// handoff 24/07) : toutes les 5 minutes, la file avance sans dépendre des
// lectures. kickQueue() reste en complément au fil des appels (latence nulle
// après une écriture MCP). Verrou à bail anti chevauchement : Vercel ne gère
// pas les exécutions qui se croisent, une exécution en cours fait passer la
// suivante. Le miroir Folk, lui, reste rafraîchi UNE fois par jour (fenêtre
// 06h00 UTC), pas toutes les 5 minutes.
// Vercel ajoute `Authorization: Bearer $CRON_SECRET` si CRON_SECRET est posé.
import { processEnrichmentJobs } from "@/lib/enrichment/jobs";
import { prendreVerrou, rendreVerrou } from "@/lib/enrichment/verrou";
import { createServiceClient } from "@/lib/supabase/service";
import { refreshFolkMirror } from "@/lib/folk/mirror";
import { cronAutorise } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

// Budget mural sous maxDuration ; sert aussi de TTL du verrou (un crash libère seul).
const BUDGET_MS = 280_000;

async function run(req: Request): Promise<Response> {
  // Scheduler (Bearer CRON_SECRET) ou membre de l'équipe connecté (test navigateur).
  if (!(await cronAutorise(req))) {
    return new Response("unauthorized", { status: 401 });
  }
  const sb = createServiceClient();
  if (!(await prendreVerrou(sb, BUDGET_MS))) {
    return Response.json({ ok: true, verrou: "drainage déjà en cours, exécution passée" });
  }
  try {
    // Miroir Folk (S4) : une fois par jour, dans la fenêtre 06h00-06h05 UTC
    // (l'ancien horaire quotidien), best-effort.
    const d = new Date();
    const mirror = d.getUTCHours() === 6 && d.getUTCMinutes() < 5 ? await refreshFolkMirror() : "hors fenêtre quotidienne";
    const r = await processEnrichmentJobs({ max: 20, budgetMs: BUDGET_MS });
    return Response.json({ ok: true, folk_mirror: mirror, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    await rendreVerrou(sb);
  }
}

export const GET = run;
export const POST = run;
