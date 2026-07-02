import { describe, it, expect } from "vitest";
import { kindAwarePatch } from "../src/lib/mcp/kind";

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
});
