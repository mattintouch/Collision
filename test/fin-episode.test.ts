import { describe, it, expect, afterEach } from "vitest";
import { buildNotesEmail, notesRecipients, eventsOfSession } from "../src/lib/fiche/finEpisode";
import type { ConsoleEvent, RecSession } from "../src/lib/fiche/console";

const session: RecSession = {
  id: "s1",
  started_at: "2026-07-20T10:00:00Z",
  ended_at: "2026-07-20T13:05:00Z",
  started_by: "matt@stefani.fr",
  ended_by: "clemence@stefani.fr",
};

const ev = (over: Partial<ConsoleEvent>): ConsoleEvent => ({
  id: Math.random().toString(36).slice(2),
  session_id: "s1",
  created_at: "2026-07-20T11:00:00Z",
  author_email: "matt@stefani.fr",
  kind: "note",
  timecode: "10:00",
  payload: { text: "note" },
  ...over,
});

const ANCIENS = { to: process.env.NOTES_EPISODE_EMAILS, cc: process.env.NOTES_EPISODE_CC };
afterEach(() => {
  if (ANCIENS.to === undefined) delete process.env.NOTES_EPISODE_EMAILS;
  else process.env.NOTES_EPISODE_EMAILS = ANCIENS.to;
  if (ANCIENS.cc === undefined) delete process.env.NOTES_EPISODE_CC;
  else process.env.NOTES_EPISODE_CC = ANCIENS.cc;
});

describe("email de fin d'enregistrement (B1)", () => {
  const fiche = { invite_nom: "Yaël Braun-Pivet", slug: "yael-braun-pivet" };
  const events = [
    ev({ kind: "clip", timecode: "45:12", payload: { text: "Moment fort marqué" }, author_email: "matt@stefani.fr" }),
    ev({ kind: "clip", timecode: "01:22:03", payload: { text: "Anecdote Assemblée" }, author_email: "clemence@stefani.fr" }),
    ev({ kind: "note", timecode: "50:00", payload: { text: "vérifier le chiffre cité" } }),
    ev({ kind: "chat", timecode: "12:00", payload: { text: "monte le son" }, author_email: "clemence@stefani.fr" }),
  ];

  it("objet exact : Notes épisode {Prénom Nom}", () => {
    expect(buildNotesEmail(fiche, session, events).subject).toBe("Notes épisode Yaël Braun-Pivet");
  });

  it("porte timecodes, auteurs, sections et lien fiche", () => {
    const { html } = buildNotesEmail(fiche, session, events);
    expect(html).toContain("45:12");
    expect(html).toContain("01:22:03");
    expect(html).toContain("MATT");
    expect(html).toContain("CLEMENCE");
    expect(html).toContain("Moments clés et clips (2)");
    expect(html).toContain("Notes (1)");
    expect(html).toContain("Régie (1)");
    expect(html).toContain("/fiches/yael-braun-pivet#carnet");
    expect(html).toContain("185 min"); // durée de la session
  });

  it("échappe le HTML des saisies (anti-injection)", () => {
    const piege = [ev({ kind: "note", payload: { text: "<script>alert(1)</script>" } })];
    expect(buildNotesEmail(fiche, session, piege).html).not.toContain("<script>alert(1)</script>");
  });

  it("session sans saisie : le mail le dit au lieu de sections vides", () => {
    expect(buildNotesEmail(fiche, session, []).html).toContain("Aucune saisie pendant cette session.");
  });

  it("destinataires par configuration uniquement, jamais en dur", () => {
    delete process.env.NOTES_EPISODE_EMAILS;
    delete process.env.NOTES_EPISODE_CC;
    expect(notesRecipients()).toEqual({ to: [], cc: [] });
    process.env.NOTES_EPISODE_EMAILS = "a@collision.studio, b@collision.studio";
    process.env.NOTES_EPISODE_CC = "c@stefani.fr";
    expect(notesRecipients()).toEqual({ to: ["a@collision.studio", "b@collision.studio"], cc: ["c@stefani.fr"] });
  });

  it("le carnet d'une session ne contient que ses événements", () => {
    const flux = [...events, ev({ session_id: null }), ev({ session_id: "s2" })];
    expect(eventsOfSession(flux, session).length).toBe(events.length);
  });
});
