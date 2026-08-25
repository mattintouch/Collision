import { describe, it, expect } from "vitest";
import { normName } from "../src/lib/contacts/resolve";

// P1 du chantier doublons (25/08) : create_cible et ensureCible matchent sur
// nom normalisé + show. La normalisation est celle de normName, la même que le
// miroir Folk : casse, accents, espaces multiples. Cas de référence : les
// quatre fiches Yuval Noah Harari nées de variations invisibles du nom.
describe("normalisation des noms (détection de doublons à la création)", () => {
  it("casse, espaces multiples et espaces de bord se replient sur la même clé", () => {
    const attendu = normName("Yuval Noah Harari");
    expect(normName("yuval noah harari")).toBe(attendu);
    expect(normName("Yuval  Noah  HARARI")).toBe(attendu);
    expect(normName(" Yuval Noah Harari ")).toBe(attendu);
    expect(normName("Yuval Noah Harari".replace(/ /g, " "))).toBe(attendu);
  });

  it("les accents se replient (cas Rafaèle Tordjman)", () => {
    expect(normName("Rafaèle Tordjman")).toBe(normName("Rafaele Tordjman"));
    expect(normName("Clémence Lepic")).toBe(normName("Clemence Lepic"));
  });

  it("deux personnes différentes restent différentes", () => {
    expect(normName("Yuval Noah Harari")).not.toBe(normName("Yuval Harari"));
    expect(normName("Ben Smith")).not.toBe(normName("Ben Smith AFKL"));
  });
});
