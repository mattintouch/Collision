"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { CibleEnrichie, Show, Stage } from "@/lib/types";
import { ARCHETYPE_LABELS, ARCHETYPE_ORDER, computeResurgence } from "@/lib/domain";
import { moveCibleStage, setCibleArchetype } from "@/lib/actions";
import { TargetCard } from "./TargetCard";

function sortResurgence(a: CibleEnrichie, b: CibleEnrichie) {
  if (a.voie !== b.voie) return a.voie === "froid" ? -1 : 1;
  return computeResurgence(b).score - computeResurgence(a).score;
}

interface Column {
  key: string;
  title: string;
  hint?: string;
  match: (c: CibleEnrichie) => boolean;
  // valeur cible au drop
  archetype?: string | null;
  stageId?: string;
}

export function BoardDnd({
  show,
  stages,
  cibles,
}: {
  show: Show;
  stages: Stage[];
  cibles: CibleEnrichie[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const isInvites = show.type_pipe === "invites";

  const columns: Column[] = isInvites
    ? [
        ...ARCHETYPE_ORDER.map((a) => ({
          key: a,
          title: ARCHETYPE_LABELS[a],
          match: (c: CibleEnrichie) => c.archetype === a,
          archetype: a as string,
        })),
        {
          key: "none",
          title: "À classer",
          hint: "archétype manquant",
          match: (c: CibleEnrichie) => !c.archetype,
          archetype: null,
        },
      ]
    : stages.map((st) => ({
        key: st.id,
        title: st.label,
        match: (c: CibleEnrichie) => c.stage_id === st.id,
        stageId: st.id,
      }));

  function onDrop(col: Column, cibleId: string) {
    setOverCol(null);
    setDragId(null);
    if (!cibleId) return;
    const cible = cibles.find((c) => c.id === cibleId);
    if (!cible) return;
    // Pas de changement si déjà dans la colonne.
    if (col.match(cible)) return;

    start(async () => {
      if (isInvites) {
        await setCibleArchetype({
          cible_id: cibleId,
          archetype: col.archetype ?? null,
          show_slug: show.slug,
        });
      } else if (col.stageId) {
        await moveCibleStage({
          cible_id: cibleId,
          stage_id: col.stageId,
          show_slug: show.slug,
        });
      }
      router.refresh();
    });
  }

  return (
    <div className={clsx("flex gap-5 overflow-x-auto pb-4", pending && "opacity-70")}>
      {columns.map((col) => {
        const list = cibles.filter(col.match).sort(sortResurgence);
        return (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.key);
            }}
            onDragLeave={() => setOverCol((k) => (k === col.key ? null : k))}
            onDrop={(e) => onDrop(col, e.dataTransfer.getData("text/cible"))}
            className={clsx(
              "flex w-80 shrink-0 flex-col gap-3 rounded-card p-1 transition-colors",
              overCol === col.key && "bg-jaune/5 ring-1 ring-jaune/40"
            )}
          >
            <div className="flex items-baseline justify-between px-1">
              <div>
                <h2 className="font-display text-sm font-semibold uppercase tracking-wide">
                  {col.title}
                </h2>
                {col.hint && <p className="text-xs text-blanc-muted">{col.hint}</p>}
              </div>
              <span className="text-xs text-blanc-muted">{list.length}</span>
            </div>

            <div className="flex flex-col gap-3">
              {list.length === 0 ? (
                <p className="rounded-card border border-dashed border-noir-600 p-4 text-center text-xs text-blanc-muted">
                  Déposer ici
                </p>
              ) : (
                list.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/cible", c.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(c.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    className={clsx("cursor-grab active:cursor-grabbing", dragId === c.id && "opacity-40")}
                  >
                    <TargetCard cible={c} show={show} />
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
