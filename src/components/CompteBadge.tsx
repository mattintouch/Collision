"use client";

// A3 : identité du compte connecté, visible sur toutes les vues, avec
// déconnexion. Le libellé vient de l'email de session, jamais d'une constante.

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CompteBadge({ email, mono = false }: { email: string; mono?: boolean }) {
  const router = useRouter();
  const label = (email.split("@")[0] || email).toUpperCase();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  if (mono) {
    // Variante GDIY (fiches) : mono, discret, sur fond clair.
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span title={email}>{label}</span>
        <button
          onClick={signOut}
          style={{ border: "1px solid #000", background: "none", cursor: "pointer", font: "inherit", padding: "2px 8px" }}
        >
          DÉCONNEXION
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2 text-sm text-blanc-muted">
      <span title={email}>{label}</span>
      <button onClick={signOut} className="rounded-lg border border-noir-600 px-2 py-0.5 text-xs hover:text-blanc">
        Déconnexion
      </button>
    </span>
  );
}
