import { describe, it, expect } from "vitest";
import {
  briquesVides,
  renumeroteQuestions,
  messageEchecAppel,
  blocLangue,
  BRIQUE_RESERVE_MS,
  SQUELETTE_MAX_TOKENS,
  BRIQUE_MAX_TOKENS,
  DEROULE_RESERVE_MS,
} from "../src/lib/fiche/generation";

describe("scission du deroule (brief 07/09)", () => {
  it("les plafonds de sortie sont petits par construction (aucun appel ne peut déborder son budget)", () => {
    expect(SQUELETTE_MAX_TOKENS).toBeLessThanOrEqual(4096);
    expect(BRIQUE_MAX_TOKENS).toBeLessThanOrEqual(4096);
    expect(BRIQUE_RESERVE_MS).toBeLessThan(DEROULE_RESERVE_MS);
  });

  it("briquesVides ne retient que les briques sans question (la reprise ne rejoue que le manquant)", () => {
    const topics = [
      { titre: "Remplie", questions: [{ num: "01", texte: "q" }] },
      { titre: "Vide", questions: [] },
      { titre: "Sans champ questions" },
      { titre: "Remplie aussi", questions: [{ texte: "q2" }] },
    ];
    expect(briquesVides(topics)).toEqual([1, 2]);
    expect(briquesVides(undefined)).toEqual([]);
    expect(briquesVides("pas une liste")).toEqual([]);
  });

  it("une brique saisie à la main (questions présentes) n'est jamais rejouée", () => {
    const manuel = [{ titre: "Topic manuel", questions: [{ num: "01", texte: "question posée à la main", note: "CONSIGNE AGENCE" }] }];
    expect(briquesVides(manuel)).toEqual([]);
  });

  it("renumeroteQuestions impose la numérotation continue 01, 02... sur toute la fiche", () => {
    const contenu = {
      terrain_connu: [{ question: "t" }],
      topics: [
        { titre: "A", questions: [{ texte: "a1" }, { texte: "a2", clip: true }] },
        { titre: "B", questions: [] },
        { titre: "C", questions: [{ num: "99", texte: "c1" }] },
      ],
    };
    const apres = renumeroteQuestions(contenu);
    const topics = apres.topics as { questions: { num?: string; texte: string; clip?: boolean }[] }[];
    expect(topics[0].questions.map((q) => q.num)).toEqual(["01", "02"]);
    expect(topics[2].questions.map((q) => q.num)).toEqual(["03"]);
    // Le reste du contenu est préservé tel quel.
    expect(topics[0].questions[1].clip).toBe(true);
    expect(apres.terrain_connu).toEqual(contenu.terrain_connu);
  });

  it("messageEchecAppel distingue la limite de tokens (chiffrée) du JSON illisible", () => {
    const usage = { tokens_in: 12000, tokens_out: 3000, searches: 2 };
    const coupe = messageEchecAppel("brique « Test »", { text: "{...", stop: "max_tokens", usage }, 3000);
    expect(coupe).toContain("limite de tokens");
    expect(coupe).toContain("plafond 3000");
    expect(coupe).toContain("3000 tokens rendus");
    const illisible = messageEchecAppel("brique « Test »", { text: "du texte sans JSON", stop: "end_turn", usage }, 3000);
    expect(illisible).toContain("JSON illisible");
    expect(illisible).toContain("end_turn");
  });
});

describe("langue de la fiche (brief 07/09, item 6)", () => {
  it("blocLangue est vide en français (aucun octet ajouté aux prompts existants)", () => {
    expect(blocLangue("fr")).toBe("");
  });

  it("blocLangue en anglais impose la langue du contenu sans traduire les clés JSON", () => {
    const bloc = blocLangue("en");
    expect(bloc).toContain("ANGLAIS");
    expect(bloc.toLowerCase()).toContain("anglais");
    expect(bloc).toContain("clés JSON");
  });
});
