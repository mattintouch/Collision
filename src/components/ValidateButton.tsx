"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { validateCible } from "@/lib/actions";

export function ValidateButton({
  cibleId,
  showSlug,
  finalLabel,
}: {
  cibleId: string;
  showSlug: string;
  finalLabel: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  function validate() {
    if (!confirm("Valider cette cible ? Elle devient un épisode en emmenant son contexte.")) return;
    setMsg(null);
    start(async () => {
      const res = await validateCible({ cible_id: cibleId, show_slug: showSlug });
      if (res.ok) {
        setMsg("Validé — épisode créé.");
        router.refresh();
      } else {
        setMsg(res.error ?? "Erreur");
      }
    });
  }

  return (
    <div className="text-right">
      <button onClick={validate} disabled={pending} className="btn-jaune">
        {pending ? "Validation…" : `Valider → ${finalLabel}`}
      </button>
      {msg && <p className="mt-1 text-xs text-blanc-muted">{msg}</p>}
    </div>
  );
}
