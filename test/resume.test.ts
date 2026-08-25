import { describe, it, expect } from "vitest";
import { tronqueProprement, RESUME_MAX_CHARS } from "../src/lib/recap/resume";

// Lot 4 du chantier récap : le fallback troncature et la borne dure des
// résumés (le chemin modèle est couvert par le contrat, pas par les tests).
describe("tronqueProprement (résumés du backlog)", () => {
  it("laisse un texte court intact, espaces normalisés", () => {
    expect(tronqueProprement("Ajouter  un filtre\n par type.")).toBe("Ajouter un filtre par type.");
  });

  it("coupe un pavé au mot, sous la borne, avec ellipse", () => {
    const pave = "Le récap du lundi réimprime chaque semaine le stock complet des demandes produit en statut nouveau, verbatim intégral compris, ce qui produit des sections de dix mille caractères strictement identiques d'une semaine sur l'autre et noie les demandes réellement nouvelles de l'équipe.";
    const r = tronqueProprement(pave);
    expect(r.length).toBeLessThanOrEqual(RESUME_MAX_CHARS);
    expect(r.endsWith("…")).toBe(true);
    expect(r).not.toMatch(/\s…$/);
    // Coupe au mot : le caractère avant l'ellipse termine un mot entier du texte.
    expect(pave.startsWith(r.slice(0, -1))).toBe(true);
    expect(pave[r.length - 1]).toBe(" ");
  });

  it("respecte une borne personnalisée", () => {
    const r = tronqueProprement("un deux trois quatre cinq six sept huit", 20);
    expect(r.length).toBeLessThanOrEqual(20);
    expect(r.endsWith("…")).toBe(true);
  });
});
