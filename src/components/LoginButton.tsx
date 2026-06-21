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
        // Restriction de domaine demandée à Google ; revérifiée côté app.
        queryParams: { hd: "collision.studio", prompt: "select_account" },
      },
    });
  }

  return (
    <button onClick={signIn} disabled={loading} className="btn-jaune w-full">
      {loading ? "Connexion…" : "Continuer avec Google"}
    </button>
  );
}
