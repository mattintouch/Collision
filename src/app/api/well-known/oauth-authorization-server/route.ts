import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Métadonnées du serveur d'autorisation (RFC 8414). Réécrit depuis
// /.well-known/oauth-authorization-server (voir next.config.mjs).
export async function GET(request: Request) {
  const base = new URL(request.url).origin;
  return NextResponse.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/api/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      registration_endpoint: `${base}/api/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["magellan"],
    },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}
