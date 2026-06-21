import Link from "next/link";
import clsx from "clsx";
import type { CibleEnrichie, Show } from "@/lib/types";
import {
  ARCHETYPE_LABELS,
  CONSEIL_LABELS,
  PRIORITE_LABELS,
  SIGNAL_LABELS,
  VOIE_LABELS,
  computeResurgence,
} from "@/lib/domain";

export function TargetCard({
  cible,
  show,
}: {
  cible: CibleEnrichie;
  show: Show;
}) {
  const r = computeResurgence(cible);
  const isEntreprise = cible.kind === "entreprise";

  return (
    <Link
      href={`/${show.slug}/cible/${cible.id}`}
      className="card block p-4 transition-colors hover:border-noir-600 hover:bg-noir-700"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium leading-tight">{cible.nom}</h3>
          <p className="mt-0.5 text-xs text-blanc-muted">
            {isEntreprise
              ? [cible.secteur, cible.pays].filter(Boolean).join(" · ")
              : [cible.role, cible.organisation].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span
          className={clsx(
            "chip shrink-0 border-transparent",
            cible.voie === "froid"
              ? "bg-sky-500/15 text-sky-300"
              : "bg-orange-500/15 text-orange-300"
          )}
        >
          {VOIE_LABELS[cible.voie]}
        </span>
      </div>

      {isEntreprise && cible.raison_de_selection && (
        <p className="mt-2 line-clamp-2 text-sm text-blanc">
          {cible.raison_de_selection}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        {cible.stage_label && (
          <span className="chip border-noir-600 text-blanc-muted">
            {cible.stage_label}
          </span>
        )}
        <span className="chip border-noir-600 text-blanc-muted">
          Priorité {PRIORITE_LABELS[cible.priorite].toLowerCase()}
        </span>
        {!isEntreprise && cible.archetype && (
          <span className="chip border-jaune/40 text-jaune">
            {ARCHETYPE_LABELS[cible.archetype]}
          </span>
        )}
        {cible.nb_appuis > 0 && (
          <span className="chip border-noir-600 text-blanc-muted">
            {cible.nb_appuis} appui{cible.nb_appuis > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Pourquoi maintenant — moteur de résurgence */}
      {r.raison && (
        <div className="mt-3 border-t border-noir-600 pt-2 text-xs">
          <span
            className={clsx(
              cible.signal_frais ? "text-jaune" : "text-blanc-muted"
            )}
          >
            {r.conseil !== "relancer" && (
              <span className="font-medium">{CONSEIL_LABELS[r.conseil]} — </span>
            )}
            {r.raison}
          </span>
        </div>
      )}
      {cible.signal_frais && cible.dernier_signal_type && (
        <p className="mt-1 text-xs text-blanc-muted">
          Signal : {SIGNAL_LABELS[cible.dernier_signal_type]}
        </p>
      )}
    </Link>
  );
}
