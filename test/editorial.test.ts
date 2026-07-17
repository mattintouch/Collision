import { describe, it, expect } from "vitest";
import { computeEligibilite, CRITERES_ELIGIBILITE } from "../src/lib/editorial";

describe("éligibilité éditoriale GDIY (chantier 4, cas Belkaid)", () => {
  it("les critères GDIY sont écrits, en clair", () => {
    expect(CRITERES_ELIGIBILITE.gdiy.criteres).toContain("entrepreneur ou bâtisseur d'un système");
    expect(CRITERES_ELIGIBILITE.gdiy.criteres.length).toBe(3);
  });

  it("une DG d'institution scientifique ressort hors ligne éditoriale", () => {
    const belkaid = computeEligibilite("gdiy", {
      kind: "personne",
      role: "Directrice générale",
      organisation: "Institut Pasteur",
      sujets: ["science", "recherche"],
    });
    expect(belkaid.indicateur).toBe("hors_ligne");
    expect(belkaid.raisons.join(" ")).toContain("critères GDIY");
  });

  it("un fondateur est éligible", () => {
    const r = computeEligibilite("gdiy", { kind: "personne", role: "Fondateur et CEO", organisation: "Alan" });
    expect(r.indicateur).toBe("eligible");
  });

  it("un profil institutionnel qui a AUSSI bâti un système reste éligible", () => {
    const r = computeEligibilite("gdiy", {
      kind: "personne",
      role: "Professeur d'université",
      note: "A fondé une biotech valorisée 300 M€",
    });
    expect(r.indicateur).toBe("eligible");
  });

  it("sans donnée concluante : à vérifier, jamais un couperet silencieux", () => {
    const r = computeEligibilite("gdiy", { kind: "personne", role: "Athlète", organisation: null });
    expect(r.indicateur).toBe("a_verifier");
    expect(r.raisons[0]).toContain("critères GDIY");
  });

  it("une entreprise vise son bâtisseur : éligible", () => {
    expect(computeEligibilite("gdiy", { kind: "entreprise", role: null }).indicateur).toBe("eligible");
  });

  it("un show sans critères définis ne bloque rien", () => {
    expect(computeEligibilite("ccg", { kind: "personne", role: "Directrice générale", organisation: "Institut" }).indicateur).toBe("eligible");
  });
});
