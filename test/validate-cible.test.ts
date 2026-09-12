import { describe, it, expect } from "vitest";
import { decisionValidation } from "../src/lib/episode/validation";

describe("validate_cible idempotent (12/09, chantier 5)", () => {
  it("première validation : épisode créé, invitation si date, génération lancée", () => {
    expect(decisionValidation({ deja: false, invitation_existante: false, avec_date: true })).toEqual({
      creer_episode: true, creer_invitation: true, lancer_generation: true,
    });
    expect(decisionValidation({ deja: false, invitation_existante: false, avec_date: false })).toEqual({
      creer_episode: true, creer_invitation: false, lancer_generation: true,
    });
  });

  it("re-validation avec date et invitation déjà en place : rien de recréé, épisode réutilisé", () => {
    const d = decisionValidation({ deja: true, invitation_existante: true, avec_date: true });
    expect(d.creer_episode).toBe(false);
    expect(d.creer_invitation).toBe(false);
    expect(d.lancer_generation).toBe(false);
    expect(d.note).toContain("update_episode");
  });

  it("re-validation avec date mais sans invitation : seule l'invitation manquante est créée", () => {
    const d = decisionValidation({ deja: true, invitation_existante: false, avec_date: true });
    expect(d.creer_episode).toBe(false);
    expect(d.creer_invitation).toBe(true);
    expect(d.lancer_generation).toBe(false);
    expect(d.note).toContain("manquante");
  });

  it("re-validation sans date : simple bascule, jamais de second épisode", () => {
    const d = decisionValidation({ deja: true, invitation_existante: false, avec_date: false });
    expect(d.creer_episode).toBe(false);
    expect(d.creer_invitation).toBe(false);
    expect(d.lancer_generation).toBe(false);
  });
});
