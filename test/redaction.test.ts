import { describe, it, expect } from "vitest";
import { appliquerRedaction, itemsHorsBudget, SECTIONS_REDACTIBLES } from "../src/lib/fiche/redaction";
import { FICHE_GROUPES } from "../src/lib/fiche/generation";
import { BUDGETS_V3, SECTION_CONTRACTS } from "../src/lib/fiche/schema";

describe("contrat v3 — passe de rédaction (règle 4)", () => {
  it("la rédaction est le cinquième groupe, exécuté après les recherches", () => {
    expect(FICHE_GROUPES).toContain("redaction");
    expect(FICHE_GROUPES[FICHE_GROUPES.length - 1]).toBe("redaction");
  });

  it("n'écrit que les sections rédactibles (jamais le chrome ni les questions réseaux)", () => {
    const admis = appliquerRedaction(
      { parcours: { lignes: [{ annee: "2015", texte: "x" }] } },
      {
        parcours: { lignes: [{ annee: "2015", texte: "x" }] },
        entete: { titre_lignes: ["PIRATE"] },
        questions_reseaux: { questions: [] },
        footer: { texte: "PIRATE" },
      }
    );
    expect(Object.keys(admis)).toEqual(["parcours"]);
    expect(SECTIONS_REDACTIBLES).not.toContain("questions_reseaux");
  });

  it("refuse de VIDER une section qui avait du contenu (la passe condense, elle ne détruit pas)", () => {
    const actuel = { playbook: { items: [{ titre: "Levier" }] } };
    const admis = appliquerRedaction(actuel, { playbook: { items: [] } });
    expect(admis.playbook).toBeUndefined();
  });

  it("re-clampe les budgets v3 (défense en profondeur)", () => {
    const beaucoup = Array.from({ length: 20 }, (_, i) => ({ annee: String(2000 + i), texte: `ligne ${i}` }));
    const admis = appliquerRedaction(
      { parcours: { lignes: beaucoup }, playbook: { items: beaucoup }, a_lire: { liens: beaucoup } },
      { parcours: { lignes: beaucoup }, playbook: { items: beaucoup }, a_lire: { liens: beaucoup } }
    );
    expect((admis.parcours.lignes as unknown[]).length).toBe(BUDGETS_V3.parcours_lignes);
    expect((admis.playbook.items as unknown[]).length).toBe(BUDGETS_V3.playbook_items);
    expect((admis.a_lire.liens as unknown[]).length).toBe(BUDGETS_V3.a_lire_sources);
  });

  it("retire la timeline biographique de l'univers quoi que propose le modèle (règle 1)", () => {
    const admis = appliquerRedaction(
      { univers: { intro: ["marché"] } },
      { univers: { intro: ["marché"], timeline: { titre: "Bascules", jalons: [{ annee: "12" }] } } }
    );
    expect(admis.univers.timeline).toBeUndefined();
    expect(admis.univers.intro).toEqual(["marché"]);
  });

  it("récit : 5 paragraphes maximum (correctif du 27/07)", () => {
    const long = Array.from({ length: 15 }, (_, i) => `paragraphe ${i}`);
    const admis = appliquerRedaction({ recit_canonique: { paragraphes: ["a"] } }, { recit_canonique: { paragraphes: long } });
    expect((admis.recit_canonique.paragraphes as unknown[]).length).toBe(BUDGETS_V3.recit_paragraphes);
  });
});

describe("v3.1 item 3 — champs de titre et noms propres", () => {
  it("l'entête n'est corrigeable QUE sur sous_titre et societe, le reste est préservé", () => {
    const actuel = {
      entete: {
        numero: "612",
        titre_lignes: ["Cyril", "Benzaquen"],
        sous_titre: "Septuple champion du monde",
        pilules: ["MAR 22 SEPT"],
        liens: [{ label: "LinkedIn", url: "https://l" }],
      },
    };
    const admis = appliquerRedaction(actuel, {
      entete: {
        sous_titre: "Octuple champion du monde",
        numero: "999",
        titre_lignes: ["PIRATE"],
        pilules: ["PIRATE"],
        liens: [],
      },
    });
    expect(admis.entete.sous_titre).toBe("Octuple champion du monde");
    expect(admis.entete.numero).toBe("612");
    expect(admis.entete.titre_lignes).toEqual(["Cyril", "Benzaquen"]);
    expect(admis.entete.pilules).toEqual(["MAR 22 SEPT"]);
    expect((admis.entete.liens as unknown[]).length).toBe(1);
  });

  it("bandeau : seule la societe est corrigeable, et rien ne s'écrit sans changement réel", () => {
    const actuel = { sticky_header: { societe: "Fightclub" } };
    expect(appliquerRedaction(actuel, { sticky_header: { societe: "Fightclub" } })).toEqual({});
    const admis = appliquerRedaction(actuel, { sticky_header: { societe: "Fight Club Paris" } });
    expect(admis.sticky_header.societe).toBe("Fight Club Paris");
  });
});

describe("contrat v3 — contrôle du format scannable (règle 3)", () => {
  it("signale les items du Bloc B au delà de 3 lignes, ignore le Bloc A", () => {
    const pave = "x".repeat(BUDGETS_V3.bloc_b_item_chars + 50);
    const res = itemsHorsBudget({
      playbook: { items: [{ titre: "ok", connu: pave }] },
      parcours: { lignes: [{ annee: "2015", texte: "court" }] },
      recit_canonique: { paragraphes: [pave] }, // Bloc A : la prose d'ouverture n'est pas concernée
    });
    expect(res.length).toBe(1);
    expect(res[0]).toContain("playbook");
  });
});

describe("contrat v3 — contrats de section (règle 2, contrainte technique 3)", () => {
  it("les contrats reflètent budgets et propriété des faits pour update_section manuel", () => {
    const contrats = JSON.stringify(SECTION_CONTRACTS);
    expect(JSON.stringify(SECTION_CONTRACTS.parcours)).toContain("12 lignes maximum");
    expect(JSON.stringify(SECTION_CONTRACTS.recit_canonique)).toContain("5 paragraphes MAXIMUM");
    expect(JSON.stringify(SECTION_CONTRACTS.a_lire)).toContain("3 sources MAXIMUM");
    expect(JSON.stringify(SECTION_CONTRACTS.playbook)).toContain("Six leviers maximum");
    // La timeline biographique n'est plus au contrat de l'univers.
    expect(JSON.stringify(SECTION_CONTRACTS.univers)).not.toContain("timeline");
    expect(contrats).toContain("contrat v3");
  });
});

describe("règle 5 en pipeline — consignes du lint pour la passe", () => {
  it("les doublons du lint deviennent des consignes explicites de résorption", async () => {
    const { consignesLint } = await import("../src/lib/fiche/redaction");
    const consignes = consignesLint({
      doublons: [{ extrait: "gautier est vendeen pas choletais il sponsorisait le centre de formation de", sections: ["sequencage", "zone_grise"], proprietaire: "zone_grise" }],
      chiffres_repetes: [{ valeur: "238 M$", occurrences: 4, sections: ["enjeu", "playbook", "recit_canonique"] }],
      hors_budget: ["sequencage.blocs[2].rappel : 270 caractères, budget 140"],
      meta_narratif: [{ section: "sequencage", extrait: "RECADRAGE DU 27/07" }],
      questions_doublons: [{ question: "Raconte le moment où tu t'es dit j'étais pas bon", endroits: ["dix_questions[4]", "questions_reseaux[1]"] }],
      bloquants: 4,
    });
    expect(consignes).toContain("DOUBLONS DÉTECTÉS PAR LE LINT");
    expect(consignes).toContain("propriétaire : zone_grise");
    expect(consignes).toContain("238 M$ : 4 occurrences");
    expect(consignes).toContain("MÉTA NARRATIF À RETIRER");
    expect(consignes).toContain("budget 140");
    expect(consignes).toContain("QUESTIONS EN DOUBLE");
    expect(consignes).toContain("dix_questions[4], questions_reseaux[1]");
  });

  it("aucune consigne quand le lint est propre", async () => {
    const { consignesLint } = await import("../src/lib/fiche/redaction");
    expect(consignesLint({ doublons: [], chiffres_repetes: [], hors_budget: [], meta_narratif: [], questions_doublons: [], bloquants: 0 })).toBe("");
  });
});

describe("refonte conversation (27/07) — le déroulé est supprimé", () => {
  it("la passe de rédaction ne touche plus jamais le séquençage", async () => {
    expect(SECTIONS_REDACTIBLES).not.toContain("sequencage");
    const admis = appliquerRedaction({}, { sequencage: { blocs: [{ titre: "PIRATE" }] } });
    expect(admis.sequencage).toBeUndefined();
  });

  it("le catalogue relègue les lectures en annexe, après la zone grise, avant les sources", async () => {
    const { sectionPosition, FICHE_SECTIONS } = await import("../src/lib/fiche/sections");
    expect(sectionPosition("a_lire")).toBeGreaterThan(sectionPosition("zone_grise"));
    expect(sectionPosition("a_lire")).toBeLessThan(sectionPosition("sources"));
    expect(FICHE_SECTIONS.find((s) => s.id === "a_lire")?.titre).toBe("À lire la veille");
    expect(FICHE_SECTIONS.find((s) => s.id === "sequencage")?.role).toContain("RETIRÉ");
    expect(FICHE_SECTIONS.find((s) => s.id === "dix_questions")?.titre).toBe("Les questions");
  });
});

describe("refonte du 30/07 — TL;DR et polémiques dans la passe", () => {
  it("la passe peut écrire tldr et polemiques, jamais les clips", () => {
    expect(SECTIONS_REDACTIBLES).toContain("tldr");
    expect(SECTIONS_REDACTIBLES).toContain("polemiques");
    expect(SECTIONS_REDACTIBLES).not.toContain("questions_reseaux");
    const admis = appliquerRedaction({}, {
      tldr: { items: ["l'essentiel en une ligne"] },
      polemiques: { items: [{ texte: "fait public daté", source: "presse 2024", question: "la question frontale" }] },
      questions_reseaux: { questions: [{ question: "PIRATE" }] },
    });
    expect(admis.tldr).toEqual({ items: ["l'essentiel en une ligne"] });
    expect((admis.polemiques.items as unknown[]).length).toBe(1);
    expect(admis.questions_reseaux).toBeUndefined();
  });

  it("les comptes du TL;DR et des polémiques sont re-clampés", () => {
    const admis = appliquerRedaction({}, {
      tldr: { items: Array.from({ length: 9 }, () => "x") },
      polemiques: { items: Array.from({ length: 7 }, () => ({ texte: "t" })) },
    });
    expect((admis.tldr.items as unknown[]).length).toBe(5);
    expect((admis.polemiques.items as unknown[]).length).toBe(4);
  });
});
