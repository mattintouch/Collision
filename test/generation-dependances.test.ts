import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  AMONT_DIRECT,
  AVAL_DIRECT,
  avalsARejouer,
  blocIdees,
  marqueStale,
  type LigneGeneration,
} from "../src/lib/fiche/generation";

describe("dépendances de génération (mandat du 13/09, chantier 1)", () => {
  it("le DAG relie angles au deroule et deroule + synthese à la redaction", () => {
    expect(AVAL_DIRECT.angles).toEqual(["deroule"]);
    expect(AVAL_DIRECT.deroule).toEqual(["redaction"]);
    expect(AVAL_DIRECT.synthese).toEqual(["redaction"]);
    expect(AMONT_DIRECT.deroule).toEqual(["angles"]);
    expect(AMONT_DIRECT.redaction).toEqual(["deroule", "synthese"]);
  });

  it("le TEST DU BRIEF : un échec angles puis un retry remettent le deroule en file (et la redaction derrière)", () => {
    // La cible a déjà joué angles (failed), deroule et redaction (done).
    const dejaJoues = new Set(["angles", "deroule", "redaction"]);
    expect(avalsARejouer(["angles"], dejaJoues)).toEqual(["deroule", "redaction"]);
  });

  it("un aval jamais joué n'est pas ajouté, un aval déjà demandé n'est pas doublé", () => {
    expect(avalsARejouer(["angles"], new Set(["angles"]))).toEqual([]);
    expect(avalsARejouer(["angles", "deroule"], new Set(["angles", "deroule", "redaction"]))).toEqual(["redaction"]);
    // Transitivité : deroule jamais joué mais redaction déjà jouée, la
    // relance d'angles remet quand même la redaction en file.
    expect(avalsARejouer(["angles"], new Set(["angles", "redaction"]))).toEqual(["redaction"]);
  });

  it("marqueStale : le cas eric-schmidt du constat (deroule 10:15 avant angles 10:45) sort stale, redaction par transitivité", () => {
    const lignes: LigneGeneration[] = [
      { groupe: "portrait", statut: "done", quand: "2026-09-13T09:50:00Z" },
      { groupe: "angles", statut: "done", quand: "2026-09-13T10:45:20Z" },
      { groupe: "deroule", statut: "done", quand: "2026-09-13T10:15:28Z" },
      { groupe: "synthese", statut: "done", quand: "2026-09-13T10:20:25Z" },
      { groupe: "redaction", statut: "done", quand: "2026-09-13T10:30:44Z" },
    ];
    const m = new Map(marqueStale(lignes).map((l) => [l.groupe, l]));
    expect(m.get("portrait")!.stale).toBeUndefined();
    expect(m.get("angles")!.stale).toBeUndefined();
    expect(m.get("deroule")!.stale).toBe(true);
    expect(m.get("deroule")!.stale_cause).toContain("angles");
    expect(m.get("redaction")!.stale).toBe(true);
    expect(m.get("redaction")!.stale_cause).toContain("deroule");
    // La synthèse n'a pas d'amont rejoué après elle : pas stale.
    expect(m.get("synthese")!.stale).toBeUndefined();
  });

  it("marqueStale : un amont en file ou en cours périme l'aval done ; un groupe failed n'est jamais stale", () => {
    const enFile = marqueStale([
      { groupe: "angles", statut: "pending", quand: "2026-09-13T11:00:00Z" },
      { groupe: "deroule", statut: "done", quand: "2026-09-13T10:15:00Z" },
    ]);
    expect(enFile.find((l) => l.groupe === "deroule")!.stale).toBe(true);
    expect(enFile.find((l) => l.groupe === "deroule")!.stale_cause).toContain("en file");
    const echec = marqueStale([
      { groupe: "angles", statut: "done", quand: "2026-09-13T11:00:00Z" },
      { groupe: "deroule", statut: "failed", error: "x", quand: "2026-09-13T10:15:00Z" },
    ]);
    expect(echec.find((l) => l.groupe === "deroule")!.stale).toBeUndefined();
  });

  it("le drain diffère le deroule tant qu'angles est en file et échoue en cascade sur un angles failed", () => {
    const src = readFileSync("src/lib/enrichment/jobs.ts", "utf8");
    expect(src).toContain('if (groupe === "deroule")');
    expect(src).toContain("Passe deroule refusée : le dernier angles");
    // La rédaction exige aussi une synthèse non échouée.
    expect(src).toContain('groupe === "redaction" ? ["deroule", "synthese"] : ["deroule"]');
  });
});

describe("idées : statut à l'atterrissage (chantier 2) et hiérarchie des angles auteur (chantier 3)", () => {
  it("blocIdees expose l'id de chaque idée et exige le report des ids couverts", () => {
    const bloc = blocIdees([{ id: "abc-123", type: "angle", texte: "la carte France", source_url: null }]);
    expect(bloc).toContain("(id: abc-123)");
    expect(bloc).toContain("idees_couvertes");
  });

  it("le squelette et les briques demandent idees_couvertes et le flag plateau, avec le budget auteur", () => {
    const src = readFileSync("src/lib/fiche/generation.ts", "utf8");
    expect(src).toContain("CHAPITRES IMPOSÉS PAR L'AUTEUR DU SHOW");
    expect(src).toContain("12 questions au TOTAL");
    expect(src).toContain('budgetPlateau ? "3 à 4" : "5 à 8"');
    expect(src).toContain('"idees_couvertes": ["ids des idées éditoriales couvertes par cette brique"]');
    expect(src).toContain('"plateau": true (LA question de la brique à poser sur le plateau');
    // L'intégration se décide à l'atterrissage : marquage limité aux couvertes,
    // les autres listées dans le marqueur et le rapport du job.
    expect(src).toContain("await marqueIdeesIntegrees(sb, couvertes);");
    expect(src).toContain("idees_non_couvertes:${cible.id}");
  });

  it("le journal get_fiche expose stale et les idées non couvertes", () => {
    const src = readFileSync("src/lib/mcp/tools.ts", "utf8");
    expect(src).toContain("j.stale ? { stale: true, stale_cause: j.stale_cause }");
    expect(src).toContain("idees_non_couvertes");
  });
});
