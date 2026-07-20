import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "../config";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Routes accessibles SANS session Supabase. Deux familles :
 * 1. Le parcours de connexion et les assets.
 * 2. Les routes MACHINE, qui portent leur propre authentification dans le
 *    handler et ne doivent JAMAIS être redirigées vers /login :
 *    - /api/cron : appelées par le scheduler Vercel (Bearer CRON_SECRET).
 *      Régression du 20/07 : le récap du lundi et l'enrichissement quotidien
 *      recevaient une 307 vers /login au lieu de s'exécuter.
 *    - /api/backlog : Routine hebdomadaire (Bearer CRON_SECRET, refus 503/401).
 *    - /api/loop : endpoint MCP restreint de Vadim (jeton propre).
 *    - /api/mcp : endpoint MCP principal (OAuth propre).
 */
export function isPublicPath(path: string): boolean {
  return (
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/_next") ||
    path.startsWith("/.well-known") ||
    path.startsWith("/api/well-known") ||
    path.startsWith("/api/oauth") ||
    path.startsWith("/api/mcp") ||
    path.startsWith("/api/cron") ||
    path.startsWith("/api/backlog") ||
    path.startsWith("/api/loop") ||
    path === "/manifest.webmanifest"
  );
}

/** Rafraîchit la session Supabase et protège les routes de l'app. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Mode démo : pas de Supabase branché, on laisse passer.
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
