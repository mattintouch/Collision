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
  relancer: { icon: "→", cls: "text-relancer", bg: "rgba(31,157,107,.12)" },
  passer_par_appui: { icon: "↳", cls: "text-appui", bg: "rgba(59,130,246,.1)" },
  attendre: { icon: "◷", cls: "text-blanc-muted", bg: "rgba(55,53,47,.04)" },
};
const PRIO_DOT: Record<Priorite, string> = { haute: "#E2AD33", moyenne: "#6B6862", basse: "#9B978E" };

// Badges du score (le « signal frais » est déjà rendu par le bloc dédié, on
// l'omet ici pour ne pas doublonner).
const BADGE_STYLE: Record<string, { color: string; border: string; bg: string }> = {
  "fenêtre de relance": { color: "#29B37C", border: "rgba(41,179,124,.35)", bg: "rgba(41,179,124,.1)" },
  "risque d'abandon": { color: "#D0803F", border: "rgba(208,128,63,.45)", bg: "rgba(208,128,63,.1)" },
  "relais actionnable": { color: "#3B82F6", border: "rgba(59,130,246,.45)", bg: "rgba(59,130,246,.1)" },
  "estival ☀": { color: "#E2AD33", border: "rgba(226,173,51,.5)", bg: "rgba(242,193,78,.22)" },
  "à reporter (sept.)": { color: "#6B6862", border: "rgba(155,151,142,.3)", bg: "rgba(155,151,142,.08)" },
  "gagné": { color: "#6B6862", border: "rgba(155,151,142,.3)", bg: "rgba(155,151,142,.08)" },
};

function scoreColor(s: number): string {
  if (s >= 60) return "#E2AD33";
  if (s >= 40) return "#6B6862";
  return "#9B978E";
}

// A3.3 : stades « programmé ou au delà » — la carte affiche le lien direct vers
// la fiche de préparation si elle existe (sinon rien, jamais de bouton mort).
const STAGES_AVEC_FICHE = new Set(["programme", "enregistre", "produit", "publie"]);

export function TargetCard({
  cible,
  show,
  score,
  badges,
  ficheSlug,
}: {
  cible: CibleEnrichie;
  show: Show;
  score?: number | null;
  badges?: string[];
  ficheSlug?: string;
}) {
  const r = computeResurgence(cible);
  const lienFiche = ficheSlug && cible.stage_key && STAGES_AVEC_FICHE.has(cible.stage_key) ? `/fiches/${ficheSlug}` : null;
  const isEntreprise = cible.kind === "entreprise";
  const subtitle = isEntreprise
    ? [cible.secteur, cible.pays].filter(Boolean).join(" · ")
    : [cible.role, cible.organisation].filter(Boolean).join(" · ");
  const froid = cible.voie === "froid";
  const voieColor = froid ? "#3B82F6" : "#D0803F";
  const advice = ADVICE[r.conseil];
  const shownBadges = (badges ?? []).filter((b) => b !== "signal frais" && BADGE_STYLE[b]);

  return (
    <Link href={`/${show.slug}/cible/${cible.id}`} className="card block p-[14px] transition-colors hover:bg-noir-700">
      <div className="flex flex-col gap-[11px]">
        {/* 1 — Titre + voie (gouttières pl/pr pour la case à cocher et le menu ⋯) */}
        <div className="flex items-start justify-between gap-2 pl-6 pr-6">
          <div className="flex min-w-0 items-start gap-2.5">
            {cible.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cible.photo_url}
                alt=""
                className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-noir-600"
              />
            )}
            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-semibold tracking-[-0.014em]">{cible.nom}</h3>
              {subtitle && <p className="truncate text-[12.5px] text-blanc-muted">{subtitle}</p>}
            </div>
          </div>
          <span
            className="chip mono shrink-0"
            style={{
              color: voieColor,
              borderColor: froid ? "rgba(59,130,246,.4)" : "rgba(208,128,63,.4)",
              background: froid ? "rgba(59,130,246,.08)" : "rgba(208,128,63,.08)",
              fontSize: "9.5px",
              fontWeight: 600,
              letterSpacing: ".02em",
            }}
          >
            <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: voieColor }} />
            {VOIE_LABELS[cible.voie]}
          </span>
        </div>

        {/* 2 — Méta */}
        <div className="meta flex flex-wrap items-center gap-x-[13px] gap-y-1">
          {score != null && (
            <span className="mono inline-flex items-center gap-1" style={{ color: scoreColor(score) }} title="Score d'actionnabilité">
              <span style={{ fontSize: "8.5px", letterSpacing: ".02em", opacity: 0.7 }}>Score</span>
              <span style={{ fontWeight: 700 }}>{score}</span>
            </span>
          )}
          {cible.note_priorite != null && (
            <span style={{ color: "#E2AD33" }}>★ P{cible.note_priorite}</span>
          )}
          {cible.stage_label && <span>{cible.stage_label}</span>}
          {/* Statut de référence (0045) : affiché seulement quand il porte une
              valeur fine posée à la main, différente du libellé d'étape. */}
          {cible.statut_ref && cible.statut_ref !== cible.stage_label && (
            <span style={{ color: "#3B82F6" }}>{cible.statut_ref}</span>
          )}
          {(cible.social_score ?? 0) > 0 && (
            <span className="mono" title="Score social (schéma de référence)" style={{ color: "#6B6862" }}>
              <span style={{ fontSize: "8.5px", letterSpacing: ".02em", opacity: 0.7 }}>Social </span>
              <span style={{ fontWeight: 700 }}>{cible.social_score}</span>
            </span>
          )}
          {lienFiche && (
            // La carte entière est déjà un lien : navigation programmée pour
            // éviter une ancre imbriquée.
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                window.location.assign(lienFiche);
              }}
              className="chip mono cursor-pointer"
              style={{ color: "#29B37C", borderColor: "rgba(41,179,124,.35)", background: "rgba(41,179,124,.1)", fontSize: "9.5px", fontWeight: 700, letterSpacing: ".02em" }}
              title="Fiche de préparation"
            >
              Fiche »
            </button>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-[5px] w-[5px] rounded-full" style={{ background: PRIO_DOT[cible.priorite] }} />
            {cible.priorite}
          </span>
          {cible.ville && <span>📍 {cible.ville}</span>}
          {cible.nb_appuis > 0 && (
            <span>{cible.nb_appuis} appui{cible.nb_appuis > 1 ? "s" : ""}</span>
          )}
          {(cible.watchlist_keys ?? []).map((w) => (
            <span key={w} style={{ color: "#E2AD33" }}>{w}</span>
          ))}
          {cible.premiere_neige && <span style={{ color: "#3B82F6" }}>Première neige</span>}
          {cible.tag_investisseur && <span style={{ color: "#29B37C" }}>Investisseur</span>}
        </div>

        {/* Badges du score (fenêtre de relance, estival, relais…) */}
        {shownBadges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {shownBadges.map((b) => {
              const st = BADGE_STYLE[b];
              return (
                <span
                  key={b}
                  className="chip mono"
                  style={{ color: st.color, borderColor: st.border, background: st.bg, fontSize: "9px", fontWeight: 600, letterSpacing: ".02em" }}
                >
                  {b}
                </span>
              );
            })}
          </div>
        )}

        {/* 3 — Pourquoi maintenant (le cœur) */}
        {r.raison && (
          <div
            className="relative rounded-[10px] p-[11px] pl-[14px]"
            style={
              cible.signal_frais
                ? { background: "linear-gradient(90deg,rgba(242,193,78,.18),rgba(242,193,78,.04))", border: "1px solid rgba(226,173,51,.35)" }
                : { background: "rgba(55,53,47,.03)", border: "1px solid var(--line)" }
            }
          >
            {cible.signal_frais && (
              <span className="absolute bottom-[9px] left-0 top-[9px] w-[2px] rounded-full" style={{ background: "var(--accent-gradient)" }} />
            )}
            <div
              className="label"
              style={cible.signal_frais ? { color: "#E2AD33", fontSize: "9px" } : { color: "#9B978E", fontSize: "9px" }}
            >
              {cible.signal_frais ? "● Signal frais" : "Pourquoi maintenant"}
            </div>
            <p className="mt-1 text-[13px] leading-[1.35]" style={{ color: cible.signal_frais ? "#37352F" : "#6B6862" }}>
              {r.raison}
            </p>
            <span className={`mono mt-[9px] inline-flex items-center gap-1 rounded-[7px] px-[9px] py-[5px] text-[10.5px] font-medium ${advice.cls}`} style={{ background: advice.bg }}>
              {advice.icon} {CONSEIL_LABELS[r.conseil]}
            </span>
          </div>
        )}

        {/* 4 — Pied */}
        <div className="meta flex items-center justify-between" style={{ color: "#9B978E" }}>
          <span>
            {cible.jours_depuis_touche !== null ? `Dernière touche · ${cible.jours_depuis_touche} j` : "Jamais touché"}
          </span>
          {cible.dernier_signal_type && <span>{SIGNAL_LABELS[cible.dernier_signal_type]}</span>}
        </div>
      </div>
    </Link>
  );
}
