"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setDefaultShow } from "@/lib/actions";
import type { Show } from "@/lib/types";

export function SettingsForm({
  shows,
  currentDefault,
  email,
  role,
}: {
  shows: Show[];
  currentDefault: string | null;
  email: string;
  role: string;
}) {
  const [value, setValue] = useState(currentDefault ?? shows[0]?.slug ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await setDefaultShow({ show_slug: value });
      setMsg(res.ok ? "Enregistré." : res.error ?? "Erreur");
      if (res.ok) router.refresh();
    });
  }

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
          Compte
        </h2>
        <p className="mt-2 text-sm">{email}</p>
        <p className="text-xs text-blanc-muted">Rôle : {role}</p>
      </section>

      <section className="card p-5">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
          Show par défaut
        </h2>
        <p className="mb-3 mt-1 text-xs text-blanc-muted">
          Le show ouvert automatiquement à ta connexion.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="rounded-lg border border-noir-600 bg-noir-900 px-3 py-2 text-sm outline-none focus:border-jaune"
          >
            {shows.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.nom}
              </option>
            ))}
          </select>
          <button onClick={save} disabled={pending} className="btn-jaune">
            {pending ? "…" : "Enregistrer"}
          </button>
          {msg && <span className="text-xs text-blanc-muted">{msg}</span>}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
          Session
        </h2>
        <button onClick={signOut} className="btn-ghost mt-3">
          Se déconnecter
        </button>
      </section>
    </div>
  );
}
