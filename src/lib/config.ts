// Détection du branchement Supabase. Tant que les secrets ne sont pas posés,
// l'app tourne en mode démo (données locales calées sur le seed).

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return (
    SUPABASE_URL.startsWith("http") &&
    !SUPABASE_URL.includes("YOUR-PROJECT") &&
    SUPABASE_ANON_KEY.length > 0 &&
    !SUPABASE_ANON_KEY.includes("your-anon-key")
  );
}

export const ALLOWED_DOMAINS = (
  process.env.GOOGLE_OAUTH_ALLOWED_DOMAINS ?? "stefani.fr,collision.studio"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && ALLOWED_DOMAINS.includes(domain);
}
