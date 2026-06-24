"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { validateCible, moveCibleStage, deleteCible } from "@/lib/actions";
import type { Stage } from "@/lib/types";

export function FicheActions({
  cibleId,
  showSlug,
  stages,
  currentStageId,
  finalLabel,
}: {
  cibleId: string;
  showSlug: string;
  stages: Stage[];
  currentStageId: string | null;
  finalLabel: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  function changeStage(stageId: string) {
    start(async () => {
      const r = await moveCibleStage({ cible_id: cibleId, stage_id: stageId, show_slug: showSlug });
      setMsg(r.ok ? "Statut mis à jour." : r.error ?? "Erreur");
      router.refresh();
    });
  }

  function validate() {
    if (!confirm("Confirmer cette cible ? Elle devient un épisode en emmenant son contexte.")) return;
    start(async () => {
      const r = await validateCible({ cible_id: cibleId, show_slug: showSlug });
      setMsg(r.ok ? "Confirmé — épisode créé." : r.error ?? "Erreur");
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Supprimer définitivement cette cible et tout son dossier ?")) return;
    start(async () => {
      const r = await deleteCible({ cible_id: cibleId, show_slug: showSlug });
      if (r.ok) window.location.href = `/${showSlug}/board`;
      else setMsg(r.error ?? "Erreur");
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <select
          value={currentStageId ?? ""}
          onChange={(e) => changeStage(e.target.value)}
          disabled={pending}
          aria-label="Changer de statut"
          className="rounded-lg border border-orange-500/50 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-300 outline-none focus:border-orange-400"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id} className="bg-noir-900 text-blanc">
              {s.label}
            </option>
          ))}
        </select>

        <button
          onClick={validate}
          disabled={pending}
          className="btn bg-emerald-600 font-medium text-white hover:bg-emerald-500"
        >
          Confirmer → {finalLabel}
        </button>

        <button
          onClick={remove}
          disabled={pending}
          className="btn border border-red-500/50 font-medium text-red-400 hover:bg-red-500/10"
        >
          Supprimer
        </button>
      </div>
      {msg && <p className="text-xs text-blanc-muted">{msg}</p>}
    </div>
  );
}
