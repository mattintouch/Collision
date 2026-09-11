// Chantier UX 3 du 11/09 : le Mot des commentaires, SEUL champ de la fiche
// saisissable inline (exception ponctuelle actée au hors périmètre du lot).
// L'identité vient de la session authentifiée, jamais du corps de la requête.
// L'écriture passe par writeSection : versionnée (rollback), assainie et
// bornée comme toute écriture de section.

import { createClient as createAuthClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveFiche, writeSection } from "@/lib/fiche/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MOT_MAX = 120;

export async function POST(req: Request, { params }: { params: { slug: string } }): Promise<Response> {
  const { data: auth } = await createAuthClient().auth.getUser();
  if (!auth.user?.email) return new Response("unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { mot?: unknown };
  if (typeof body.mot !== "string") {
    return Response.json({ ok: false, error: "mot manquant (chaîne attendue, vide pour effacer)." }, { status: 400 });
  }
  const mot = body.mot.trim();
  if (mot.length > MOT_MAX) {
    // Refus explicite, jamais de coupe silencieuse (règle du 07/09).
    return Response.json({ ok: false, error: `Le Mot dépasse ${MOT_MAX} caractères (${mot.length}) : raccourcir.` }, { status: 400 });
  }

  const sb = createServiceClient();
  const fiche = await resolveFiche(sb, params.slug);
  if (!fiche) return Response.json({ ok: false, error: "Fiche introuvable." }, { status: 404 });
  if (fiche.statut === "verrouillee") {
    return Response.json({ ok: false, error: "Fiche verrouillée : édition impossible." }, { status: 423 });
  }

  // Fusion : seuls mot bouge, le reste du contenu closing est préservé.
  const { data: cur } = await sb
    .from("fiche_sections")
    .select("content")
    .eq("fiche_id", fiche.id)
    .eq("section_id", "closing")
    .maybeSingle();
  const contenu = (((cur as { content?: Record<string, unknown> } | null)?.content) ?? {}) as Record<string, unknown>;
  const r = await writeSection(sb, fiche.id, "closing", { ...contenu, mot }, auth.user.email);
  if (!r) return Response.json({ ok: false, error: "Section closing inconnue." }, { status: 500 });
  return Response.json({ ok: true, mot, version: r.version });
}
