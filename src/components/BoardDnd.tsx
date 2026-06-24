"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { CibleEnrichie, Show, Stage } from "@/lib/types";
import { ARCHETYPE_LABELS, ARCHETYPE_ORDER, computeResurgence } from "@/lib/domain";
import {
  moveCibleStage,
  setCibleArchetype,
  setArchetypeOrder,
  deleteCible,
} from "@/lib/actions";
import { TargetCard } from "./TargetCard";
import { ConfirmEpisodeModal } from "./ConfirmEpisodeModal";

const ALL_ARCH = ["big_fish", "quick_win", "pepite", "none"];
function archLabel(key: string) {
  return key === "none" ? "À classer" : ARCHETYPE_LABELS[key as keyof typeof ARCHETYPE_LABELS];
}

function sortResurgence(a: CibleEnrichie, b: CibleEnrichie) {
  if (a.voie !== b.voie) return a.voie === "froid" ? -1 : 1;
  return computeResurgence(b).score - computeResurgence(a).score;
}

interface Column {
  key: string;
  title: string;
  hint?: string;
  match: (c: CibleEnrichie) => boolean;
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
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; nom: string } | null>(null);

  const isInvites = show.type_pipe === "invites";

  // Ordre des colonnes d'archétype (invités), personnalisable.
  const stored = show.archetype_order ?? [];
  const archOrder = [
    ...stored.filter((k) => ALL_ARCH.includes(k)),
    ...ALL_ARCH.filter((k) => !stored.includes(k)),
  ];

  const columns: Column[] = isInvites
    ? archOrder.map((key) => ({
        key,
        title: archLabel(key),
        hint: key === "none" ? "archétype manquant" : undefined,
        match: (c: CibleEnrichie) => (key === "none" ? !c.archetype : c.archetype === key),
        archetype: key === "none" ? null : key,
      }))
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
    if (!cible || col.match(cible)) return;
    start(async () => {
      if (isInvites) {
        await setCibleArchetype({ cible_id: cibleId, archetype: col.archetype ?? null, show_slug: show.slug });
      } else if (col.stageId) {
        await moveCibleStage({ cible_id: cibleId, stage_id: col.stageId, show_slug: show.slug });
      }
      router.refresh();
    });
  }

  function moveColumn(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= archOrder.length) return;
    const arr = [...archOrder];
    [arr[index], arr[next]] = [arr[next], arr[index]];
    start(async () => {
      await setArchetypeOrder({ show_slug: show.slug, order: arr });
      router.refresh();
    });
  }

  function removeCible(id: string) {
    if (!confirm("Supprimer définitivement cette cible et son dossier ?")) return;
    start(async () => {
      await deleteCible({ cible_id: id, show_slug: show.slug });
      router.refresh();
    });
  }

  return (
    <>
      <div className={clsx("flex gap-5 overflow-x-auto pb-4", pending && "opacity-70")}>
        {columns.map((col, i) => {
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
                <div className="flex items-center gap-1.5">
                  {isInvites && (
                    <button
                      onClick={() => moveColumn(i, -1)}
                      disabled={i === 0 || pending}
                      className="text-blanc-muted hover:text-blanc disabled:opacity-30"
                      aria-label="Déplacer la colonne à gauche"
                    >
                      ◀
                    </button>
                  )}
                  <div>
                    <h2 className="font-display text-sm font-semibold uppercase tracking-wide">
                      {col.title}
                    </h2>
                    {col.hint && <p className="text-xs text-blanc-muted">{col.hint}</p>}
                  </div>
                  {isInvites && (
                    <button
                      onClick={() => moveColumn(i, 1)}
                      disabled={i === columns.length - 1 || pending}
                      className="text-blanc-muted hover:text-blanc disabled:opacity-30"
                      aria-label="Déplacer la colonne à droite"
                    >
                      ▶
                    </button>
                  )}
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
                      className={clsx("relative cursor-grab active:cursor-grabbing", dragId === c.id && "opacity-40")}
                    >
                      <TargetCard cible={c} show={show} />
                      <CardMenu
                        onConfirm={() => setConfirmTarget({ id: c.id, nom: c.nom })}
                        onDelete={() => removeCible(c.id)}
                      />
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {confirmTarget && (
        <ConfirmEpisodeModal
          open
          onClose={() => setConfirmTarget(null)}
          cibleId={confirmTarget.id}
          showSlug={show.slug}
          cibleNom={confirmTarget.nom}
        />
      )}
    </>
  );
}

function CardMenu({ onConfirm, onDelete }: { onConfirm: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute right-2 top-2 z-10">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-md border border-noir-600 bg-noir-900/80 px-1.5 text-blanc-muted hover:text-blanc"
        aria-label="Actions"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.preventDefault(); setOpen(false); }} />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-noir-600 bg-noir-800 text-sm shadow-xl">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onConfirm(); }}
              className="block w-full px-3 py-2 text-left text-emerald-400 hover:bg-noir-700"
            >
              Confirmer l&apos;épisode
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onDelete(); }}
              className="block w-full px-3 py-2 text-left text-red-400 hover:bg-noir-700"
            >
              Supprimer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
