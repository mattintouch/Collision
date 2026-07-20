// A2 — clôture de la session d'enregistrement (bouton STOP, après
// confirmation côté client). L'identité vient de la session authentifiée,
// jamais du corps de la requête. La clôture est idempotente : une session
// déjà close n'est pas re-close et l'appel renvoie son état.
//
// Le flux de fin d'épisode (email des notes, lot B1) se branche ici.

import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveFiche } from "@/lib/fiche/store";
import type { RecSession } from "@/lib/fiche/console";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: { slug: string } }): Promise<Response> {
  const { data: auth } = await createAuthClient().auth.getUser();
  if (!auth.user?.email) return new Response("unauthorized", { status: 401 });

  const sb = createServiceClient();
  const fiche = await resolveFiche(sb, params.slug);
  if (!fiche) return Response.json({ ok: false, error: "Fiche introuvable." }, { status: 404 });

  // Session ouverte la plus récente. Si tout est déjà clos (double clic,
  // second opérateur plus rapide) : renvoyer la dernière close, sans erreur.
  const { data: open } = await sb
    .from("fiche_rec_sessions")
    .select("id, started_at, ended_at, started_by, ended_by, email_envoye_at")
    .eq("fiche_id", fiche.id)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open) {
    const { data: last } = await sb
      .from("fiche_rec_sessions")
      .select("id, started_at, ended_at, started_by, ended_by, email_envoye_at")
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
    .select("id, started_at, ended_at, started_by, ended_by, email_envoye_at")
    .maybeSingle();
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  return Response.json({ ok: true, session: (closed as RecSession | null) ?? open });
}
