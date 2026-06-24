import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/config";
import { signToken, isAllowedRedirect } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

// Endpoint d'autorisation OAuth (code + PKCE). Authentifie via la session
// Supabase (login Google) ; émet un code court signé.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const p = url.searchParams;
  const redirect_uri = p.get("redirect_uri") ?? "";
  const state = p.get("state");
  const code_challenge = p.get("code_challenge");
  const method = p.get("code_challenge_method");

  if (!redirect_uri || !code_challenge || method !== "S256") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!isAllowedRedirect(redirect_uri)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "redirect_uri non autorisée" },
      { status: 400 }
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pas de session : on renvoie vers le login, qui reviendra ici.
  if (!user) {
    const back = url.pathname + url.search;
    return NextResponse.redirect(`${url.origin}/login?next=${encodeURIComponent(back)}`);
  }
  if (!isAllowedEmail(user.email)) {
    return NextResponse.json({ error: "access_denied" }, { status: 403 });
  }

  const code = await signToken(
    { typ: "code", sub: user.id, email: user.email, cc: code_challenge, ru: redirect_uri },
    600
  );
  const dest = new URL(redirect_uri);
  dest.searchParams.set("code", code);
  if (state) dest.searchParams.set("state", state);
  return NextResponse.redirect(dest.toString());
}
