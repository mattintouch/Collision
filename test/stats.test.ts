import { describe, it, expect } from "vitest";
import { computeShowStats } from "../src/lib/stats";
import type { Stage } from "../src/lib/types";

const stages: Stage[] = [
  { key: "identifie", label: "Identifié", position: 1, is_final: false },
  { key: "qualifie", label: "Qualifié", position: 2, is_final: false },
  { key: "contacte", label: "Contacté", position: 3, is_final: false },
  { key: "confirme", label: "Confirmé", position: 4, is_final: true },
  { key: "programme", label: "Programmé", position: 5, is_final: false },
  { key: "enregistre", label: "Enregistré", position: 6, is_final: false },
  { key: "publie", label: "Publié", position: 7, is_final: false },
] as Stage[];

describe("computeShowStats — séparation closing / production", () => {
  const rows = [
    { stage_key: "identifie", stage_position: 1, archive: false },
    { stage_key: "qualifie", stage_position: 2, archive: false },
    { stage_key: "contacte", stage_position: 3, archive: false },
    { stage_key: "contacte", stage_position: 3, archive: false },
    { stage_key: "confirme", stage_position: 4, archive: false },
    { stage_key: "enregistre", stage_position: 6, archive: false },
    { stage_key: "publie", stage_position: 7, archive: false },
    { stage_key: "identifie", stage_position: 1, archive: true },
  ];
  const s = computeShowStats(stages, rows);

  it("compte en cours vs gagnées sur l'étape finale", () => {
    expect(s.closing.en_cours).toBe(4); // positions < 4
    expect(s.closing.gagnees).toBe(3); // ≥ 4 (confirme + enregistre + publie)
    expect(s.closing.taux).toBe(43); // 3 / 7
  });

  it("sépare le pipeline de production (> finale)", () => {
    expect(s.production.total).toBe(2); // enregistre + publie
  });

  it("compte les archivées hors pipe", () => {
    expect(s.archivees).toBe(1);
    expect(s.actives).toBe(7);
  });
});
