import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Métadonnées de la ressource protégée (RFC 9728). Réécrit depuis
// /.well-known/oauth-protected-resource(/...) (voir next.config.mjs).
export async function GET(request: Request) {
  const base = new URL(request.url).origin;
  return NextResponse.json(
    {
      resource: `${base}/api/mcp`,
      authorization_servers: [base],
      scopes_supported: ["magellan"],
    },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
}
