import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/config";

// Échange le code OAuth contre une session, puis vérifie le domaine de l'email
// (restriction stefani.fr / collision.studio côté app, §9).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Destination : cookie posé par le login (flux connecteur MCP), sinon query,
  // sinon l'accueil. Le cookie est nécessaire car `redirectTo` envoyé à
  // Supabase reste nu (sans query) pour matcher l'allowlist.
  const cookieStore = cookies();
  const nextCookie = cookieStore.get("mcp_next")?.value;
  const next = nextCookie
    ? decodeURIComponent(nextCookie)
    : searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (!isAllowedEmail(data.user.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=domaine_non_autorise`);
      }
      // N'autorise que des chemins relatifs internes (anti open-redirect).
      const dest = next.startsWith("/") ? next : "/";
      const res = NextResponse.redirect(`${origin}${dest}`);
      if (nextCookie) res.cookies.set("mcp_next", "", { path: "/", maxAge: 0 });
      return res;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
