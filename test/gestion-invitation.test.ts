import { describe, it, expect } from "vitest";
import {
  parisVersUtcIso, heureMuraleParis, dureeMinutes, fenetreStudio,
  chevauchent, conflitsStudio, fusionneParticipants, STUDIO_RESA_PREFIXE,
} from "../src/lib/episode/gestion-invitation";

// Cycle de vie des invitations (backlog 62b38c35) : la logique pure des
// outils update_invitation et delete_invitation.

describe("interprétation des dates en Europe/Paris (contrainte 5)", () => {
  it("une chaîne nue est lue comme heure murale de Paris, été comme hiver", () => {
    // 22 octobre 2026 : heure d'été (UTC+2). Cas réel Ben Smith, 10h à Paris.
    expect(parisVersUtcIso("2026-10-22T10:00")).toBe("2026-10-22T08:00:00.000Z");
    expect(parisVersUtcIso("2026-10-22T10:00:00")).toBe("2026-10-22T08:00:00.000Z");
    // 15 décembre 2026 : heure d'hiver (UTC+1).
    expect(parisVersUtcIso("2026-12-15T09:30")).toBe("2026-12-15T08:30:00.000Z");
  });

  it("un décalage explicite est respecté tel quel", () => {
    expect(parisVersUtcIso("2026-10-22T08:00:00Z")).toBe("2026-10-22T08:00:00.000Z");
    expect(parisVersUtcIso("2026-10-22T10:00:00+02:00")).toBe("2026-10-22T08:00:00.000Z");
  });

  it("l'heure murale renvoyée à Google retombe sur ses pieds", () => {
    expect(heureMuraleParis("2026-10-22T08:00:00.000Z")).toBe("2026-10-22T10:00:00");
    expect(heureMuraleParis("2026-12-15T08:30:00.000Z")).toBe("2026-12-15T09:30:00");
  });
});

describe("fusion des participants avec RSVP préservés (contrainte 3)", () => {
  const existants = [
    { email: "matt@collision.studio", responseStatus: "accepted", organizer: true },
    { email: "clemence@stefani.fr", responseStatus: "accepted" },
    { email: "bureau.ceo@airfranceklm.com", responseStatus: "needsAction" },
  ];

  it("un conservé garde son responseStatus, un ajouté part sans réponse, un retiré sort", () => {
    const r = fusionneParticipants(existants, ["chief.of.staff@airfranceklm.com"], ["bureau.ceo@airfranceklm.com"]);
    expect(r.attendees.find((p) => p.email === "clemence@stefani.fr")?.responseStatus).toBe("accepted");
    expect(r.attendees.find((p) => p.email === "matt@collision.studio")?.organizer).toBe(true);
    expect(r.attendees.find((p) => p.email === "chief.of.staff@airfranceklm.com")?.responseStatus).toBeUndefined();
    expect(r.attendees.some((p) => p.email === "bureau.ceo@airfranceklm.com")).toBe(false);
    expect(r.ajoutes).toEqual(["chief.of.staff@airfranceklm.com"]);
    expect(r.retires).toEqual(["bureau.ceo@airfranceklm.com"]);
  });

  it("dédoublonne (casse comprise) et ignore les non-emails", () => {
    const r = fusionneParticipants(existants, ["CLEMENCE@stefani.fr", "pas-un-email"], []);
    expect(r.ajoutes).toEqual([]);
    expect(r.attendees).toHaveLength(3);
  });

  it("sans ajout ni retrait, la liste ressort identique", () => {
    const r = fusionneParticipants(existants);
    expect(r.attendees).toEqual(existants);
    expect(r.ajoutes).toEqual([]);
    expect(r.retires).toEqual([]);
  });
});

describe("réservation studio : fenêtre et conflits (contrainte 6)", () => {
  it("la fenêtre reprend la règle de validate_cible : une heure avant, une heure après", () => {
    const f = fenetreStudio("2026-10-22T08:00:00.000Z", 120);
    expect(f.startISO).toBe("2026-10-22T07:00:00.000Z");
    expect(f.endISO).toBe("2026-10-22T11:00:00.000Z");
  });

  it("seules les réservations studio comptent, hors annulées et hors événements de l'épisode", () => {
    const fenetre = { startISO: "2026-10-22T07:00:00.000Z", endISO: "2026-10-22T11:00:00.000Z" };
    const evts = [
      { id: "resa-autre", summary: `${STUDIO_RESA_PREFIXE} — Autre Invité`, start: { dateTime: "2026-10-22T10:00:00Z" }, end: { dateTime: "2026-10-22T13:00:00Z" } },
      { id: "resa-annulee", status: "cancelled", summary: `${STUDIO_RESA_PREFIXE} — Fantôme`, start: { dateTime: "2026-10-22T08:00:00Z" }, end: { dateTime: "2026-10-22T09:00:00Z" } },
      { id: "resa-propre", summary: `${STUDIO_RESA_PREFIXE} — Ben Smith`, start: { dateTime: "2026-10-22T08:00:00Z" }, end: { dateTime: "2026-10-22T12:00:00Z" } },
      { id: "reunion", summary: "Point hebdo équipe", start: { dateTime: "2026-10-22T09:00:00Z" }, end: { dateTime: "2026-10-22T10:00:00Z" } },
      { id: "resa-hors-fenetre", summary: `${STUDIO_RESA_PREFIXE} — Après`, start: { dateTime: "2026-10-22T11:00:00Z" }, end: { dateTime: "2026-10-22T14:00:00Z" } },
    ];
    const c = conflitsStudio(evts, fenetre, ["ev-principal", "resa-propre"]);
    expect(c.map((x) => x.id)).toEqual(["resa-autre"]);
  });

  it("chevauchent : bornes exclusives, un créneau qui commence à la fin de l'autre ne chevauche pas", () => {
    expect(chevauchent("2026-10-22T07:00:00Z", "2026-10-22T11:00:00Z", "2026-10-22T11:00:00Z", "2026-10-22T12:00:00Z")).toBe(false);
    expect(chevauchent("2026-10-22T07:00:00Z", "2026-10-22T11:00:00Z", "2026-10-22T10:59:00Z", "2026-10-22T12:00:00Z")).toBe(true);
  });
});

describe("durée depuis l'événement", () => {
  it("cas Ben Smith : 180 minutes constatées, 120 voulues", () => {
    expect(dureeMinutes("2026-10-22T08:00:00Z", "2026-10-22T11:00:00Z")).toBe(180);
    expect(dureeMinutes("2026-10-22T08:00:00Z", "2026-10-22T10:00:00Z")).toBe(120);
  });
});
