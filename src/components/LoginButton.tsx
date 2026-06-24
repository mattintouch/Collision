"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    // Conserve une éventuelle destination (ex: flux OAuth du connecteur MCP).
    const next = new URLSearchParams(window.location.search).get("next");
    const callback = next
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : `${window.location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback,
        // Calendrier : lecture (créneaux libres) + écriture (créer les
        // invitations d'enregistrement à la validation d'un invité).
        scopes:
          "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
        // Pas de prompt=consent : on ne re-demande pas l'autorisation à chaque
        // connexion. access_type=offline permet d'obtenir un refresh token au
        // premier consentement. Restriction de domaine vérifiée côté app.
        queryParams: {
          access_type: "offline",
        },
      },
    });
  }

  return (
    <button onClick={signIn} disabled={loading} className="btn-jaune w-full">
      {loading ? "Connexion…" : "Continuer avec Google"}
    </button>
  );
}
