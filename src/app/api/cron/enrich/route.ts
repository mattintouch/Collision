// Cron d'enrichissement (S3). Vercel l'appelle chaque minute (voir vercel.json)
// et ajoute automatiquement `Authorization: Bearer $CRON_SECRET` si CRON_SECRET
// est posé. maxDuration 300 : hors du plafond ~60 s du client MCP.
import { processEnrichmentJobs } from "@/lib/enrichment/jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

async function run(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const r = await processEnrichmentJobs();
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
