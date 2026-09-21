// Chantier « lancement dev en un clic » (21/09), livrable D : le cron de
// rebouclage (vercel.json : tous les jours à 05h00 UTC, avant le récap du
// lundi 06h00). Relit les PR du dépôt, retrouve le marqueur Backlog-Item et
// écrit pr_url sur l'item correspondant.
//
// Aucun webhook GitHub n'est requis : ce cron lit l'API du dépôt. Pour
// débrancher le rebouclage, il suffit de retirer cette entrée de vercel.json ;
// le récap hebdo appelle la même fonction, et s'en passe sans erreur.
//
// Garde-fou : ce cron écrit UN SEUL champ, pr_url, et seulement sur un item
// qui n'en avait pas. Aucun statut ne bouge : le passage en « livre » reste
// une décision humaine, après merge.

import { createServiceClient } from "@/lib/supabase/service";
import { reboucleBacklog } from "@/lib/backlog/reboucle";
import { cronAutorise } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run(req: Request): Promise<Response> {
  if (!(await cronAutorise(req))) return new Response("unauthorized", { status: 401 });
  try {
    const rapport = await reboucleBacklog(createServiceClient());
    return Response.json({ ok: !rapport.erreur, ...rapport });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
