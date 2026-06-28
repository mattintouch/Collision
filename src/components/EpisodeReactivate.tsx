"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveCibleStage } from "@/lib/actions";

// Seconde vie : renvoyer un ancien invité dans le pipe des cibles potentielles.
export function EpisodeReactivate({
  cibleId,
  showSlug,
  targetStageId,
}: {
  cibleId: string;
  showSlug: string;
  targetStageId: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function reactivate() {
    if (!confirm("Réactiver cet invité dans le pipe des cibles potentielles ?")) return;
    start(async () => {
      await moveCibleStage({ cible_id: cibleId, stage_id: targetStageId, show_slug: showSlug });
      router.refresh();
    });
  }
  return (
    <button onClick={reactivate} disabled={pending} className="btn-ghost px-2 py-1 text-xs">
      {pending ? "…" : "Réactiver"}
    </button>
  );
}
