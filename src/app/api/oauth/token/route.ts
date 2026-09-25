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
 *  RESTREINT. Un externe ne travaille que sur les shows que user_shows lui
 *  donne ; la RLS l'applique déjà côté application, le connecteur MCP passe
 *  par le service role et a besoin de la liste dans le jeton pour filtrer.
 *
 *  Admin et interne : aucun périmètre (null), rien ne change pour eux.
 *  Externe sans aucune ligne user_shows : périmètre VIDE, donc aucun show.
 *  Best-effort : en cas d'échec de lecture, aucune clé n'est posée, et le
 *  connecteur se comporte comme avant (fail-open assumé, cohérent avec les
 *  scopes de rôle). */
async function showsForSub(sub: string, role: string | null): Promise<string[] | null> {
  if (role !== "externe") return null;
  try {
    const sb = createServiceClient();
    const { data } = await sb.from("user_shows").select("show_id").eq("user_id", sub);
    return ((data ?? []) as { show_id: string }[]).map((r) => r.show_id);
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
