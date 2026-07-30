import { describe, it, expect } from "vitest";
import { motifIneligibleGeneration, patchReference } from "../src/lib/qualification";

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

describe("patchReference — qualification enrichie (rebranchement 2)", () => {
  it("ne pose que les champs fournis, rien par défaut", () => {
    expect(patchReference({}).patch).toEqual({});
    const { patch, refuses } = patchReference({ genre: "femme", social_score: 2 }, ["homme", "femme", "autre"]);
    expect(refuses).toEqual([]);
    expect(patch).toEqual({ genre: "femme", social_score: 2 });
  });

  it("refuse un genre hors de la liste de ref_statuts, en citant les valeurs", () => {
    const { patch, refuses } = patchReference({ genre: "inconnu" }, ["homme", "femme", "autre"]);
    expect(patch).toEqual({});
    expect(refuses[0]).toContain("inconnu");
    expect(refuses[0]).toContain("homme, femme, autre");
  });

  it("liste de genres vide = contrôle désactivé (la table de référence fait foi)", () => {
    const { patch, refuses } = patchReference({ genre: "femme" }, []);
    expect(refuses).toEqual([]);
    expect(patch).toEqual({ genre: "femme" });
  });

  it("genre vide efface (null), jamais de chaîne vide en base", () => {
    expect(patchReference({ genre: "" }, ["homme"]).patch).toEqual({ genre: null });
    expect(patchReference({ genre: null }).patch).toEqual({ genre: null });
  });

  it("refuse un social_score hors bornes ou non entier (contrainte 0-3 de Louis)", () => {
    for (const score of [-1, 4, 1.5]) {
      const { refuses } = patchReference({ social_score: score });
      expect(refuses.length, `score ${score} devrait être refusé`).toBe(1);
      expect(refuses[0]).toContain("0 à 3");
    }
    expect(patchReference({ social_score: 0 }).patch).toEqual({ social_score: 0 });
    expect(patchReference({ social_score: 3 }).patch).toEqual({ social_score: 3 });
  });

  it("nettoie les catégories : vides retirées, doublons fusionnés, ordre conservé", () => {
    const { patch } = patchReference({ categorie: [" sport ", "", "tech", "sport"] });
    expect(patch.categorie).toEqual(["sport", "tech"]);
  });

  it("les deux tags passent tels quels", () => {
    const { patch } = patchReference({ premiere_neige: true, tag_investisseur: false });
    expect(patch).toEqual({ premiere_neige: true, tag_investisseur: false });
  });
});
