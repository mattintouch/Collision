import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/config";

// Échange le code OAuth contre une session, puis vérifie le domaine de l'email
// (restriction stefani.fr / collision.studio côté app, §9).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      if (!isAllowedEmail(data.user.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=domaine_non_autorise`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
