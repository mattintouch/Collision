// La Martingale, brief 2.4 : le cron quotidien des automatisations
// (vercel.json, 06h30 UTC, après le rebouclage du backlog).
//
// Relance et abandon, passage en publié, fin de promo, alerte J-7 tournage.
// Aucun email ne part : le show est en mode validation, tout est déposé en
// brouillon (brief 2.5).
//
// Simulation : ajouter ?simulation=1 renvoie exactement les mêmes décisions
// sans écrire une seule ligne (cadre du brief, point 0.4). À utiliser avant
// la première passe réelle.

import { createServiceClient } from "@/lib/supabase/service";
import { passeMartingale } from "@/lib/martingale/execution";
import { cronAutorise } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

async function run(req: Request): Promise<Response> {
  if (!(await cronAutorise(req))) return new Response("unauthorized", { status: 401 });
  const simulation = new URL(req.url).searchParams.get("simulation") === "1";
  try {
    const rapport = await passeMartingale(createServiceClient(), { simulation });
    return Response.json({ ok: !rapport.indisponible, ...rapport });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
