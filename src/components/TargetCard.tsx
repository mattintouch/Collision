import Link from "next/link";
import type { CibleEnrichie, Show, Priorite } from "@/lib/types";
import {
  CONSEIL_LABELS,
  SIGNAL_LABELS,
  VOIE_LABELS,
  type Resurgence,
  computeResurgence,
} from "@/lib/domain";

const ADVICE: Record<Resurgence["conseil"], { icon: string; cls: string; bg: string }> = {
  relancer: { icon: "→", cls: "text-relancer", bg: "rgba(31,180,106,.12)" },
  passer_par_appui: { icon: "↳", cls: "text-appui", bg: "rgba(93,180,255,.1)" },
  attendre: { icon: "◷", cls: "text-blanc-muted", bg: "rgba(255,255,255,.04)" },
};
const PRIO_DOT: Record<Priorite, string> = { haute: "#FFD200", moyenne: "#9aa0ac", basse: "#5b616b" };

export function TargetCard({ cible, show }: { cible: CibleEnrichie; show: Show }) {
  const r = computeResurgence(cible);
  const isEntreprise = cible.kind === "entreprise";
  const subtitle = isEntreprise
    ? [cible.secteur, cible.pays].filter(Boolean).join(" · ")
    : [cible.role, cible.organisation].filter(Boolean).join(" · ");
  const froid = cible.voie === "froid";
  const voieColor = froid ? "#5DB4FF" : "#FF8C42";
  const advice = ADVICE[r.conseil];

  return (
    <Link href={`/${show.slug}/cible/${cible.id}`} className="card block p-[14px] transition-colors hover:bg-noir-700">
      <div className="flex flex-col gap-[11px]">
        {/* 1 — Titre + voie (gouttières pl/pr pour la case à cocher et le menu ⋯) */}
        <div className="flex items-start justify-between gap-2 pl-6 pr-6">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{cible.nom}</h3>
            {subtitle && <p className="truncate text-[12.5px] text-blanc-muted">{subtitle}</p>}
          </div>
          <span
            className="chip mono shrink-0"
            style={{
              color: voieColor,
              borderColor: froid ? "rgba(93,180,255,.3)" : "rgba(255,140,66,.3)",
              background: froid ? "rgba(93,180,255,.07)" : "rgba(255,140,66,.07)",
              fontSize: "9.5px",
              fontWeight: 600,
              letterSpacing: ".1em",
            }}
          >
            <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: voieColor }} />
            {VOIE_LABELS[cible.voie].toUpperCase()}
          </span>
        </div>

        {/* 2 — Méta */}
        <div className="meta flex flex-wrap items-center gap-x-[13px] gap-y-1">
          {cible.note_priorite != null && (
            <span style={{ color: "#FFD200" }}>★ P{cible.note_priorite}</span>
          )}
          {cible.stage_label && <span>{cible.stage_label}</span>}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: PRIO_DOT[cible.priorite] }} />
            {cible.priorite}
          </span>
          {cible.nb_appuis > 0 && (
            <span>{cible.nb_appuis} appui{cible.nb_appuis > 1 ? "s" : ""}</span>
          )}
          {(cible.watchlist_keys ?? []).map((w) => (
            <span key={w} style={{ color: "#FFD200" }}>{w.toUpperCase()}</span>
          ))}
        </div>

        {/* 3 — Pourquoi maintenant (le cœur) */}
        {r.raison && (
          <div
            className="relative rounded-[10px] p-[11px] pl-[14px]"
            style={
              cible.signal_frais
                ? { background: "linear-gradient(90deg,rgba(255,210,0,.08),rgba(255,210,0,.015))", border: "1px solid rgba(255,210,0,.16)" }
                : { background: "rgba(255,255,255,.025)", border: "1px solid var(--line)" }
            }
          >
            {cible.signal_frais && (
              <span className="absolute bottom-[9px] left-0 top-[9px] w-[2px] rounded-full" style={{ background: "var(--accent-gradient)" }} />
            )}
            <div
              className="label"
              style={cible.signal_frais ? { color: "#FFD200", fontSize: "9px", letterSpacing: ".16em" } : { color: "#6b7280", fontSize: "9px" }}
            >
              {cible.signal_frais ? "● Signal frais" : "Pourquoi maintenant"}
            </div>
            <p className="mt-1 text-[13px] leading-[1.35]" style={{ color: cible.signal_frais ? "#F3F4F6" : "#cfd2d8" }}>
              {r.raison}
            </p>
            <span className={`mono mt-[9px] inline-flex items-center gap-1 rounded-[7px] px-[9px] py-[5px] text-[10.5px] font-medium ${advice.cls}`} style={{ background: advice.bg }}>
              {advice.icon} {CONSEIL_LABELS[r.conseil]}
            </span>
          </div>
        )}

        {/* 4 — Pied */}
        <div className="meta flex items-center justify-between" style={{ color: "#565B66" }}>
          <span>
            {cible.jours_depuis_touche !== null ? `Dernière touche · ${cible.jours_depuis_touche} j` : "Jamais touché"}
          </span>
          {cible.dernier_signal_type && <span>{SIGNAL_LABELS[cible.dernier_signal_type]}</span>}
        </div>
      </div>
    </Link>
  );
}
