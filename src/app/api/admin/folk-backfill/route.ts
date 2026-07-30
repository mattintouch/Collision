// Backfill Folk (GO Matthieu du 30/07) : pousse le STOCK existant de cibles
// vers Folk via la synchro continue (syncCibleToFolk), qui ne se déclenche
// sinon que sur le chemin d'écriture. Mêmes règles non négociables : non vide
// écrase, vide ne touche jamais, coordonnées unionnées, jamais de doublon
// (nom ambigu = signalé, ni match ni création).
//
// Deux modes, dry par défaut :
//   GET /api/admin/folk-backfill                → rapport sans AUCUNE écriture
//   GET /api/admin/folk-backfill?mode=go        → exécute
//   Pagination : ?limit=100&offset=0 (limite max 250), la réponse donne
//   l'offset suivant tant qu'il reste des cibles.
//
// Autorisation : membre de l'équipe connecté (navigateur) ou Bearer
// CRON_SECRET. Les noms factices (placeholders) sont ignorés : ils ne
// partent jamais vers Folk.

import { createServiceClient } from "@/lib/supabase/service";
import { syncCibleToFolk } from "@/lib/folk/sync";
import { hasFolkKey } from "@/lib/folk/client";
import { isPlaceholder } from "@/lib/domain";
import { cronAutorise } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Ligne {
  nom: string;
  action: "creation" | "maj" | "a_jour" | "ambigu" | "ignore" | "erreur";
  champs?: string[];
  detail: string;
}

export async function GET(req: Request): Promise<Response> {
  if (!(await cronAutorise(req))) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!hasFolkKey()) {
    return Response.json({ ok: false, error: "Pas de clé Folk configurée." }, { status: 500 });
  }
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "go" ? "go" : "dry";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 250);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  const sb = createServiceClient();
  // limit + 1 : le rang de trop dit s'il reste une page après celle-ci.
  const { data, error } = await sb
    .from("cibles")
    .select("id, nom, role, organisation")
    .eq("kind", "personne")
    .eq("archive", false)
    .order("nom", { ascending: true })
    .range(offset, offset + limit);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (data ?? []) as { id: string; nom: string; role: string | null; organisation: string | null }[];
  const page = rows.slice(0, limit);
  const resteApres = rows.length > limit;

  const details: Ligne[] = [];
  // Séquentiel volontairement : l'API Folk n'est pas martelée.
  for (const c of page) {
    if (isPlaceholder(c.nom, c.role, c.organisation)) {
      details.push({ nom: c.nom, action: "ignore", detail: "nom factice : jamais poussé vers Folk" });
      continue;
    }
    const r = await syncCibleToFolk(sb, c.id, { dry: mode === "dry" });
    const action: Ligne["action"] = !r.ok
      ? r.detail.includes("ambigu") ? "ambigu" : "erreur"
      : r.detail.includes("à jour") ? "a_jour"
      : r.detail.toLowerCase().includes("création") || r.detail.includes("créée") ? "creation"
      : "maj";
    details.push({ nom: c.nom, action, champs: r.champs, detail: r.detail });
  }

  const compte: Record<string, number> = {};
  for (const d of details) compte[d.action] = (compte[d.action] ?? 0) + 1;

  return Response.json({
    ok: true,
    mode,
    traitees: page.length,
    offset,
    offset_suivant: resteApres ? offset + limit : null,
    compte,
    details,
  });
}
