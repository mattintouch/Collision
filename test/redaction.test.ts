import { describe, it, expect } from "vitest";
import { appliquerRedaction, itemsHorsBudget, SECTIONS_REDACTIBLES } from "../src/lib/fiche/redaction";
import { FICHE_GROUPES } from "../src/lib/fiche/generation";
import { BUDGETS_V3, SECTION_CONTRACTS } from "../src/lib/fiche/schema";

describe("passe de rédaction (contrat v3.1)", () => {
  it("la rédaction est le cinquième groupe, exécuté après les recherches", () => {
    expect(FICHE_GROUPES).toContain("redaction");
    expect(FICHE_GROUPES[FICHE_GROUPES.length - 1]).toBe("redaction");
  });

  it("n'écrit que les sections rédactibles (jamais le chrome ni les clips)", () => {
    const admis = appliquerRedaction(
      { topics: { topics: [{ titre: "x", questions: [] }] } },
      {
        topics: { topics: [{ titre: "x", questions: [{ num: "01", texte: "q" }] }] },
        identite: { titre_lignes: ["PIRATE"] },
        clips: { questions: [{ question: "PIRATE" }] },
        footer: { texte: "PIRATE" },
      }
    );
    expect(Object.keys(admis)).toEqual(["topics"]);
    expect(SECTIONS_REDACTIBLES).not.toContain("clips");
    expect(SECTIONS_REDACTIBLES).not.toContain("checklist_prerec");
  });

  it("refuse de VIDER une section qui avait du contenu (la passe condense, elle ne détruit pas)", () => {
    const actuel = { apprentissages: { items: [{ titre: "Levier" }] } };
    const admis = appliquerRedaction(actuel, { apprentissages: { items: [] } });
    expect(admis.apprentissages).toBeUndefined();
  });

  it("re-clampe les comptes v3.1 (défense en profondeur)", () => {
    const beaucoup = Array.from({ length: 20 }, (_, i) => ({ titre: `item ${i}`, texte: `t${i}` }));
    const admis = appliquerRedaction(
      {},
      {
        apprentissages: { items: beaucoup },
        tldr: { items: Array.from({ length: 15 }, (_, i) => ({ label: "Qui", texte: `l${i}` })) },
        personnel: { zone_grise: Array.from({ length: 20 }, (_, i) => ({ id: `zg_${i}`, texte: `z${i}` })) },
        revue_de_presse: { a_lire: Array.from({ length: 9 }, (_, i) => ({ titre: `lien ${i}` })) },
      }
    );
    expect((admis.apprentissages.items as unknown[]).length).toBe(BUDGETS_V3.apprentissages_items);
    expect((admis.tldr.items as unknown[]).length).toBe(BUDGETS_V3.tldr_items);
    expect((admis.personnel.zone_grise as unknown[]).length).toBe(BUDGETS_V3.zone_grise_items);
    expect((admis.revue_de_presse.a_lire as unknown[]).length).toBe(BUDGETS_V3.a_lire_max);
  });
});

describe("champs de titre et identité", () => {
  it("l'identité n'est corrigeable QUE sur sous_titre et societe, le reste est préservé", () => {
    const actuel = {
      identite: {
        numero: "612",
        titre_lignes: ["Cyril", "Benzaquen"],
        sous_titre: "Septuple champion du monde",
        pilules: ["MAR 22 SEPT"],
        liens: [{ label: "Wikipedia", url: "https://w" }],
        date_naissance: "1990-01-01",
        accompagnants: [{ nom: "Léa", fonction: "attachée de presse" }],
        mise_en_relation: { qui: "Louis" },
      },
    };
    const admis = appliquerRedaction(actuel, {
      identite: {
        sous_titre: "Octuple champion du monde",
        numero: "999",
        titre_lignes: ["PIRATE"],
        pilules: ["PIRATE"],
        liens: [],
        date_naissance: "1900-01-01",
        accompagnants: [],
        mise_en_relation: { qui: "PIRATE" },
      },
    });
    expect(admis.identite.sous_titre).toBe("Octuple champion du monde");
    expect(admis.identite.numero).toBe("612");
    expect(admis.identite.titre_lignes).toEqual(["Cyril", "Benzaquen"]);
    expect(admis.identite.date_naissance).toBe("1990-01-01");
    expect((admis.identite.accompagnants as unknown[]).length).toBe(1);
    expect((admis.identite.mise_en_relation as { qui: string }).qui).toBe("Louis");
  });

  it("bandeau : seule la societe est corrigeable, et rien ne s'écrit sans changement réel", () => {
    const actuel = { sticky_header: { societe: "Fightclub" } };
    expect(appliquerRedaction(actuel, { sticky_header: { societe: "Fightclub" } })).toEqual({});
    const admis = appliquerRedaction(actuel, { sticky_header: { societe: "Fight Club Paris" } });
    expect(admis.sticky_header.societe).toBe("Fight Club Paris");
  });
});

describe("contrôle du format scannable (règle 3)", () => {
  it("signale les items de console au delà de 3 lignes, ignore la zone étude", () => {
    const pave = "x".repeat(BUDGETS_V3.bloc_b_item_chars + 50);
    const res = itemsHorsBudget({
      apprentissages: { items: [{ titre: "ok", connu: pave }] },
      topics: { topics: [{ titre: "t", intention: "courte", questions: [] }] },
      data: { marche: { texte: pave } }, // budget propre (900), hors contrôle 3 lignes
      tldr: { items: [{ label: "Qui", texte: "court" }] },
    });
    expect(res.length).toBe(1);
    expect(res[0]).toContain("apprentissages");
  });
});

describe("fin du jeu de taupes des questions (correctif du 04/08, cas Benzaquen)", () => {
  const QUESTION = "Comment tu transmets à tes jeunes combattants : tu leur enseignes la technique, le mental ou le business, et qu'est-ce qui bloque le plus chez eux";

  it("une question d'apprentissage en collision avec une question de topics est retirée sans remplacement", async () => {
    const { resorbeQuestionsSansRemplacement } = await import("../src/lib/fiche/redaction");
    const actuel = {
      topics: { topics: [{ titre: "Transmission", intention: "x", questions: [{ num: "01", texte: QUESTION }] }] },
    };
    const admis = {
      apprentissages: { items: [
        { titre: "Transmission", connu: "un gala rentable", manque: "le blocage réel", question: QUESTION },
        { titre: "Arbitrage", connu: "attaque et défense", manque: "qui tranche", question: "Qui tranche le plan de match quand le staff est partagé" },
      ] },
    };
    const r = resorbeQuestionsSansRemplacement(actuel, admis);
    const items = (r.admis.apprentissages as { items: Record<string, unknown>[] }).items;
    expect(items).toHaveLength(2);
    expect(items[0].question).toBeUndefined();
    expect(items[0].connu).toBe("un gala rentable");
    expect(items[1].question).toBe("Qui tranche le plan de match quand le staff est partagé");
    expect(r.resorbees).toHaveLength(1);
    expect(r.resorbees[0]).toContain("apprentissages[0]");
    expect(r.resorbees[0]).toContain("topics[0].questions[0]");
  });

  it("une question cœur en collision avec un clip sort de son topic et la numérotation continue est refaite", async () => {
    const { resorbeQuestionsSansRemplacement } = await import("../src/lib/fiche/redaction");
    const actuel = {
      clips: { questions: [{ question: QUESTION, ressort: "vécu" }] },
    };
    const admis = {
      topics: { topics: [
        { titre: "T1", intention: "x", questions: [{ num: "01", texte: "Ton premier gala, tu le finances comment" }, { num: "02", texte: QUESTION }] },
        { titre: "T2", intention: "y", questions: [{ num: "03", texte: "Le K-1, tu y retournes à quelles conditions" }] },
      ] },
    };
    const r = resorbeQuestionsSansRemplacement(actuel, admis);
    const topics = (r.admis.topics as { topics: { questions: { num: string; texte: string }[] }[] }).topics;
    expect(topics[0].questions.map((q) => q.texte)).toEqual(["Ton premier gala, tu le finances comment"]);
    expect(topics[0].questions[0].num).toBe("01");
    expect(topics[1].questions[0].num).toBe("02");
    expect(r.resorbees).toHaveLength(1);
  });

  it("sans doublon, les sections réécrites ressortent identiques et le rapport est vide", async () => {
    const { resorbeQuestionsSansRemplacement } = await import("../src/lib/fiche/redaction");
    const admis = {
      apprentissages: { items: [{ titre: "t", connu: "c", manque: "m", question: "Une question unique sur le modèle économique des galas" }] },
      topics: { topics: [{ titre: "T", intention: "x", questions: [{ num: "01", texte: "Une autre question sur la double carrière et le droit" }] }] },
    };
    const r = resorbeQuestionsSansRemplacement({}, admis);
    expect(r.admis).toEqual(admis);
    expect(r.resorbees).toEqual([]);
  });

  it("ne touche jamais une section que la passe n'a pas réécrite", async () => {
    const { resorbeQuestionsSansRemplacement } = await import("../src/lib/fiche/redaction");
    const actuel = {
      apprentissages: { items: [{ titre: "t", connu: "c", manque: "m", question: QUESTION }] },
      topics: { topics: [{ titre: "T", intention: "x", questions: [{ num: "01", texte: QUESTION }] }] },
    };
    // La passe ne réécrit que data : le doublon apprentissages/topics existant
    // reste à la charge d'une passe future, rien n'est retiré hors périmètre.
    const admis = { data: { kpis: [] } };
    const r = resorbeQuestionsSansRemplacement(actuel, admis);
    expect(r.admis).toEqual(admis);
    expect(r.resorbees).toEqual([]);
  });
});

describe("réserve murale de la passe de rédaction (correctif du 03/08)", () => {
  it("un drain court laisse la rédaction en file, un drain frais la revendique", async () => {
    const { redactionAdmissible, REDACTION_RESERVE_MS } = await import("../src/lib/fiche/redaction");
    // kickQueue (budget 240 s) ne revendique JAMAIS une passe de rédaction.
    expect(redactionAdmissible(240_000)).toBe(false);
    // Le cron en début de drain (budget 740 s) la revendique.
    expect(redactionAdmissible(740_000)).toBe(true);
    // Le même cron en fin de drain la laisse au suivant.
    expect(redactionAdmissible(REDACTION_RESERVE_MS - 1)).toBe(false);
    expect(redactionAdmissible(REDACTION_RESERVE_MS)).toBe(true);
    // Budget mural illimité (défaut de processEnrichmentJobs) : admissible.
    expect(redactionAdmissible(Infinity)).toBe(true);
  });
});

describe("contrats de section (update_section manuel)", () => {
  it("les contrats v3.1 reflètent budgets et propriété des faits", () => {
    expect(JSON.stringify(SECTION_CONTRACTS.tldr)).toContain("1200 caractères");
    expect(JSON.stringify(SECTION_CONTRACTS.topics)).toContain("200 caractères max");
    expect(JSON.stringify(SECTION_CONTRACTS.revue_de_presse)).toContain("120 caractères max");
    expect(JSON.stringify(SECTION_CONTRACTS.identite)).toContain("SYSTÉMATIQUE");
    expect(JSON.stringify(SECTION_CONTRACTS.data)).toContain("zone grise");
    expect(JSON.stringify(SECTION_CONTRACTS.personnel)).toContain("zg_motcle");
  });
});

describe("règle 5 en pipeline — consignes du lint pour la passe", () => {
  it("les doublons du lint deviennent des consignes explicites de résorption", async () => {
    const { consignesLint } = await import("../src/lib/fiche/redaction");
    const consignes = consignesLint({
      doublons: [{ extrait: "gautier est vendeen pas choletais il sponsorisait le centre de formation de", sections: ["topics", "personnel"], proprietaire: "personnel" }],
      chiffres_repetes: [{ valeur: "238 M$", occurrences: 4, sections: ["tldr", "apprentissages", "topics"] }],
      hors_budget: ["topics.topics[2].intention : 270 caractères, budget 200"],
      meta_narratif: [{ section: "tldr", extrait: "RECADRAGE DU 27/07" }],
      questions_doublons: [{ question: "Raconte le moment où tu t'es dit j'étais pas bon", endroits: ["topics[1].questions[4]", "clips[1]"] }],
      bloquants: 4,
    });
    expect(consignes).toContain("DOUBLONS DÉTECTÉS PAR LE LINT");
    expect(consignes).toContain("propriétaire : personnel");
    expect(consignes).toContain("238 M$ : 4 occurrences");
    expect(consignes).toContain("MÉTA NARRATIF À RETIRER");
    expect(consignes).toContain("budget 200");
    expect(consignes).toContain("QUESTIONS EN DOUBLE");
    expect(consignes).toContain("topics[1].questions[4], clips[1]");
  });

  it("aucune consigne quand le lint est propre", async () => {
    const { consignesLint } = await import("../src/lib/fiche/redaction");
    expect(consignesLint({ doublons: [], chiffres_repetes: [], hors_budget: [], meta_narratif: [], questions_doublons: [], bloquants: 0 })).toBe("");
  });
});

describe("contrat v3.1 — catalogue et sections retirées", () => {
  it("les sections retirées ne sont plus jamais rédigées par la passe", () => {
    for (const id of ["sequencage", "dix_questions", "zone_grise", "enjeu", "recit_canonique", "mecanique_succes", "univers", "parcours", "anecdotes", "entourage", "tensions", "polemiques", "questions_recurrentes", "a_lire", "trente_secondes"]) {
      expect(SECTIONS_REDACTIBLES, `${id} ne doit plus être rédactible`).not.toContain(id);
    }
    const admis = appliquerRedaction({}, { sequencage: { blocs: [{ titre: "PIRATE" }] }, dix_questions: { questions: [{ texte: "PIRATE" }] } });
    expect(admis.sequencage).toBeUndefined();
    expect(admis.dix_questions).toBeUndefined();
  });

  it("le catalogue v3.1 : neuf sections actives ordonnées, les retirées en fin", async () => {
    const { sectionPosition, FICHE_SECTIONS, sectionRetiree, FICHE_SECTIONS_ACTIVES } = await import("../src/lib/fiche/sections");
    expect(sectionPosition("identite")).toBeLessThan(sectionPosition("checklist_prerec"));
    expect(sectionPosition("checklist_prerec")).toBeLessThan(sectionPosition("tldr"));
    expect(sectionPosition("tldr")).toBeLessThan(sectionPosition("data"));
    expect(sectionPosition("data")).toBeLessThan(sectionPosition("apprentissages"));
    expect(sectionPosition("apprentissages")).toBeLessThan(sectionPosition("clips"));
    expect(sectionPosition("clips")).toBeLessThan(sectionPosition("topics"));
    expect(sectionPosition("topics")).toBeLessThan(sectionPosition("personnel"));
    expect(sectionPosition("personnel")).toBeLessThan(sectionPosition("revue_de_presse"));
    expect(sectionPosition("revue_de_presse")).toBeLessThan(sectionPosition("footer"));
    // Les retirées trient après le contenu actif (fin de catalogue).
    expect(sectionPosition("enjeu")).toBeGreaterThan(sectionPosition("footer"));
    expect(sectionRetiree("sequencage")).toBe(true);
    expect(sectionRetiree("topics")).toBe(false);
    expect(FICHE_SECTIONS_ACTIVES.every((s) => !s.retire)).toBe(true);
    expect(FICHE_SECTIONS.find((s) => s.id === "sequencage")?.role).toContain("RETIRÉ");
  });
});
