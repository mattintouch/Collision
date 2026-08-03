import { describe, it, expect } from "vitest";
import { parseSectionsParam } from "../src/lib/fiche/sections";

describe("get_fiche sections (tâche 4 du handoff)", () => {
  it("accepte un tableau d'ids (les ids v2 se résolvent vers v3.1)", () => {
    const { ids, inconnus } = parseSectionsParam(["playbook", "chiffres"]);
    expect([...ids!]).toEqual(["apprentissages", "data"]);
    expect(inconnus).toEqual([]);
  });
  it("accepte une CHAÎNE séparée par virgules ou espaces (session MCP déjà ouverte)", () => {
    const { ids } = parseSectionsParam("topics, data dix_questions");
    expect([...ids!].sort()).toEqual(["data", "dix_questions", "topics"]);
  });
  it("résout les alias hérités (v2 puis v3.1)", () => {
    expect([...parseSectionsParam("presentation").ids!]).toEqual(["recit_canonique"]);
    expect([...parseSectionsParam("entete").ids!]).toEqual(["identite"]);
    expect([...parseSectionsParam("questions_reseaux").ids!]).toEqual(["clips"]);
    expect(parseSectionsParam("entete").inconnus).toEqual([]);
  });
  it("omis ou vide = toute la fiche (comportement historique)", () => {
    expect(parseSectionsParam(undefined).ids).toBeNull();
    expect(parseSectionsParam("").ids).toBeNull();
    expect(parseSectionsParam([]).ids).toBeNull();
  });
  it("signale les ids inconnus au lieu de les avaler", () => {
    const { inconnus } = parseSectionsParam(["topics", "inexistante"]);
    expect(inconnus).toEqual(["inexistante"]);
  });
});
