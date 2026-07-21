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

  it("récit : 1 ouverture + 7 temps maximum", () => {
    const long = Array.from({ length: 15 }, (_, i) => `paragraphe ${i}`);
    const admis = appliquerRedaction({ recit_canonique: { paragraphes: ["a"] } }, { recit_canonique: { paragraphes: long } });
    expect((admis.recit_canonique.paragraphes as unknown[]).length).toBe(BUDGETS_V3.recit_ouverture + BUDGETS_V3.recit_temps);
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
    expect(JSON.stringify(SECTION_CONTRACTS.recit_canonique)).toContain("7 temps MAXIMUM");
    expect(JSON.stringify(SECTION_CONTRACTS.a_lire)).toContain("3 sources MAXIMUM");
    expect(JSON.stringify(SECTION_CONTRACTS.playbook)).toContain("Six leviers maximum");
    // La timeline biographique n'est plus au contrat de l'univers.
    expect(JSON.stringify(SECTION_CONTRACTS.univers)).not.toContain("timeline");
    expect(contrats).toContain("contrat v3");
  });
});
