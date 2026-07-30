import { describe, it, expect } from "vitest";
import { kindAwarePatch, mapKindConstraintError } from "../src/lib/mcp/kind";

describe("kindAwarePatch", () => {
  it("accepte les champs descriptifs sur une personne (secteur/pays/raison, cf. 0020/0021)", () => {
    const { patch, rejected } = kindAwarePatch("personne", {
      role: "CEO", organisation: "Datadog", secteur: "Tech", pays: "États-Unis", raison_de_selection: "angle",
    });
    expect(rejected).toEqual([]);
    expect(patch).toMatchObject({ role: "CEO", organisation: "Datadog", secteur: "Tech", pays: "États-Unis", raison_de_selection: "angle" });
  });

  it("rejette archétype/rôle sur une entreprise", () => {
    const { rejected } = kindAwarePatch("entreprise", { archetype: "big_fish", role: "CEO", secteur: "Auto" });
    expect(rejected).toContain("archetype");
    expect(rejected).toContain("role");
  });

  it("ignore les champs non déclarés (pas dans le patch)", () => {
    const { patch } = kindAwarePatch("personne", { nom: "X", champ_bidon: 1 } as Record<string, unknown>);
    expect(patch).toHaveProperty("nom");
    expect(patch).not.toHaveProperty("champ_bidon");
  });

  it("schéma de référence : tout passe sur une personne, prenom/genre refusés sur une entreprise", () => {
    const reference = {
      prenom: "Jean", genre: "homme", categorie: ["tech"], serie_speciale: ["première neige"],
      premiere_neige: true, tag_investisseur: true, social_score: 2, statut_ref: "À suivre",
      date_relance: "2026-08-15", date_contact: "2026-07-01",
    };
    const perso = kindAwarePatch("personne", reference);
    expect(perso.rejected).toEqual([]);
    expect(perso.patch).toMatchObject(reference);

    const ent = kindAwarePatch("entreprise", reference);
    expect(ent.rejected).toContain("prenom");
    expect(ent.rejected).toContain("genre");
    // Les attributs partagés restent permis sur une entreprise.
    expect(ent.patch).toMatchObject({ statut_ref: "À suivre", social_score: 2 });
  });
});

describe("mapKindConstraintError (régressions 17/07)", () => {
  it("traduit la contrainte personne héritée de 0001 vers la migration 0036", () => {
    const msg = mapKindConstraintError('new row for relation "cibles" violates check constraint "cible_personne_fields"');
    expect(msg).toContain("0036");
  });
  it("explique la contrainte entreprise (role/archetype)", () => {
    const msg = mapKindConstraintError('violates check constraint "cible_entreprise_fields"');
    expect(msg).toContain("archetype");
  });
  it("laisse passer les autres erreurs (null)", () => {
    expect(mapKindConstraintError("duplicate key value")).toBeNull();
  });
});
