import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Toutes les routes sauf assets statiques et fichiers à extension.
    "/((?!_next/static|_next/image|favicon.ico|icons/|logos/|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)",
  ],
};
