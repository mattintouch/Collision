import { NextResponse } from "next/server";
import { signToken, verifyToken, pkceChallenge } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

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

  const access = await signToken(
    { typ: "access", sub: String(claims.sub), email: String(claims.email ?? "") },
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
