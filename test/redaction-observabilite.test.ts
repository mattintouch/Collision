import { describe, it, expect } from "vitest";
import {
  ORDRE_REDACTION,
  REDACTION_REPRISE_MAX_MS,
  cleRedactionEnCours,
  doitPurgerMarqueurRedaction,
  etapesExposees,
  planDepuisJson,
  reprisePossible,
  type MarqueurRedaction,
} from "../src/lib/fiche/redaction";

const now = Date.parse("2026-09-13T10:00:00Z");
const plan = planDepuisJson({});

const marqueur = (extra: Partial<MarqueurRedaction> = {}): MarqueurRedaction => ({
  plan,
  faites: [],
  rapport: {},
  started_at: "2026-09-13T09:30:00Z",
  ...extra,
});

describe("sémantique de relance : purge du marqueur de reprise (point 4, brief du 13/09)", () => {
  it("forcer purge le marqueur quand redaction fait partie des groupes remis en file", () => {
    expect(doitPurgerMarqueurRedaction({ groupes: ["redaction"], forcer: true })).toBe(true);
    expect(doitPurgerMarqueurRedaction({ groupes: ["angles", "synthese", "redaction"], forcer: true })).toBe(true);
  });

  it("forcer sans le groupe redaction ne purge rien (le marqueur ne concerne que la rédaction)", () => {
    expect(doitPurgerMarqueurRedaction({ groupes: ["angles", "synthese"], forcer: true })).toBe(false);
  });

  it("sans forcer, la relance seule ne purge pas : seules les étapes manquantes rejouent", () => {
    expect(doitPurgerMarqueurRedaction({ groupes: ["redaction"] })).toBe(false);
    expect(doitPurgerMarqueurRedaction({ groupes: ["redaction"], forcer: false })).toBe(false);
  });

  it("un changement de langue ou une réinitialisation purgent toujours, forcer ou pas", () => {
    expect(doitPurgerMarqueurRedaction({ groupes: ["deroule"], langueEcrite: true })).toBe(true);
    expect(doitPurgerMarqueurRedaction({ groupes: ["deroule"], reinitialisees: 1 })).toBe(true);
    expect(doitPurgerMarqueurRedaction({ groupes: ["deroule"], reinitialisees: 0 })).toBe(false);
  });
});

describe("observabilité de la passe scindée (point 5, brief du 13/09)", () => {
  it("marqueur absent, invalide ou périmé : aucune étape exposée (null)", () => {
    expect(etapesExposees(null, now)).toBeNull();
    expect(etapesExposees("texte", now)).toBeNull();
    expect(etapesExposees({ faites: [] }, now)).toBeNull();
    const perime = marqueur({ started_at: new Date(now - REDACTION_REPRISE_MAX_MS - 1000).toISOString() });
    expect(etapesExposees(perime, now)).toBeNull();
  });

  it("expose le plan puis les étapes prévues, avec statut et horodatage depuis l'historique", () => {
    const m = marqueur({
      etapes: ["data", "topics", "tldr"],
      faites: ["data"],
      historique: [
        { etape: "plan", statut: "done", quand: "2026-09-13T09:30:05Z" },
        { etape: "data", statut: "done", quand: "2026-09-13T09:31:00Z" },
        { etape: "topics", statut: "failed", quand: "2026-09-13T09:33:00Z", erreur: "sortie coupée par la limite de tokens" },
      ],
    });
    expect(etapesExposees(m, now)).toEqual([
      { etape: "plan", statut: "done", quand: "2026-09-13T09:30:05Z" },
      { etape: "data", statut: "done", quand: "2026-09-13T09:31:00Z" },
      { etape: "topics", statut: "failed", quand: "2026-09-13T09:33:00Z", erreur: "sortie coupée par la limite de tokens" },
      { etape: "tldr", statut: "pending" },
    ]);
  });

  it("un rejeu réussi d'une étape échouée gagne sur l'échec précédent (la plus récente)", () => {
    const m = marqueur({
      etapes: ["data"],
      faites: ["data"],
      historique: [
        { etape: "data", statut: "failed", quand: "2026-09-13T09:31:00Z", erreur: "x" },
        { etape: "data", statut: "done", quand: "2026-09-13T09:40:00Z" },
      ],
    });
    const expose = etapesExposees(m, now)!;
    const data = expose.find((e) => e.etape === "data")!;
    expect(data.statut).toBe("done");
    expect(data.erreur).toBeUndefined();
  });

  it("compatible avec un marqueur d'avant le 13/09 (ni etapes ni historique)", () => {
    const ancien = marqueur({ faites: ["data", "revue_de_presse"] });
    const expose = etapesExposees(ancien, now)!;
    expect(expose[0]).toEqual({ etape: "plan", statut: "done" });
    expect(expose.map((e) => e.etape)).toEqual(["plan", ...ORDRE_REDACTION]);
    expect(expose.find((e) => e.etape === "data")!.statut).toBe("done");
    expect(expose.find((e) => e.etape === "tldr")!.statut).toBe("pending");
  });

  it("reprisePossible accepte un marqueur enrichi (etapes + historique) : pas de régression de reprise", () => {
    const m = marqueur({
      etapes: ["data", "tldr"],
      historique: [{ etape: "plan", statut: "done", quand: "2026-09-13T09:30:05Z" }],
      started_at: new Date(now - 60_000).toISOString(),
    });
    expect(reprisePossible(m, now)).toBe(true);
  });

  it("la clé du marqueur reste stable (le journal et la purge lisent la même)", () => {
    expect(cleRedactionEnCours("abc")).toBe("redaction_en_cours:abc");
  });
});
