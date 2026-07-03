// S10 — route publique de la fiche de prep, protégée par un lien signé.
// GET /fiche/[episode]?t=<jeton>. Le jeton (typ=fiche, eid) est vérifié ; le HTML
// stocké sur l'épisode est renvoyé tel quel. Aucune session requise : le lien
// signé EST l'autorisation (il part dans le mail de prep et l'événement Calendar).

import { createServiceClient } from "@/lib/supabase/service";
import { verifyFicheToken } from "@/lib/fiche/token";

export const runtime = "nodejs";

function page(status: number, title: string, body: string): Response {
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#E7E9E3;color:#1B1D1E;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}div{max-width:420px;text-align:center}</style></head><body><div><h1>${title}</h1><p>${body}</p></div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: Request, { params }: { params: { episode: string } }) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  if (!token || !(await verifyFicheToken(token, params.episode))) {
    return page(403, "Lien invalide", "Ce lien de fiche est invalide ou a expiré. Demande un nouveau lien.");
  }
  const sb = createServiceClient();
  const { data } = await sb.from("episodes").select("fiche_html").eq("id", params.episode).maybeSingle();
  const html = (data as { fiche_html?: string | null } | null)?.fiche_html;
  if (!html) {
    return page(404, "Fiche non générée", "La fiche de cet épisode n'a pas encore été générée.");
  }
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
