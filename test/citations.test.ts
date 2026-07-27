import { describe, it, expect } from "vitest";
import { stripCitations, stripCiteTags } from "../src/lib/ai/websearch";

describe("stripCitations (constat P0 du 24/07)", () => {
  it("retire les balises cite en gardant le texte, récursivement", () => {
    const sale = {
      raison: '<cite index="13-1">Nouvelle vague de l\'IA industrielle.</cite> <cite index="19-3,19-10">Croissance forte <cite index="19-7">et clients prestigieux</cite>.</cite>',
      sujets: ['<cite index="1-2">Supply chain</cite>', "Deep tech"],
      nombre: 3,
    };
    const propre = stripCitations(sale);
    expect(propre.raison).toBe("Nouvelle vague de l'IA industrielle. Croissance forte et clients prestigieux.");
    expect(propre.sujets).toEqual(["Supply chain", "Deep tech"]);
    expect(propre.nombre).toBe(3);
  });
  it("laisse intact un contenu sans citation, et null reste null", () => {
    expect(stripCitations({ a: "texte simple" })).toEqual({ a: "texte simple" });
    expect(stripCitations(null)).toBeNull();
  });
});

describe("stripCiteTags (chantier 1 du 27/07, constat Taittinger)", () => {
  it("retire les balises cite en gardant le texte intérieur, récursivement", () => {
    const sale = {
      definition: 'Maison familiale <cite index="9-6">reprise après une vente contestée</cite> puis relancée.',
      pairs: [{ nom: '<cite index="2-1">Vitalie Taittinger</cite>', position: "présidente" }],
    };
    const propre = stripCiteTags(sale);
    expect(propre.definition).toBe("Maison familiale reprise après une vente contestée puis relancée.");
    expect(propre.pairs[0].nom).toBe("Vitalie Taittinger");
  });
  it("préserve les sauts de ligne de la prose stockée (à la différence de stripCitations)", () => {
    const paragraphes = "Premier paragraphe.\n\nSecond paragraphe.";
    expect(stripCiteTags({ texte: paragraphes }).texte).toBe(paragraphes);
    expect(stripCitations({ texte: paragraphes }).texte).not.toBe(paragraphes);
  });
  it("resserre les espaces doublés laissés par le retrait d'une balise", () => {
    expect(stripCiteTags('avant <cite index="1-1"> </cite> après')).toBe("avant après");
    expect(stripCiteTags(null)).toBeNull();
  });
});
