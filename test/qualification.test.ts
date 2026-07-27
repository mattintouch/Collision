import { describe, it, expect } from "vitest";
import { motifIneligibleGeneration } from "../src/lib/qualification";

describe("porte de la file de génération (chantier 3 du 27/07)", () => {
  it("une cible de test ne déclenche jamais de job", () => {
    const motif = motifIneligibleGeneration({ nom: "Rudy Gobert", archetype: "big_fish" }, { test: true, pourFiche: true });
    expect(motif).toContain("cible de test");
  });

  it("un placeholder ne déclenche jamais de job (cas du récap du 27/07)", () => {
    for (const nom of ["Test P0 Regressions", "Founder Canvas", "Un chef étoilé local", "TEST watchlist creation"]) {
      expect(motifIneligibleGeneration({ nom })).toContain("nom factice");
    }
  });

  it("une cible non qualifiée est bloquée pour la FICHE, pas pour l'enrichissement", () => {
    const cible = { nom: "Xavier Niel", role: "Fondateur", organisation: "Iliad", archetype: null };
    expect(motifIneligibleGeneration(cible, { pourFiche: true })).toContain("file à qualifier");
    expect(motifIneligibleGeneration(cible)).toBeNull(); // l'enrichissement aide à qualifier
  });

  it("une cible qualifiée réelle passe la porte, fiche comprise", () => {
    const cible = { nom: "Rudy Gobert", role: "Pivot NBA", organisation: "Minnesota Timberwolves", archetype: "big_fish" };
    expect(motifIneligibleGeneration(cible, { pourFiche: true })).toBeNull();
  });

  it("le motif dit quoi faire (message actionnable)", () => {
    const motif = motifIneligibleGeneration({ nom: "Xavier Niel", role: "Fondateur", organisation: "Iliad", archetype: null }, { pourFiche: true });
    expect(motif).toContain("assigner un archétype");
  });
});
