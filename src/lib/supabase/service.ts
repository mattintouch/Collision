import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "../config";

/**
 * Client Supabase à privilèges serveur (service role) — contourne la RLS.
 * Réservé aux appels serveur de confiance (serveur MCP authentifié).
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false } });
}

export function hasServiceKey(): boolean {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  return k.length > 0 && !k.includes("your-service-role");
}
