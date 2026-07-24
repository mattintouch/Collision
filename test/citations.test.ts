import { describe, it, expect } from "vitest";
import { stripCitations } from "../src/lib/ai/websearch";

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
