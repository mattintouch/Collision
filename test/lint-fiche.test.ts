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

  it("plafonne les comptes : zone grise de personnel, 16 KPI de data, 8 apprentissages", () => {
    const perso = clampBudgets("personnel", { zone_grise: Array.from({ length: 15 }, (_, i) => ({ id: `zg_${i}`, texte: `item ${i}` })) });
    expect((perso.content.zone_grise as unknown[]).length).toBe(BUDGETS_V3.zone_grise_items);
    const kpis = clampBudgets("data", { kpis: Array.from({ length: 20 }, (_, i) => ({ valeur: String(i), libelle: "x" })) });
    expect((kpis.content.kpis as unknown[]).length).toBe(BUDGETS_V3.chiffres_kpis);
    const app = clampBudgets("apprentissages", { items: Array.from({ length: 12 }, (_, i) => ({ titre: `s${i}` })) });
    expect((app.content.items as unknown[]).length).toBe(BUDGETS_V3.apprentissages_items);
    // Sections retirées : les budgets restent appliqués aux rollbacks.
    const recit = clampBudgets("recit_canonique", { paragraphes: Array.from({ length: 8 }, () => "p") });
    expect((recit.content.paragraphes as unknown[]).length).toBe(BUDGETS_V3.recit_paragraphes);
  });

  it("contrat v3.1 : lignes du TL;DR tronquées, budget total signalé sans troncature, graphiques de data plafonnés", () => {
    const tldr = clampBudgets("tldr", { items: Array.from({ length: 9 }, (_, i) => ({ label: "Qui", texte: "y".repeat(300) })) });
    const items = tldr.content.items as { texte: string }[];
    for (const t of items) expect(t.texte.length).toBeLessThanOrEqual(BUDGETS_V3.tldr_item_chars);
    expect(tldr.avertissements.some((a) => a.includes("au total"))).toBe(true);
    const graphe = { titre: "t", valeurs: [{ label: "24", affiche: "9", valeur: 9 }] };
    const data = clampBudgets("data", { barres: graphe, comparaison: graphe, rentabilite: graphe });
    expect(data.content.rentabilite).toBeUndefined();
    expect(data.avertissements.some((a) => a.includes("graphiques"))).toBe(true);
    const topics = clampBudgets("topics", { topics: [{ titre: "t", intention: "i".repeat(300), questions: [{ texte: "q", note: "n".repeat(300) }] }] });
    const t0 = (topics.content.topics as { intention: string; questions: { note: string }[] }[])[0];
    expect(t0.intention.length).toBeLessThanOrEqual(BUDGETS_V3.topic_intention_chars);
    expect(t0.questions[0].note.length).toBeLessThanOrEqual(BUDGETS_V3.topic_note_chars);
    const rdp = clampBudgets("revue_de_presse", { a_lire: Array.from({ length: 8 }, (_, i) => ({ titre: `l${i}`, apport: "a".repeat(200) })) });
    const aLire = rdp.content.a_lire as { apport: string }[];
    expect(aLire.length).toBe(BUDGETS_V3.a_lire_max);
    for (const l of aLire) expect(l.apport.length).toBeLessThanOrEqual(BUDGETS_V3.a_lire_apport_chars);
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
  it("un même lien dans a_lire et sources n'est pas un doublon ; un apport dupliqué entre listes AFFICHÉES l'est", () => {
    const lien = { titre: "Rudy Gobert élu défenseur de l'année pour la quatrième fois", url: "https://www.bebasket.fr/rudy-gobert-elu-defenseur", date: "mai 2024" };
    const propre = lintFiche({
      a_lire: { liens: [{ ...lien, apport: "le palmarès défensif complet et son contexte" }] },
      sources: { liens: [{ ...lien, apport: "récit du quatrième trophée et réactions du vestiaire" }] },
    });
    expect(propre.doublons).toEqual([]);
    // Correctif du 04/08 : sources est hors détection, le doublon ne se mesure
    // plus qu'entre les listes affichées (a_lire legacy, revue_de_presse).
    const apportDuplique = "la même phrase d'apport recopiée mot pour mot entre la liste curée et la liste exhaustive des sources";
    const sale = lintFiche({
      a_lire: { liens: [{ ...lien, apport: apportDuplique }] },
      revue_de_presse: { a_lire: [{ ...lien, apport: apportDuplique }] },
    });
    expect(sale.doublons.length).toBe(1);
  });

  it("correctif du 04/08 (cas Chiche) : un doublon impliquant sources ne compte plus, le même entre sections de contenu compte", () => {
    const passage = "dont l'article 40 sur le dossier coffre et l'article 56 sur la visioconférence des détenus particulièrement signalés";
    const avecSources = lintFiche({
      data: { marche: { texte: `Le cadre légal, ${passage}, borne le marché.` } },
      sources: { liens: [{ titre: "t", url: "https://x", citation: passage }] },
    });
    expect(avecSources.doublons).toEqual([]);
    expect(avecSources.bloquants).toBe(0);
    const entreContenus = lintFiche({
      data: { marche: { texte: `Le cadre légal, ${passage}, borne le marché.` } },
      topics: { topics: [{ titre: "t", intention: passage, questions: [] }] },
    });
    expect(entreContenus.doublons.length).toBe(1);
    expect(entreContenus.bloquants).toBe(1);
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

describe("lint — questions en double entre sections (cas Gobert, étendu v3.1)", () => {
  it("détecte la même question posée dans dix_questions (legacy) ET clips", () => {
    const rapport = lintFiche({
      dix_questions: { questions: [{ texte: "Raconte le moment précis où tu t'es dit j'étais pas bon" }] },
      clips: { questions: [{ question: "Raconte le moment précis où tu t'es dit j'étais pas bon", ressort: "echec" }] },
    });
    expect(rapport.questions_doublons.length).toBe(1);
    expect(rapport.questions_doublons[0].endroits.sort()).toEqual(["clips[0]", "dix_questions[0]"]);
    expect(rapport.bloquants).toBeGreaterThanOrEqual(1);
  });

  it("v3.1 : les questions des topics (imbriquées) et du terrain connu entrent dans le contrôle", () => {
    const rapport = lintFiche({
      topics: {
        terrain_connu: [{ question: "Le forfait à deux euros, comment vous avez fait" }],
        topics: [{ titre: "Pricing", questions: [{ num: "01", texte: "Le forfait à deux euros, comment vous avez fait" }] }],
      },
    });
    expect(rapport.questions_doublons.length).toBe(1);
    expect(rapport.questions_doublons[0].endroits).toContain("topics.terrain_connu[0]");
    expect(rapport.questions_doublons[0].endroits).toContain("topics[0].questions[0]");
  });

  it("détecte une paraphrase à fort recouvrement, pas les thèmes voisins", () => {
    const rapport = lintFiche({
      dix_questions: { questions: [
        { texte: "Comment tu décides de couper un produit qui perd de l'argent" },
        { texte: "Comment tu recrutes ton premier commercial" },
      ] },
      questions_recurrentes: { items: [
        { question: "Comment tu décides de couper un produit qui perd de l'argent depuis six mois" },
        { question: "Comment tu choisis tes investisseurs" },
      ] },
    });
    expect(rapport.questions_doublons.length).toBe(1);
    expect(rapport.questions_doublons[0].endroits).toContain("dix_questions[0]");
    expect(rapport.questions_doublons[0].endroits).toContain("questions_recurrentes[0]");
  });

  it("les questions des apprentissages et des clips entrent dans le contrôle", () => {
    const rapport = lintFiche({
      apprentissages: { items: [{ titre: "pricing", question: "Comment tu fixes le prix d'un forfait à deux euros" }] },
      clips: { questions: [{ question: "Comment tu fixes le prix d'un forfait à deux euros" }] },
    });
    expect(rapport.questions_doublons.length).toBe(1);
  });

  it("aucun faux positif sur une fiche aux questions toutes distinctes", () => {
    const rapport = lintFiche({
      topics: { topics: [{ titre: "t", questions: [{ num: "01", texte: "Comment tu prépares une saison sans blessure" }] }] },
      clips: { questions: [{ question: "Combien tu gagnes vraiment aujourd'hui" }] },
      questions_recurrentes: { items: [{ question: "Pourquoi tu es parti du Jazz" }] },
    });
    expect(rapport.questions_doublons).toEqual([]);
  });
});
