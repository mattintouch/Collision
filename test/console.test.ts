import { describe, it, expect } from "vitest";
import {
  labelFromEmail, reduceChecked, reduceAsked, carnetOf, chatOf,
  timecodeAt, timeLabel, mergeEvent, dernierLu, chatNonLus,
  saisiesEnCours, SAISIE_FRAICHEUR_MS,
  type ConsoleEvent, type RecSession, type PresenceOperateur,
} from "../src/lib/fiche/console";

const ev = (over: Partial<ConsoleEvent>): ConsoleEvent => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  session_id: null,
  created_at: "2026-07-20T10:00:00Z",
  author_email: "clemence@stefani.fr",
  kind: "note",
  timecode: null,
  payload: {},
  ...over,
});

describe("console partagée (lot A) — identité", () => {
  it("le libellé vient de l'email de session, jamais d'une constante", () => {
    expect(labelFromEmail("clemence@stefani.fr")).toBe("CLEMENCE");
    expect(labelFromEmail("matt@stefani.fr")).toBe("MATT");
    expect(labelFromEmail("")).toBe("ÉQUIPE");
    expect(labelFromEmail(null)).toBe("ÉQUIPE");
  });
});

describe("console partagée — réduction du flux d'événements", () => {
  it("checklist : le dernier événement par case gagne", () => {
    const flux = [
      ev({ kind: "check", payload: { index: 0, checked: true } }),
      ev({ kind: "check", payload: { index: 1, checked: true } }),
      ev({ kind: "check", payload: { index: 0, checked: false } }),
    ];
    expect(reduceChecked(flux)).toEqual({ 0: false, 1: true });
  });

  it("questions : pose et dépose, timecode conservé à la pose", () => {
    const flux = [
      ev({ kind: "question", timecode: "12:30", payload: { num: "01", asked: true } }),
      ev({ kind: "question", payload: { num: "02", asked: true } }),
      ev({ kind: "question", payload: { num: "02", asked: false } }),
    ];
    const { asked, askedAt } = reduceAsked(flux);
    expect(asked).toEqual({ "01": true, "02": false });
    expect(askedAt["01"]).toBe("12:30");
    expect(askedAt["02"]).toBe("");
  });

  it("carnet et régie filtrent le flux par kind", () => {
    const flux = [
      ev({ kind: "clip", payload: { text: "Moment fort marqué" } }),
      ev({ kind: "chat", payload: { text: "monte le son" } }),
      ev({ kind: "note", payload: { text: "belle anecdote" } }),
      ev({ kind: "check", payload: { index: 0, checked: true } }),
    ];
    expect(carnetOf(flux).map((e) => e.kind)).toEqual(["clip", "note"]);
    expect(chatOf(flux).map((e) => e.kind)).toEqual(["chat"]);
  });

  it("mergeEvent dédoublonne par id (écho realtime après ajout optimiste)", () => {
    const a = ev({ id: "x", created_at: "2026-07-20T10:00:01Z" });
    const b = ev({ id: "y", created_at: "2026-07-20T10:00:00Z" });
    const fusion = mergeEvent(mergeEvent([a], b), ev({ id: "x" }));
    expect(fusion.map((e) => e.id)).toEqual(["y", "x"]);
  });
});

describe("console partagée — temps", () => {
  const session: RecSession = {
    id: "s1",
    started_at: "2026-07-20T10:00:00Z",
    ended_at: "2026-07-20T13:00:00Z",
    started_by: "matt@stefani.fr",
    ended_by: "matt@stefani.fr",
  };

  it("timecode relatif au début du REC (hh:mm:ss au delà de l'heure)", () => {
    expect(timecodeAt(session, Date.parse("2026-07-20T10:12:30Z"))).toBe("12:30");
    expect(timecodeAt(session, Date.parse("2026-07-20T12:05:07Z"))).toBe("02:05:07");
  });

  it("une saisie après la clôture est marquée APRÈS REC (A2.3)", () => {
    const pendant = ev({ timecode: "45:00", created_at: "2026-07-20T10:45:00Z" });
    const apres = ev({ timecode: null, created_at: "2026-07-20T13:10:00Z" });
    expect(timeLabel(pendant, [session])).toBe("45:00");
    expect(timeLabel(apres, [session])).toBe("APRÈS REC");
  });

  it("hors de toute session : heure murale, pas de timecode", () => {
    const avant = ev({ timecode: null, created_at: "2026-07-20T08:30:00Z" });
    expect(timeLabel(avant, [session])).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("console partagée — dernier-lu par opérateur (tâche 8)", () => {
  const flux: ConsoleEvent[] = [
    ev({ kind: "chat", created_at: "2026-07-24T10:00:00Z", author_email: "matt@stefani.fr", payload: { text: "un" } }),
    ev({ kind: "lu", created_at: "2026-07-24T10:00:30Z", author_email: "clemence@stefani.fr", payload: { jusqu_a: "2026-07-24T10:00:00Z" } }),
    ev({ kind: "chat", created_at: "2026-07-24T10:01:00Z", author_email: "matt@stefani.fr", payload: { text: "deux" } }),
    ev({ kind: "chat", created_at: "2026-07-24T10:02:00Z", author_email: "clemence@stefani.fr", payload: { text: "trois" } }),
  ];

  it("la borne de lecture est PAR compte, la plus récente gagne", () => {
    expect(dernierLu(flux, "clemence@stefani.fr")).toBe("2026-07-24T10:00:00Z");
    expect(dernierLu(flux, "matt@stefani.fr")).toBe("");
  });

  it("les non lus excluent ses propres messages et ce qui précède la borne", () => {
    const pourClemence = chatNonLus(flux, "clemence@stefani.fr");
    expect(pourClemence.map((e) => e.payload.text)).toEqual(["deux"]);
    const pourMatt = chatNonLus(flux, "matt@stefani.fr");
    expect(pourMatt.map((e) => e.payload.text)).toEqual(["trois"]);
  });

  it("les événements lu ne polluent ni le carnet ni la régie", () => {
    expect(chatOf(flux).length).toBe(3);
    expect(carnetOf(flux).length).toBe(0);
  });
});

describe("alerte de saisie pendant le REC (demande C2 du 27/07)", () => {
  const now = Date.parse("2026-07-27T10:00:00Z");
  const frais = new Date(now - 1000).toISOString();
  const perime = new Date(now - SAISIE_FRAICHEUR_MS - 200).toISOString();
  const p = (email: string, typing_at?: string | null): PresenceOperateur => ({ email, typing_at });

  it("scénario nominal : la saisie fraîche d'un opérateur distant s'affiche", () => {
    const presences = [p("matt@stefani.fr"), p("clemence@stefani.fr", frais)];
    expect(saisiesEnCours(presences, "matt@stefani.fr", true, now)).toEqual(["CLEMENCE"]);
  });

  it("aucun faux positif hors REC, quelle que soit l'activité", () => {
    const presences = [p("clemence@stefani.fr", frais)];
    expect(saisiesEnCours(presences, "matt@stefani.fr", false, now)).toEqual([]);
  });

  it("sa propre saisie ne déclenche jamais son propre bandeau", () => {
    const presences = [p("matt@stefani.fr", frais)];
    expect(saisiesEnCours(presences, "matt@stefani.fr", true, now)).toEqual([]);
  });

  it("un signal périmé s'éteint même si le retour à null s'est perdu", () => {
    const presences = [p("clemence@stefani.fr", perime)];
    expect(saisiesEnCours(presences, "matt@stefani.fr", true, now)).toEqual([]);
  });

  it("plusieurs opérateurs simultanés : tous les libellés, dédoublonnés", () => {
    const presences = [
      p("clemence@stefani.fr", frais),
      p("louis@collision.studio", frais),
      p("clemence@stefani.fr", frais), // second onglet du même compte
    ];
    expect(saisiesEnCours(presences, "matt@stefani.fr", true, now)).toEqual(["CLEMENCE", "LOUIS"]);
  });

  it("rétrocompatibilité : un payload de présence sans typing_at est ignoré", () => {
    const presences = [p("clemence@stefani.fr"), p("louis@collision.studio", null)];
    expect(saisiesEnCours(presences, "matt@stefani.fr", true, now)).toEqual([]);
  });
});

describe("liens cliquables dans la régie et le carnet (incident du 30/07)", () => {
  it("découpe un message en segments texte et lien", async () => {
    const { segmentsAvecLiens } = await import("../src/lib/fiche/console");
    const segments = segmentsAvecLiens("regarde https://gdiy.fr/episode-450 avant la question");
    expect(segments).toEqual([
      { type: "texte", valeur: "regarde " },
      { type: "lien", valeur: "https://gdiy.fr/episode-450" },
      { type: "texte", valeur: " avant la question" },
    ]);
  });

  it("la ponctuation finale collée à l'URL reste du texte", async () => {
    const { segmentsAvecLiens } = await import("../src/lib/fiche/console");
    const segments = segmentsAvecLiens("vois https://x.fr/page.");
    expect(segments[1]).toEqual({ type: "lien", valeur: "https://x.fr/page" });
    expect(segments[2]).toEqual({ type: "texte", valeur: "." });
  });

  it("un message sans URL reste un seul segment texte, deux URLs donnent deux liens", async () => {
    const { segmentsAvecLiens } = await import("../src/lib/fiche/console");
    expect(segmentsAvecLiens("monte le son")).toEqual([{ type: "texte", valeur: "monte le son" }]);
    const deux = segmentsAvecLiens("https://a.fr et https://b.fr");
    expect(deux.filter((s) => s.type === "lien").map((s) => s.valeur)).toEqual(["https://a.fr", "https://b.fr"]);
  });
});
