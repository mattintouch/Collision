import { describe, it, expect } from "vitest";
import { buildEventDescription, participants, DEFAULT_LIEU, DEFAULT_DUREE_MIN, DEFAULT_CONTACTS_JOUR_J } from "../src/lib/episode/invitation";

describe("participants", () => {
  it("fusionne, met en minuscule, dédoublonne, filtre les non-emails", () => {
    const r = participants(["Invite@Show.fr"], ["invite@show.fr", "x@y.z", "pasunemail"]);
    expect(r).toEqual(["invite@show.fr", "x@y.z"]);
  });
});

describe("buildEventDescription (texte Matt 13/07)", () => {
  it("porte le texte logistique par défaut : 3 h, accès rez-de-chaussée, contacts", () => {
    const d = buildEventDescription({ show_nom: "GDIY", invite_nom: "Tony Parker" });
    expect(d).toContain("Tony Parker");
    expect(d).toContain("environ 3 h (prévoir installation avant et débrief après)");
    expect(d).toContain("Lieu : Studio 71, 71 rue de Saussure, 75017 Paris.");
    expect(d).toContain("Accès Studio 71 : Au rez de chaussée, frapper à la porte.");
    expect(d).toContain("Contact jour J :");
    expect(d).toContain("Clémence Lepic +33673575832");
    expect(d).toContain("Matéo Dos Santos : +33788264299");
  });
  it("un contact explicite remplace les contacts par défaut", () => {
    const d = buildEventDescription({ show_nom: "GDIY", invite_nom: "X", contact_jour_j: "Matt +33600000000" });
    expect(d).toContain("Matt +33600000000");
    expect(d).not.toContain("Clémence Lepic");
  });
  it("n'inclut pas l'accès studio hors Studio 71", () => {
    const d = buildEventDescription({ show_nom: "GDIY", invite_nom: "X", lieu: "Ailleurs" });
    expect(d).not.toContain("frapper à la porte");
  });
  it("ajoute le lien de fiche marqué accès team", () => {
    const d = buildEventDescription({ show_nom: "GDIY", invite_nom: "X", fiche_url: "https://m/fiches/x" });
    expect(d).toContain("Fiche prépa (accès team GDIY uniquement) : https://m/fiches/x");
  });
  it("version anglaise pour les invités anglophones", () => {
    const d = buildEventDescription({ show_nom: "GDIY", invite_nom: "X", fiche_url: "https://m/fiches/x" }, "en");
    expect(d).toContain("Duration: about 3 h");
    expect(d).toContain("Studio 71 access: ground floor, knock on the door.");
    expect(d).toContain("Clémence Lepic +33673575832");
    expect(d).toContain("Prep sheet (GDIY team access only): https://m/fiches/x");
  });
  it("exporte les défauts : Studio 71, 180 min, deux contacts", () => {
    expect(DEFAULT_LIEU).toContain("Studio 71");
    expect(DEFAULT_DUREE_MIN).toBe(180);
    expect(DEFAULT_CONTACTS_JOUR_J.length).toBe(2);
  });
});
