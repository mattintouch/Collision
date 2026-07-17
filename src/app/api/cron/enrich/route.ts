// Cron d'enrichissement (S3) — FILET DE SÉCURITÉ.
// Le drainage principal se fait via `kickQueue()` (waitUntil) au fil des appels
// MCP et des lectures, ce qui marche sur le plan Hobby (pas de cron par minute).
// Ce cron passe une fois par jour (schedule dans vercel.json) pour rattraper les
// jobs restés en attente. Vercel ajoute `Authorization: Bearer $CRON_SECRET` si
// CRON_SECRET est posé. maxDuration 300 : plafond Hobby avec Fluid compute.
import { processEnrichmentJobs } from "@/lib/enrichment/jobs";
import { refreshFolkMirror } from "@/lib/folk/mirror";

export const runtime = "nodejs";
export const maxDuration = 300;

async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    // Rafraîchit le miroir Folk (S4), best-effort, avant les jobs.
    const mirror = await refreshFolkMirror();
    // Budget mural ~280 s pour rester sous maxDuration 300 (miroir déjà consommé un peu).
    const r = await processEnrichmentJobs({ max: 20, budgetMs: 280_000 });
    return Response.json({ ok: true, folk_mirror: mirror, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
