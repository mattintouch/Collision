"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // Lecture du calendrier pour le copilote (créneaux libres).
        scopes: "https://www.googleapis.com/auth/calendar.readonly",
        // access_type=offline + consent pour obtenir un refresh token.
        // Pas de "hd" : la restriction aux deux domaines (stefani.fr,
        // collision.studio) est vérifiée côté app dans /auth/callback.
        queryParams: {
          prompt: "consent",
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
