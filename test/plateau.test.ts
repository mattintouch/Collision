import { describe, it, expect } from "vitest";
import { asPlateau } from "../src/lib/fiche/schema";
import { FICHE_SECTIONS } from "../src/lib/fiche/sections";
import { CHROME_FICHE } from "../src/lib/fiche/chrome";

describe("section plateau (dix_questions réactivée, mandat du 13/09)", () => {
  it("le catalogue la sert en tête de fiche, active, numérotée 00", () => {
    const def = FICHE_SECTIONS.find((s) => s.id === "dix_questions")!;
    expect(def.retire).toBeUndefined();
    expect(def.num).toBe("00");
    const ids = FICHE_SECTIONS.map((s) => s.id);
    expect(ids.indexOf("dix_questions")).toBe(ids.indexOf("sticky_header") + 1);
  });

  it("asPlateau lit le contrat du mandat : intro, chapitres minutés, questions par chapitre, interdits", () => {
    const p = asPlateau({
      intro: "Ten questions for 90 minutes.",
      chapitres: [
        { num: 1, titre: "How he decides", debut_min: 0, fin_min: 20 },
        { num: 4, titre: "Europe and France", debut_min: 75, fin_min: 90 },
      ],
      interdits: ["Never mention the Arizona speech.", "  "],
      questions: [
        { num: "01", chapitre: 1, texte: "Who had the last word" },
        { num: "09", chapitre: 4, texte: "Bessent: rien" },
      ],
    })!;
    expect(p.intro).toContain("Ten questions");
    expect(p.chapitres).toHaveLength(2);
    expect(p.chapitres[1]).toEqual({ num: 4, titre: "Europe and France", debut_min: 75, fin_min: 90 });
    expect(p.questions[0]).toEqual({ num: "01", chapitre: 1, texte: "Who had the last word" });
    expect(p.interdits).toEqual(["Never mention the Arizona speech."]);
  });

  it("compatibilité v3.1 : le champ bloc vaut chapitre, les chapitres sans num prennent leur rang", () => {
    const p = asPlateau({
      chapitres: [{ titre: "A" }, { titre: "B" }],
      questions: [{ num: "01", bloc: 2, texte: "ancienne forme", note: "RELANCE : ..." }],
    })!;
    expect(p.chapitres.map((c) => c.num)).toEqual([1, 2]);
    expect(p.questions[0].chapitre).toBe(2);
    expect(p.questions[0].note).toContain("RELANCE");
  });

  it("une section vide ou invalide rend null (jamais de section vide au rendu)", () => {
    expect(asPlateau({})).toBeNull();
    expect(asPlateau(null)).toBeNull();
    expect(asPlateau({ questions: [{ texte: "" }] })).toBeNull();
  });

  it("le titre et les libellés existent dans les deux langues du dictionnaire", () => {
    for (const langue of ["fr", "en"] as const) {
      const L = CHROME_FICHE[langue];
      expect(L.plateauTitre.length).toBeGreaterThan(0);
      expect(L.plateauInterdits.length).toBeGreaterThan(0);
      expect(L.plateauChapitre(2)).toContain("2");
      expect(L.plateauOuvrir.length).toBeGreaterThan(0);
    }
  });
});
