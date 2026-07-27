import { describe, it, expect } from "vitest";
import { lintFiche } from "../src/lib/fiche/lint";
import { clampBudgets, BUDGETS_V3 } from "../src/lib/fiche/schema";

// Symptômes de référence (fiche rudy-gobert v44+) : la même consigne de zone
// grise recopiée dans les rappels du séquençage et les notes des questions,
// les mêmes chiffres (72 votes, 238 M$) dans 5 sections.
const CONSIGNE = "Gautier est vendéen, pas choletais ; il sponsorisait le centre de formation de Cholet Basket. Redressement judiciaire juillet 2024, ligne de 14 M€ avec une quinzaine de familles.";

describe("lint anti répétition (règle 5) — doublons de séquences", () => {
  it("détecte une séquence de 12 mots recopiée dans 2 sections ou plus, avec la propriétaire", () => {
    const rapport = lintFiche({
      zone_grise: { items: [{ texte: CONSIGNE }] },
      sequencage: { blocs: [{ debut_min: 0, fin_min: 20, court: "x", titre: "y", rappel: CONSIGNE }] },
      dix_questions: { questions: [{ texte: "q", note: CONSIGNE }] },
    });
    expect(rapport.doublons.length).toBeGreaterThan(0);
    const d = rapport.doublons[0];
    expect(d.sections).toEqual(["dix_questions", "sequencage", "zone_grise"]);
    expect(d.proprietaire).toBe("zone_grise");
    expect(rapport.bloquants).toBeGreaterThan(0);
  });

  it("ne flague pas deux sections aux textes distincts", () => {
    const rapport = lintFiche({
      enjeu: { texte: "Le fil rouge de l'épisode est la reconquête du sommet après une défaite fondatrice au plus haut niveau mondial." },
      playbook: { items: [{ titre: "La défense comme système", connu: "Un protocole de récupération quantifié sur dix ans de carrière professionnelle au plus haut niveau." }] },
    });
    expect(rapport.doublons).toEqual([]);
  });
});

describe("lint anti répétition — chiffres remarquables", () => {
  it("un chiffre présent plus de 2 fois HORS section chiffres est bloquant", () => {
    const rapport = lintFiche({
      chiffres: { kpis: [{ valeur: "238 M$", libelle: "contrat" }] },
      enjeu: { texte: "Le contrat de 238 M$ a tout changé." },
      recit_canonique: { paragraphes: ["Signature du contrat de 238 M$ en 2022."] },
      playbook: { items: [{ titre: "x", connu: "Le levier des 238 M$." }] },
    });
    expect(rapport.chiffres_repetes.length).toBe(1);
    expect(rapport.chiffres_repetes[0].occurrences).toBe(3);
    expect(rapport.chiffres_repetes[0].sections).not.toContain("chiffres");
  });

  it("deux occurrences hors chiffres passent, et les années seules sont ignorées", () => {
    const rapport = lintFiche({
      enjeu: { texte: "En 2015 il gagne 108,4 de rating." },
      recit_canonique: { paragraphes: ["En 2015 encore, en 2016, en 2017 : rating 108,4."] },
    });
    expect(rapport.chiffres_repetes).toEqual([]);
  });
});

describe("lint anti répétition — méta narratif (règle 3)", () => {
  it("détecte l'historique de modifications dans le contenu", () => {
    const rapport = lintFiche({
      sequencage: { blocs: [{ debut_min: 0, fin_min: 10, court: "x", titre: "y", intention: "RECADRAGE DU 27/07 : la version précédente de cette section surestimait le rôle du club." }] },
    });
    expect(rapport.meta_narratif.length).toBe(1);
    expect(rapport.meta_narratif[0].section).toBe("sequencage");
  });
});

describe("budgets serveur (règle 2) — clampBudgets", () => {
  it("tronque un rappel de séquençage au delà de 140 caractères, avec avertissement", () => {
    const long = "Un rappel beaucoup trop long qui recopie toute la zone grise au lieu de pointer, ".repeat(4);
    const { content, avertissements } = clampBudgets("sequencage", { blocs: [{ rappel: long, intention: "ok" }] });
    const rappel = (content.blocs as { rappel: string }[])[0].rappel;
    expect(rappel.length).toBeLessThanOrEqual(BUDGETS_V3.sequencage_rappel_chars);
    expect(rappel.endsWith("…")).toBe(true);
    expect(avertissements[0]).toContain("budget 140");
  });

  it("plafonne les comptes : 12 items de zone grise, 16 KPI, 3 tensions, 5 paragraphes de récit", () => {
    const zg = clampBudgets("zone_grise", { items: Array.from({ length: 15 }, (_, i) => ({ texte: `item ${i}` })) });
    expect((zg.content.items as unknown[]).length).toBe(BUDGETS_V3.zone_grise_items);
    const kpis = clampBudgets("chiffres", { kpis: Array.from({ length: 20 }, (_, i) => ({ valeur: String(i), libelle: "x" })) });
    expect((kpis.content.kpis as unknown[]).length).toBe(BUDGETS_V3.chiffres_kpis);
    const recit = clampBudgets("recit_canonique", { paragraphes: Array.from({ length: 8 }, () => "p") });
    expect((recit.content.paragraphes as unknown[]).length).toBe(BUDGETS_V3.recit_paragraphes);
  });

  it("ne touche pas un contenu dans les budgets et ne mute pas l'entrée", () => {
    const entree = { texte: "court", lecon: "brève" };
    const { content, avertissements } = clampBudgets("enjeu", entree);
    expect(content).toEqual(entree);
    expect(avertissements).toEqual([]);
    const long = { texte: "x".repeat(2000) };
    clampBudgets("enjeu", long);
    expect(long.texte.length).toBe(2000); // entrée intacte
  });
});

describe("identifiants de zone grise (règle 6)", () => {
  it("dérive un identifiant court et stable du premier mot significatif", async () => {
    const { idZoneGrise } = await import("../src/lib/fiche/schema");
    const pris = new Set<string>();
    expect(idZoneGrise("Gautier est vendéen, pas choletais", pris)).toBe("zg_gautier");
    pris.add("zg_gautier");
    expect(idZoneGrise("Gautier sponsorisait le centre de formation", pris)).toBe("zg_gautier_2");
    expect(idZoneGrise("Le ticket individuel n'est pas public", pris)).toBe("zg_ticket");
  });
});

describe("lint — bruit structurel écarté (mesuré sur Gobert v60/v74)", () => {
  it("un même lien dans a_lire et sources n'est pas un doublon ; un apport dupliqué l'est", () => {
    const lien = { titre: "Rudy Gobert élu défenseur de l'année pour la quatrième fois", url: "https://www.bebasket.fr/rudy-gobert-elu-defenseur", date: "mai 2024" };
    const propre = lintFiche({
      a_lire: { liens: [{ ...lien, apport: "le palmarès défensif complet et son contexte" }] },
      sources: { liens: [{ ...lien, apport: "récit du quatrième trophée et réactions du vestiaire" }] },
    });
    expect(propre.doublons).toEqual([]);
    const apportDuplique = "la même phrase d'apport recopiée mot pour mot entre la liste curée et la liste exhaustive des sources";
    const sale = lintFiche({
      a_lire: { liens: [{ ...lien, apport: apportDuplique }] },
      sources: { liens: [{ ...lien, apport: apportDuplique }] },
    });
    expect(sale.doublons.length).toBe(1);
  });

  it("un pointeur ZG qui cite le chiffre interdit ne compte pas comme répétition", () => {
    const rapport = lintFiche({
      zone_grise: { items: [{ id: "zg_gautier", texte: "Ticket individuel non public : ne pas avancer 250 000 euros." }] },
      sequencage: { blocs: [{ debut_min: 0, fin_min: 10, court: "x", titre: "y", rappel: "ZG: gautier, ticket non public, ne pas dire 250 000" }] },
      dix_questions: { questions: [{ texte: "q", note: "ZG: gautier, ne pas dire 250 000" }] },
    });
    expect(rapport.chiffres_repetes).toEqual([]);
  });
});
