import { describe, it, expect } from "vitest";
import { parseSectionsParam } from "../src/lib/fiche/sections";

describe("get_fiche sections (tâche 4 du handoff)", () => {
  it("accepte un tableau d'ids", () => {
    const { ids, inconnus } = parseSectionsParam(["playbook", "chiffres"]);
    expect([...ids!]).toEqual(["playbook", "chiffres"]);
    expect(inconnus).toEqual([]);
  });
  it("accepte une CHAÎNE séparée par virgules ou espaces (session MCP déjà ouverte)", () => {
    const { ids } = parseSectionsParam("playbook, chiffres dix_questions");
    expect([...ids!].sort()).toEqual(["chiffres", "dix_questions", "playbook"]);
  });
  it("résout les alias hérités (presentation vers recit_canonique)", () => {
    const { ids, inconnus } = parseSectionsParam("presentation");
    expect([...ids!]).toEqual(["recit_canonique"]);
    expect(inconnus).toEqual([]);
  });
  it("omis ou vide = toute la fiche (comportement historique)", () => {
    expect(parseSectionsParam(undefined).ids).toBeNull();
    expect(parseSectionsParam("").ids).toBeNull();
    expect(parseSectionsParam([]).ids).toBeNull();
  });
  it("signale les ids inconnus au lieu de les avaler", () => {
    const { inconnus } = parseSectionsParam(["playbook", "inexistante"]);
    expect(inconnus).toEqual(["inexistante"]);
  });
});
