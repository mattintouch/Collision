import { NextResponse } from "next/server";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

// Dynamic Client Registration (RFC 7591). Client public (PKCE) — non persisté.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    redirect_uris?: string[];
    client_name?: string;
  };
  return NextResponse.json(
    {
      client_id: "magellan-mcp",
      client_name: body.client_name ?? "Magellan",
      redirect_uris: body.redirect_uris ?? [],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
    { status: 201, headers: cors }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}
