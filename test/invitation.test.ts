import { describe, it, expect } from "vitest";
import { buildEventDescription, participants, DEFAULT_LIEU } from "../src/lib/episode/invitation";

describe("participants", () => {
  it("fusionne, met en minuscule, dédoublonne, filtre les non-emails", () => {
    const r = participants(["Invite@Show.fr"], ["invite@show.fr", "x@y.z", "pasunemail"]);
    expect(r).toEqual(["invite@show.fr", "x@y.z"]);
  });
});

describe("buildEventDescription", () => {
  it("inclut l'accès Studio 71 au lieu par défaut", () => {
    const d = buildEventDescription({ show_nom: "GDIY", invite_nom: "Tony Parker" });
    expect(d).toContain("Studio 71");
    expect(d).toContain("Parking");
    expect(d).toContain("Tony Parker");
    expect(d).toContain("Contact jour J");
  });
  it("n'inclut pas l'accès studio hors Studio 71", () => {
    const d = buildEventDescription({ show_nom: "GDIY", invite_nom: "X", lieu: "Ailleurs" });
    expect(d).not.toContain("Interphone");
  });
  it("ajoute le lien de fiche quand fourni", () => {
    const d = buildEventDescription({ show_nom: "GDIY", invite_nom: "X", fiche_url: "https://m/fiche/1?t=abc" });
    expect(d).toContain("Fiche de préparation : https://m/fiche/1?t=abc");
  });
  it("exporte le lieu par défaut Studio 71", () => {
    expect(DEFAULT_LIEU).toContain("Studio 71");
  });
});
