// Chantier 1 — cron du récap hebdomadaire (vercel.json : lundi 06h00 UTC,
// 08h00 Paris en été). Compile mcp_audit + enrichment_jobs + product_backlog,
// propose un triage par item nouveau, envoie UN email via l'identité Vadim.
// Garde-fou : ce cron écrit dans le backlog (rien d'autre), jamais dans le code.

import { createServiceClient } from "@/lib/supabase/service";
import { compileRecap, proposeTriage, buildRecapEmail, recapRecipients } from "@/lib/recap/hebdo";
import { sendGmail, hasGmailSend } from "@/lib/gmail";
import { cronAutorise } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

async function run(req: Request): Promise<Response> {
  // Scheduler (Bearer CRON_SECRET) ou membre de l'équipe connecté (test navigateur).
  if (!(await cronAutorise(req))) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const sb = createServiceClient();
    const data = await compileRecap(sb);
    const triages = await proposeTriage(data.backlog);
    // Les propositions de triage sont posées en commentaire (statut inchangé :
    // la décision reste humaine, boucle de validation du brief §2.5).
    for (const t of triages) {
      await sb
        .from("product_backlog")
        .update({ commentaire_triage: `Proposition : ${t.triage}. ${t.justification}` })
        .eq("id", t.id)
        .eq("statut", "nouveau");
    }
    const { subject, html } = buildRecapEmail(data, triages);
    const to = await recapRecipients(sb);
    if (!to.length) return Response.json({ ok: false, error: "Aucun destinataire (RECAP_EMAILS ou staff des shows)." }, { status: 500 });
    if (!hasGmailSend()) return Response.json({ ok: false, error: "Envoi Gmail indisponible (délégation)." }, { status: 500 });
    const r = await sendGmail({ to, subject, html });
    return Response.json({ ok: r.ok, envoye_a: to, items_backlog: data.backlog.length, detail: r.detail });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
