import { describe, it, expect } from "vitest";
import { depassementsBudget, estResiduGabarit, purgeResidusGabarit, BUDGETS_V3 } from "../src/lib/fiche/schema";

describe("refus explicite des dépassements de budget (brief 07/09, item 7)", () => {
  it("une note tactique au-delà de 200 caractères est listée comme dépassement", () => {
    const longue = "x".repeat(BUDGETS_V3.topic_note_chars + 50);
    const dep = depassementsBudget("topics", {
      topics: [{ titre: "T", questions: [{ num: "01", texte: "q", note: longue }] }],
    });
    expect(dep).toHaveLength(1);
    expect(dep[0]).toContain("note");
    expect(dep[0]).toContain(String(BUDGETS_V3.topic_note_chars));
  });

  it("un contenu dans les budgets ne remonte aucun dépassement", () => {
    const dep = depassementsBudget("topics", {
      topics: [{ titre: "T", intention: "courte", questions: [{ num: "01", texte: "q", note: "consigne courte" }] }],
    });
    expect(dep).toEqual([]);
  });

  it("l'avertissement tldr « à réécrire, pas tronqué » n'est PAS un motif de refus", () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, texte: "x".repeat(200) }));
    const dep = depassementsBudget("tldr", { items });
    expect(dep.every((d) => !d.includes("à réécrire"))).toBe(true);
  });
});

describe("purge des résidus de gabarit (brief 07/09, item 9)", () => {
  it("estResiduGabarit reconnaît un placeholder pur et rien d'autre", () => {
    expect(estResiduGabarit("{titre}")).toBe(true);
    expect(estResiduGabarit("  {valeur_2024}  ")).toBe(true);
    expect(estResiduGabarit("le {titre} du film")).toBe(false);
    expect(estResiduGabarit("{}")).toBe(false);
    expect(estResiduGabarit(42)).toBe(false);
  });

  it("une question dont le texte est un placeholder disparaît entièrement", () => {
    const { content, retraits } = purgeResidusGabarit({
      topics: [
        {
          titre: "Brique",
          questions: [
            { num: "01", texte: "vraie question" },
            { num: "02", texte: "{titre}" },
          ],
        },
      ],
    });
    const topics = content.topics as { questions: { texte: string }[] }[];
    expect(topics[0].questions).toHaveLength(1);
    expect(topics[0].questions[0].texte).toBe("vraie question");
    expect(retraits).toHaveLength(1);
    expect(retraits[0]).toContain("{titre}");
  });

  it("une chaîne placeholder disparaît de sa liste, un champ placeholder de son objet", () => {
    const { content, retraits } = purgeResidusGabarit({
      topics: [
        {
          titre: "Brique",
          contexte: "{contexte}",
          dates: ["Avril 2012 : Le Prénom", "{date}"],
          questions: [{ num: "01", texte: "q" }],
        },
      ],
    });
    const t = (content.topics as Record<string, unknown>[])[0];
    expect(t.contexte).toBeUndefined();
    expect(t.dates).toEqual(["Avril 2012 : Le Prénom"]);
    expect(retraits).toHaveLength(2);
  });

  it("un contenu propre ressort identique, sans retrait", () => {
    const propre = {
      terrain_connu: [{ question: "q", reponse: "r" }],
      topics: [{ titre: "T", hero: { valeur: "60 M€", libelle: "CA" }, questions: [{ num: "01", texte: "q", clip: true }] }],
    };
    const { content, retraits } = purgeResidusGabarit(propre);
    expect(content).toEqual(propre);
    expect(retraits).toEqual([]);
  });
});
