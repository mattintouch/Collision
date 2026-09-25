import { NextResponse } from "next/server";
import { signToken, verifyToken, pkceChallenge } from "@/lib/mcp/oauth";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/** Rôle applicatif de l'utilisateur (profiles.type) pour dériver les scopes du
 *  jeton. Best-effort : en cas d'échec, on n'ajoute pas de claim (→ fail-open). */
async function roleForSub(sub: string): Promise<string | null> {
  try {
    const sb = createServiceClient();
    const { data } = await sb.from("profiles").select("type").eq("id", sub).maybeSingle();
    return (data as { type?: string } | null)?.type ?? null;
  } catch {
    return null;
  }
}

/** Prérequis 1.3 du brief La Martingale : périmètre de shows d'un membre
 *  RESTREINT. La RLS l'applique déjà côté application ; le connecteur MCP passe
 *  par le service role et a besoin de la liste dans le jeton pour filtrer.
 *
 *  Le périmètre se lit dans user_shows, PAS dans le rôle. Le rôle dit ce qu'un
 *  membre a le droit de faire (lire, écrire), user_shows dit où il a le droit
 *  de le faire : ce sont deux questions distinctes. Lier le périmètre au seul
 *  rôle « externe » aurait condamné un collaborateur d'un autre studio à la
 *  lecture seule, alors que le brief lui demande de travailler sur son show.
 *
 *  Admin : aucun périmètre, il voit tout. Membre ayant accès à TOUS les shows :
 *  aucun périmètre non plus, la clé reste absente et rien ne change pour
 *  l'équipe actuelle. Membre ayant accès à une partie : la liste. Membre sans
 *  aucune ligne : liste VIDE, donc aucun show (et non la base entière).
 *
 *  Best-effort : en cas d'échec de lecture, aucune clé n'est posée et le
 *  connecteur se comporte comme avant (fail-open assumé, cohérent avec les
 *  scopes de rôle). */
async function showsForSub(sub: string, role: string | null): Promise<string[] | null> {
  if (role === "admin") return null;
  try {
    const sb = createServiceClient();
    const { data, error } = await sb.from("user_shows").select("show_id").eq("user_id", sub);
    if (error) return null;
    const ids = ((data ?? []) as { show_id: string }[]).map((r) => r.show_id);
    const { count, error: err2 } = await sb.from("shows").select("id", { count: "exact", head: true });
    if (err2) return null;
    // Accès à tous les shows : pas de périmètre. Figer la liste ici ferait
    // vieillir le jeton au premier show créé.
    if (count !== null && ids.length >= count) return null;
    return ids;
  } catch {
    return null;
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

async function parseBody(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await request.json().catch(() => ({}))) as Record<string, string>;
  }
  const txt = await request.text();
  return Object.fromEntries(new URLSearchParams(txt));
}

export async function POST(request: Request) {
  const b = await parseBody(request);
  if (b.grant_type !== "authorization_code") {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400, headers: cors });
  }
  const claims = (await verifyToken(b.code ?? "")) as Record<string, unknown> | null;
  if (!claims || claims.typ !== "code") {
    return NextResponse.json({ error: "invalid_grant" }, { status: 400, headers: cors });
  }
  if (b.redirect_uri && claims.ru !== b.redirect_uri) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "redirect_uri mismatch" },
      { status: 400, headers: cors }
    );
  }
  const expected = await pkceChallenge(b.code_verifier ?? "");
  if (expected !== claims.cc) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "PKCE verification failed" },
      { status: 400, headers: cors }
    );
  }

  const role = await roleForSub(String(claims.sub));
  const shows = await showsForSub(String(claims.sub), role);
  const access = await signToken(
    { typ: "access", sub: String(claims.sub), email: String(claims.email ?? ""), ...(role ? { role } : {}), ...(shows ? { shows } : {}) },
    60 * 60 * 24 * 30
  );
  return NextResponse.json(
    { access_token: access, token_type: "Bearer", expires_in: 2592000, scope: "magellan" },
    { headers: cors }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}
