// [C6] Reporting séparé : funnel CLOSING (jusqu'à l'étape finale incluse) vs
// PRODUCTION (étapes après l'étape finale). Le partage se fait sur la position
// de l'étape `is_final` → générique, indépendant des clés d'un show donné.

import type { Stage } from "./types";

export interface StageCount {
  key: string;
  label: string;
  count: number;
}

export interface ShowStats {
  closing: {
    stages: StageCount[]; // identifié → … → confirmé
    en_cours: number; // avant l'étape finale
    gagnees: number; // étape finale et au-delà (confirmé + production)
    taux: number | null; // gagnées / (en cours + gagnées), en %
  };
  production: {
    stages: StageCount[]; // après l'étape finale (programmé → publié…)
    total: number;
  };
  archivees: number;
  actives: number; // non archivées
}

export function computeShowStats(
  stages: Stage[],
  rows: { stage_key: string | null; stage_position: number | null; archive: boolean }[]
): ShowStats {
  const finalPos = stages.find((s) => s.is_final)?.position ?? Number.POSITIVE_INFINITY;
  const byKey = new Map<string, number>();
  let archivees = 0;
  let en_cours = 0;
  let gagnees = 0;

  for (const r of rows) {
    if (r.archive) {
      archivees++;
      continue;
    }
    if (r.stage_key) byKey.set(r.stage_key, (byKey.get(r.stage_key) ?? 0) + 1);
    const pos = r.stage_position ?? 0;
    if (pos >= finalPos) gagnees++;
    else en_cours++;
  }

  const mk = (s: Stage): StageCount => ({ key: s.key, label: s.label, count: byKey.get(s.key) ?? 0 });
  const closingStages = stages.filter((s) => s.position <= finalPos).map(mk);
  const productionStages = stages.filter((s) => s.position > finalPos).map(mk);
  const denom = en_cours + gagnees;

  return {
    closing: {
      stages: closingStages,
      en_cours,
      gagnees,
      taux: denom > 0 ? Math.round((gagnees / denom) * 100) : null,
    },
    production: {
      stages: productionStages,
      total: productionStages.reduce((n, s) => n + s.count, 0),
    },
    archivees,
    actives: denom,
  };
}
