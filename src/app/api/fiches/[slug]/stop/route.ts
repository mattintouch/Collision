// A2 — clôture de la session d'enregistrement (bouton STOP, après
// confirmation côté client). L'identité vient de la session authentifiée,
// jamais du corps de la requête. La clôture est idempotente : une session
// déjà close n'est pas re-close et l'appel renvoie son état.
//
// Le flux de fin d'épisode (email des notes, lot B1) se branche ici.

import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveFiche } from "@/lib/fiche/store";
import { envoyerNotesEpisode } from "@/lib/fiche/finEpisode";
import type { RecSession } from "@/lib/fiche/console";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHAMPS = "id, started_at, ended_at, started_by, ended_by, email_envoye_at";

export async function POST(req: Request, { params }: { params: { slug: string } }): Promise<Response> {
  const { data: auth } = await createAuthClient().auth.getUser();
  if (!auth.user?.email) return new Response("unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { resend?: boolean };

  const sb = createServiceClient();
  const fiche = await resolveFiche(sb, params.slug);
  if (!fiche) return Response.json({ ok: false, error: "Fiche introuvable." }, { status: 404 });

  // Renvoi EXPLICITE des notes de la dernière session close (B1) : seule
  // action qui ré-envoie ; un double Stop, lui, ne produit aucun doublon.
  if (body.resend) {
    const { data: last } = await sb
      .from("fiche_rec_sessions")
      .select(CHAMPS)
      .eq("fiche_id", fiche.id)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) return Response.json({ ok: false, error: "Aucune session close à renvoyer." }, { status: 404 });
    const envoi = await envoyerNotesEpisode(sb, fiche, last as RecSession, { resend: true });
    const { data: maj } = await sb.from("fiche_rec_sessions").select(CHAMPS).eq("id", (last as RecSession).id).maybeSingle();
    return Response.json({ ok: true, session: (maj as RecSession | null) ?? last, email: envoi.statut, email_detail: envoi.detail });
  }

  // Session ouverte la plus récente. Si tout est déjà clos (double clic,
  // second opérateur plus rapide) : renvoyer la dernière close, SANS renvoyer
  // l'email (idempotence B1).
  const { data: open } = await sb
    .from("fiche_rec_sessions")
    .select(CHAMPS)
    .eq("fiche_id", fiche.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open) {
    const { data: last } = await sb
      .from("fiche_rec_sessions")
      .select(CHAMPS)
      .eq("fiche_id", fiche.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return Response.json({ ok: true, deja_close: true, session: (last as RecSession | null) ?? null });
  }

  const { data: closed, error } = await sb
    .from("fiche_rec_sessions")
    .update({ ended_at: new Date().toISOString(), ended_by: auth.user.email })
    .eq("id", (open as RecSession).id)
    .is("ended_at", null)
    .select(CHAMPS)
    .maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const session = (closed as RecSession | null) ?? (open as RecSession);

  // Flux de fin (B1) : l'échec d'envoi ne remet JAMAIS le Stop en cause, le
  // carnet reste consultable sur la fiche et l'UI propose « renvoyer ».
  const envoi = await envoyerNotesEpisode(sb, fiche, { ...session, ended_at: session.ended_at ?? new Date().toISOString() });
  const { data: maj } = await sb.from("fiche_rec_sessions").select(CHAMPS).eq("id", session.id).maybeSingle();
  return Response.json({ ok: true, session: (maj as RecSession | null) ?? session, email: envoi.statut, email_detail: envoi.detail });
}
