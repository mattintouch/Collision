// Chantier 1, boucle de validation (§2.5) — interface de la Routine hebdo.
//
// La Routine Claude Code hebdomadaire lit ici les items « a_faire » du backlog
// produit, ouvre les PR correspondantes, puis renseigne pr_url. Elle n'a AUCUN
// autre droit : lecture des items a_faire, écriture du seul champ pr_url.
// Les statuts ne changent que par décision humaine (triage_backlog), le
// passage à « livre » se fait après merge, par Matthieu.
//
// Auth : Bearer CRON_SECRET, OBLIGATOIRE (contrairement au cron récap, cet
// endpoint est appelé depuis l'extérieur de Vercel : pas de repli sans secret).

import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorise(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET non configuré côté Vercel." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  return null;
}

/** Items a_faire sans PR encore ouverte (la matière de la Routine). */
export async function GET(req: Request): Promise<Response> {
  const refus = autorise(req);
  if (refus) return refus;
  try {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("product_backlog")
      .select("id, created_at, auteur, contenu, contexte, commentaire_triage, pr_url")
      .eq("statut", "a_faire")
      .order("created_at")
      .limit(20);
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    const items = (data ?? []) as { pr_url: string | null }[];
    return Response.json({ ok: true, items: items.filter((i) => !i.pr_url), deja_en_pr: items.filter((i) => i.pr_url).length });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** Renseigne pr_url sur un item a_faire (seul champ ouvert à la Routine). */
export async function POST(req: Request): Promise<Response> {
  const refus = autorise(req);
  if (refus) return refus;
  try {
    const body = (await req.json()) as { id?: string; pr_url?: string };
    if (!body.id || !body.pr_url || !/^https:\/\/github\.com\//.test(body.pr_url)) {
      return Response.json({ ok: false, error: "id et pr_url (https://github.com/...) requis." }, { status: 400 });
    }
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("product_backlog")
      .update({ pr_url: body.pr_url })
      .eq("id", body.id)
      .eq("statut", "a_faire")
      .select("id")
      .maybeSingle();
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
    if (!data) return Response.json({ ok: false, error: `Item a_faire introuvable : ${body.id}.` }, { status: 404 });
    return Response.json({ ok: true, id: body.id, pr_url: body.pr_url });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
