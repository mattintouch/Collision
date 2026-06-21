import type { CibleEnrichie, Show, Stage } from "@/lib/types";
import { ARCHETYPE_LABELS, ARCHETYPE_ORDER, computeResurgence } from "@/lib/domain";
import { TargetCard } from "./TargetCard";

/** Tri de résurgence : voie froide devant, puis score décroissant. */
function sortResurgence(a: CibleEnrichie, b: CibleEnrichie) {
  if (a.voie !== b.voie) return a.voie === "froid" ? -1 : 1;
  return computeResurgence(b).score - computeResurgence(a).score;
}

function Column({
  title,
  hint,
  cibles,
  show,
}: {
  title: string;
  hint?: string;
  cibles: CibleEnrichie[];
  show: Show;
}) {
  return (
    <div className="flex w-80 shrink-0 flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <div>
          <h2 className="font-display text-sm font-semibold uppercase tracking-wide">
            {title}
          </h2>
          {hint && <p className="text-xs text-blanc-muted">{hint}</p>}
        </div>
        <span className="text-xs text-blanc-muted">{cibles.length}</span>
      </div>
      <div className="flex flex-col gap-3">
        {cibles.length === 0 ? (
          <p className="rounded-card border border-dashed border-noir-600 p-4 text-center text-xs text-blanc-muted">
            Aucune cible
          </p>
        ) : (
          cibles.sort(sortResurgence).map((c) => (
            <TargetCard key={c.id} cible={c} show={show} />
          ))
        )}
      </div>
    </div>
  );
}

export function Board({
  show,
  stages,
  cibles,
}: {
  show: Show;
  stages: Stage[];
  cibles: CibleEnrichie[];
}) {
  // Invités (GDIY, CCG) : colonnes par archétype. La voie est portée par la carte.
  if (show.type_pipe === "invites") {
    return (
      <div className="flex gap-5 overflow-x-auto pb-4">
        {ARCHETYPE_ORDER.map((arch) => (
          <Column
            key={arch}
            title={ARCHETYPE_LABELS[arch]}
            cibles={cibles.filter((c) => c.archetype === arch)}
            show={show}
          />
        ))}
        <Column
          title="À classer"
          hint="archétype manquant"
          cibles={cibles.filter((c) => !c.archetype)}
          show={show}
        />
      </div>
    );
  }

  // Fleurons (thématique) : colonnes par étape, chaque carte porte sa raison de sélection.
  return (
    <div className="flex gap-5 overflow-x-auto pb-4">
      {stages.map((st) => (
        <Column
          key={st.id}
          title={st.label}
          cibles={cibles.filter((c) => c.stage_id === st.id)}
          show={show}
        />
      ))}
    </div>
  );
}
