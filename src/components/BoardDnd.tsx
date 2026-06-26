"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { CibleEnrichie, Show, Stage } from "@/lib/types";
import { ARCHETYPE_LABELS, ARCHETYPE_ORDER, VOIE_LABELS, computeResurgence } from "@/lib/domain";
import {
  moveCibleStage,
  setCibleArchetype,
  setArchetypeOrder,
  deleteCible,
  bulkSetArchive,
  bulkDeleteCibles,
  bulkAddWatchlist,
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
  watchlists = [],
}: {
  show: Show;
  stages: Stage[];
  cibles: CibleEnrichie[];
  watchlists?: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; nom: string } | null>(null);

  // Filtres (axe « qui ») par-dessus les colonnes (axe « avancement »).
  const [wlFilter, setWlFilter] = useState<Set<string>>(new Set());
  const [voie, setVoie] = useState<"all" | "froid" | "chaud">("all");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // Multi-sélection + actions de masse.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tagKey, setTagKey] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const isInvites = show.type_pipe === "invites";

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

  const availableWatchlists = useMemo(() => {
    const set = new Set<string>();
    for (const c of cibles) for (const k of c.watchlist_keys ?? []) set.add(k);
    return Array.from(set).sort();
  }, [cibles]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cibles.filter((c) => {
      if (!showArchived && c.archive) return false;
      if (voie !== "all" && c.voie !== voie) return false;
      if (wlFilter.size > 0 && !(c.watchlist_keys ?? []).some((k) => wlFilter.has(k))) return false;
      if (q && !c.nom.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cibles, showArchived, voie, wlFilter, query]);

  function toggleWl(key: string) {
    setWlFilter((p) => {
      const n = new Set(p);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function toggleSel(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const selIds = Array.from(selected);
  function runBulk(fn: () => Promise<{ ok: boolean; error?: string; detail?: string }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? r.detail ?? "Fait." : r.error ?? "Erreur");
      if (r.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

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
      {/* Barre de filtres */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un nom…"
          className="w-44 rounded-lg border border-noir-600 bg-noir-900 px-3 py-1.5 text-sm outline-none placeholder:text-blanc-muted/60 focus:border-jaune"
        />
        <span className="ml-1 text-xs text-blanc-muted">Voie</span>
        {(["all", "froid", "chaud"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setVoie(v)}
            className={clsx("chip border-transparent", voie === v ? "bg-jaune text-noir-900" : "bg-noir-700 text-blanc-muted hover:text-blanc")}
          >
            {v === "all" ? "Toutes" : VOIE_LABELS[v]}
          </button>
        ))}
        {availableWatchlists.map((k) => (
          <button
            key={k}
            onClick={() => toggleWl(k)}
            className={clsx("chip", wlFilter.has(k) ? "border-transparent bg-jaune text-noir-900" : "border-jaune/40 text-jaune hover:bg-jaune/10")}
          >
            {k.toUpperCase()}
          </button>
        ))}
        <button
          onClick={() => setShowArchived((s) => !s)}
          className={clsx("chip", showArchived ? "border-transparent bg-noir-600 text-blanc" : "border-noir-600 text-blanc-muted hover:text-blanc")}
        >
          {showArchived ? "Masquer archivés" : "Afficher archivés"}
        </button>
      </div>

      {/* Barre d'actions groupées */}
      {selected.size > 0 && (
        <div className="sticky top-16 z-30 mb-4 flex flex-wrap items-center gap-2 rounded-card border border-jaune/40 bg-noir-800 px-3 py-2">
          <span className="text-sm font-medium">{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</span>
          <button onClick={() => runBulk(() => bulkSetArchive({ ids: selIds, archive: true, show_slug: show.slug }))} disabled={pending} className="btn-ghost px-2 py-1 text-sm">
            Archiver
          </button>
          <button onClick={() => runBulk(() => bulkSetArchive({ ids: selIds, archive: false, show_slug: show.slug }))} disabled={pending} className="btn-ghost px-2 py-1 text-sm">
            Désarchiver
          </button>
          <button
            onClick={() => {
              if (confirm(`Supprimer définitivement ${selected.size} fiche(s) ?`)) runBulk(() => bulkDeleteCibles({ ids: selIds, show_slug: show.slug }));
            }}
            disabled={pending}
            className="btn border border-red-500/50 px-2 py-1 text-sm text-red-400 hover:bg-red-500/10"
          >
            Supprimer
          </button>
          {watchlists.length > 0 && (
            <span className="flex items-center gap-1">
              <select
                value={tagKey}
                onChange={(e) => setTagKey(e.target.value)}
                className="rounded-lg border border-noir-600 bg-noir-900 px-2 py-1 text-sm outline-none focus:border-jaune"
              >
                <option value="">Watchlist…</option>
                {watchlists.map((w) => (
                  <option key={w.key} value={w.key}>{w.label}</option>
                ))}
              </select>
              <button
                onClick={() => tagKey && runBulk(() => bulkAddWatchlist({ ids: selIds, watchlist_key: tagKey, show_slug: show.slug }))}
                disabled={pending || !tagKey}
                className="btn-ghost px-2 py-1 text-sm disabled:opacity-40"
              >
                Tagger
              </button>
            </span>
          )}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-sm text-blanc-muted hover:text-blanc">
            Désélectionner
          </button>
          {msg && <span className="w-full text-xs text-jaune">{msg}</span>}
        </div>
      )}

      <div className={clsx("flex gap-5 overflow-x-auto pb-4", pending && "opacity-70")}>
        {columns.map((col, i) => {
          const list = visible.filter(col.match).sort(sortResurgence);
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
                    <h2 className="font-display text-sm font-semibold uppercase tracking-wide">{col.title}</h2>
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
                      className={clsx(
                        "relative cursor-grab active:cursor-grabbing",
                        dragId === c.id && "opacity-40",
                        c.archive && "opacity-60",
                        selected.has(c.id) && "rounded-card ring-2 ring-jaune"
                      )}
                    >
                      <TargetCard cible={c} show={show} />
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleSel(c.id);
                        }}
                        aria-label="Sélectionner"
                        className={clsx(
                          "absolute left-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border text-xs",
                          selected.has(c.id) ? "border-jaune bg-jaune text-noir-900" : "border-noir-600 bg-noir-900/80 text-transparent hover:text-blanc-muted"
                        )}
                      >
                        ✓
                      </button>
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
