import { describe, it, expect } from "vitest";
import { construirePatchFolk, descriptionAvecLigneMagellan } from "../src/lib/folk/sync";

describe("synchro Folk (tâche 2) — règle source de vérité", () => {
  it("une valeur Magellan non vide écrase, un champ vide ne touche jamais Folk", () => {
    const { patch, champs } = construirePatchFolk(
      { role: "Fondateur & CEO", organisation: null, secteur: "", pays: undefined },
      { emails: [], telephones: [] },
      { jobTitle: "CTO", companies: [{ name: "Pelico" }] }
    );
    expect(patch.jobTitle).toBe("Fondateur & CEO"); // non vide : écrase
    expect(patch.companies).toBeUndefined(); // organisation vide : Folk intouché
    expect(patch.description).toBeUndefined(); // secteur/pays vides : rien
    expect(champs).toEqual(["jobTitle"]);
  });

  it("emails et téléphones sont UNIONNÉS, jamais retirés, dédoublonnés", () => {
    const { patch } = construirePatchFolk(
      {},
      { emails: ["a@x.fr", "B@x.fr"], telephones: ["+33 6 11 22 33 44"] },
      { emails: ["b@x.fr", "manuel@x.fr"], phones: [] }
    );
    expect(patch.emails).toEqual(["b@x.fr", "manuel@x.fr", "a@x.fr"]); // manuel conservé, B@x.fr doublon casse ignoré
    expect(patch.phones).toEqual(["+33 6 11 22 33 44"]);
  });

  it("rien à écrire quand Folk est déjà à jour (patch vide)", () => {
    const { patch, champs } = construirePatchFolk(
      { role: "CEO", organisation: "Pelico" },
      { emails: ["a@x.fr"], telephones: [] },
      { jobTitle: "CEO", companies: ["Pelico"], emails: ["a@x.fr"] }
    );
    expect(Object.keys(patch)).toEqual([]);
    expect(champs).toEqual([]);
  });

  it("secteur, pays et ville vivent dans la ligne gérée de la description, les notes à la main sont intouchées", () => {
    const { patch } = construirePatchFolk(
      { secteur: "SaaS industriel", pays: "États-Unis", ville: "Miami" },
      { emails: [], telephones: [] },
      { description: "Note manuelle de Matthieu.\nMagellan · secteur : ancien" }
    );
    expect(patch.description).toBe("Note manuelle de Matthieu.\nMagellan · secteur : SaaS industriel · pays : États-Unis · ville : Miami");
  });
});

describe("ligne gérée de la description Folk", () => {
  it("remplace sa ligne sans toucher au reste, et la retire si demandé", () => {
    const d = "Note manuelle.\nMagellan · secteur : X\nAutre note.";
    expect(descriptionAvecLigneMagellan(d, "pays : Y")).toBe("Note manuelle.\nAutre note.\nMagellan · pays : Y");
    expect(descriptionAvecLigneMagellan(d, null)).toBe("Note manuelle.\nAutre note.");
    expect(descriptionAvecLigneMagellan(null, "pays : Y")).toBe("Magellan · pays : Y");
    expect(descriptionAvecLigneMagellan("", null)).toBeNull();
  });
});
