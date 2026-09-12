import { describe, it, expect } from "vitest";
import {
  ORDRE_REDACTION,
  PLAFONDS_REDACTION,
  PLAN_MAX_TOKENS,
  REDACTION_REPRISE_MAX_MS,
  etapesRedaction,
  etapesRestantes,
  planDepuisJson,
  blocPlan,
  reprisePossible,
  fusionBriques,
  proposeDepuisSortie,
  formatEtape,
  cleRedactionEnCours,
  appliquerRedaction,
} from "../src/lib/fiche/redaction";
import { EchecCascade, sectionsAReinitialiser } from "../src/lib/fiche/generation";

describe("rédaction scindée (12/09, cas eric-schmidt)", () => {
  it("l'ordre des étapes : les faits, puis les questions, puis les titres, le tldr en dernier", () => {
    expect([...ORDRE_REDACTION]).toEqual(["data", "revue_de_presse", "personnel", "apprentissages", "topics", "titres", "tldr"]);
    // apprentissages AVANT topics : le contrôle des doublons de topics voit les apprentissages consolidés.
    expect(ORDRE_REDACTION.indexOf("apprentissages")).toBeLessThan(ORDRE_REDACTION.indexOf("topics"));
    expect(ORDRE_REDACTION[ORDRE_REDACTION.length - 1]).toBe("tldr");
  });

  it("aucun appel ne peut dépasser l'ancien plafond monolithique, topics est le plus gros", () => {
    for (const etape of ORDRE_REDACTION) {
      expect(PLAFONDS_REDACTION[etape]).toBeLessThanOrEqual(12000);
      expect(PLAFONDS_REDACTION[etape]).toBeGreaterThan(0);
    }
    expect(Math.max(...Object.values(PLAFONDS_REDACTION))).toBe(PLAFONDS_REDACTION.topics);
    expect(PLAN_MAX_TOKENS).toBeLessThanOrEqual(6000);
  });

  it("les étapes suivent la matière présente ; le tldr est toujours joué dès qu'il y a de la matière", () => {
    expect(etapesRedaction({})).toEqual([]);
    expect(etapesRedaction({ data: {} })).toEqual([]);
    expect(etapesRedaction({ data: { kpis: [{ valeur: "1" }] } })).toEqual(["data", "tldr"]);
    // titres : identite OU sticky_header suffit.
    expect(etapesRedaction({ sticky_header: { societe: "X" }, topics: { topics: [{ titre: "t" }] } })).toEqual(["topics", "titres", "tldr"]);
    // clips est lue pour les doublons mais n'est jamais une étape.
    expect(etapesRedaction({ clips: { piquantes: ["q"] } })).toEqual(["tldr"]);
  });

  it("les étapes restantes retirent les étapes faites, dans l'ordre", () => {
    const etapes = etapesRedaction({ data: { kpis: [1] }, topics: { topics: [{ titre: "t" }] }, identite: { sous_titre: "s" } });
    expect(etapes).toEqual(["data", "topics", "titres", "tldr"]);
    expect(etapesRestantes(etapes, ["data", "topics"])).toEqual(["titres", "tldr"]);
    expect(etapesRestantes(etapes, [])).toEqual(etapes);
    expect(etapesRestantes(etapes, ["inconnue"])).toEqual(etapes);
  });
});

describe("plan de consolidation", () => {
  it("lecture défensive : champs typés, comptes bornés, jamais d'exception", () => {
    expect(planDepuisJson(null)).toEqual({ chiffres_reconcilies: [], noms_unifies: [], dedoublonnages: [], consignes: {} });
    expect(planDepuisJson("texte")).toEqual({ chiffres_reconcilies: [], noms_unifies: [], dedoublonnages: [], consignes: {} });
    const plan = planDepuisJson({
      chiffres_reconcilies: [
        { fait: "délai", valeur_retenue: "15 mois", source: "Les Echos", valeurs_ecartees: ["12 mois", 3, ""] },
        { fait: "sans valeur" },
        "pas un objet",
      ],
      noms_unifies: [{ retenu: "Yannick Berrabah", ecartes: ["Yacine Berrabah"] }, { ecartes: ["x"] }],
      dedoublonnages: [{ fait: "levée de 3 Mds", proprietaire: "data", retirer_de: ["tldr", "topics"] }, { fait: "sans propriétaire" }],
      consignes: { data: ["condenser le marché", ""], topics: [], tldr: "pas une liste" },
    });
    expect(plan.chiffres_reconcilies).toEqual([{ fait: "délai", valeur_retenue: "15 mois", source: "Les Echos", valeurs_ecartees: ["12 mois"] }]);
    expect(plan.noms_unifies).toEqual([{ retenu: "Yannick Berrabah", ecartes: ["Yacine Berrabah"] }]);
    expect(plan.dedoublonnages).toEqual([{ fait: "levée de 3 Mds", proprietaire: "data", retirer_de: ["tldr", "topics"] }]);
    expect(plan.consignes).toEqual({ data: ["condenser le marché"] });
  });

  it("le bloc de plan porte les décisions et SEULEMENT les consignes de l'étape", () => {
    const plan = planDepuisJson({
      chiffres_reconcilies: [{ fait: "délai", valeur_retenue: "15 mois" }],
      noms_unifies: [{ retenu: "Yannick Berrabah", ecartes: ["Yacine Berrabah"] }],
      dedoublonnages: [{ fait: "levée", proprietaire: "data", retirer_de: ["tldr"] }],
      consignes: { data: ["condenser le marché"], identite: ["aligner le sous-titre"], topics: ["résorber q3"] },
    });
    const pourData = blocPlan(plan, "data");
    expect(pourData).toContain("délai : 15 mois");
    expect(pourData).toContain("Yannick Berrabah");
    expect(pourData).toContain("propriétaire data");
    expect(pourData).toContain("condenser le marché");
    expect(pourData).not.toContain("résorber q3");
    // L'étape titres reçoit les consignes d'identite ET de sticky_header.
    expect(blocPlan(plan, "titres")).toContain("aligner le sous-titre");
    // Plan vide : aucun bloc.
    expect(blocPlan(planDepuisJson({}), "data")).toBe("");
  });
});

describe("reprise depuis le marqueur system_state", () => {
  const plan = planDepuisJson({});
  const now = Date.parse("2026-09-12T10:00:00Z");

  it("un marqueur récent avec un plan permet la reprise ; périmé ou malformé, non", () => {
    const frais = { plan, faites: ["data"], rapport: {}, started_at: "2026-09-12T09:00:00Z" };
    expect(reprisePossible(frais, now)).toBe(true);
    const perime = { ...frais, started_at: new Date(now - REDACTION_REPRISE_MAX_MS - 1).toISOString() };
    expect(reprisePossible(perime, now)).toBe(false);
    expect(reprisePossible(null, now)).toBe(false);
    expect(reprisePossible({ faites: [] }, now)).toBe(false);
    expect(reprisePossible({ plan, faites: "x", started_at: "2026-09-12T09:00:00Z" }, now)).toBe(false);
    expect(reprisePossible({ plan, faites: [], started_at: "pas une date" }, now)).toBe(false);
    // Un marqueur daté dans le futur (horloge) n'est pas repris.
    expect(reprisePossible({ ...frais, started_at: new Date(now + 60_000).toISOString() }, now)).toBe(false);
  });

  it("la clé du marqueur est par fiche", () => {
    expect(cleRedactionEnCours("abc")).toBe("redaction_en_cours:abc");
  });
});

describe("étape topics : fusion des briques modifiées", () => {
  const actuel = {
    terrain_connu: [{ question: "q0" }],
    topics: [
      { titre: "A", intention: "ia", questions: [{ num: "01", texte: "a1" }, { num: "02", texte: "a2" }] },
      { titre: "B", intention: "ib", questions: [{ num: "03", texte: "b1" }] },
      { titre: "C", intention: "ic", questions: [{ num: "04", texte: "c1" }] },
    ],
  };

  it("remplace les briques indexées, garde les autres, renumérote en continu", () => {
    const { content, modifiees } = fusionBriques(actuel, {
      briques: { "1": { titre: "B", intention: "ib court", contexte: "ctx", questions: [{ texte: "b1 condensée" }, { texte: "b2" }] } },
    });
    expect(modifiees).toEqual([1]);
    const topics = content.topics as { titre: string; questions: { num: string; texte: string }[] }[];
    expect(topics[0].questions.map((q) => q.num)).toEqual(["01", "02"]);
    expect(topics[1].questions.map((q) => `${q.num} ${q.texte}`)).toEqual(["03 b1 condensée", "04 b2"]);
    expect(topics[2].questions[0].num).toBe("05");
    expect(content.terrain_connu).toEqual([{ question: "q0" }]);
  });

  it("ignore un index hors liste, refuse une brique vidée de ses questions, préserve le titre", () => {
    const { content, modifiees } = fusionBriques(actuel, {
      briques: {
        "7": { titre: "Z", questions: [{ texte: "z" }] },
        "0": { titre: "PIRATE", intention: "ia", questions: [] },
        "2": { intention: "ic", questions: [{ texte: "c1 mieux" }] },
      },
    });
    expect(modifiees).toEqual([2]);
    const topics = content.topics as { titre: string; questions: unknown[] }[];
    expect(topics.length).toBe(3);
    expect(topics[0].titre).toBe("A");
    expect(topics[0].questions.length).toBe(2);
    expect(topics[2].titre).toBe("C");
  });

  it("une sortie sans brique modifiée ne propose rien ; le terrain connu peut être corrigé seul", () => {
    expect(proposeDepuisSortie("topics", { briques: {} }, { topics: actuel })).toEqual({});
    expect(proposeDepuisSortie("topics", null, { topics: actuel })).toEqual({});
    const p = proposeDepuisSortie("topics", { terrain_connu: [{ question: "q0 court" }] }, { topics: actuel });
    expect((p.topics as { terrain_connu: unknown }).terrain_connu).toEqual([{ question: "q0 court" }]);
  });
});

describe("étapes titres et sections pleines : proposition puis garde-fous existants", () => {
  it("titres : seuls identite et sticky_header passent, puis appliquerRedaction ne garde que les champs de titre", () => {
    const actuel = { identite: { numero: "612", sous_titre: "Septuple champion" }, sticky_header: { societe: "Fightclub" } };
    const propose = proposeDepuisSortie("titres", { identite: { sous_titre: "Octuple champion", numero: "999" }, sticky_header: { societe: "Fight Club Paris" }, data: { kpis: [] } }, actuel);
    expect(Object.keys(propose).sort()).toEqual(["identite", "sticky_header"]);
    const admis = appliquerRedaction(actuel, propose);
    expect(admis.identite.sous_titre).toBe("Octuple champion");
    expect(admis.identite.numero).toBe("612");
    expect(admis.sticky_header.societe).toBe("Fight Club Paris");
  });

  it("une section pleine : la sortie devient la proposition de cette seule section", () => {
    expect(proposeDepuisSortie("data", { kpis: [{ valeur: "1" }] }, {})).toEqual({ data: { kpis: [{ valeur: "1" }] } });
    expect(proposeDepuisSortie("data", "texte", {})).toEqual({});
    // Sortie imbriquée sous sa propre clé : déballée, jamais écrite telle quelle.
    expect(proposeDepuisSortie("data", { data: { kpis: [{ valeur: "1" }] } }, {})).toEqual({ data: { kpis: [{ valeur: "1" }] } });
    expect(proposeDepuisSortie("tldr", { items: [{ label: "Qui", texte: "x" }] }, {})).toEqual({ tldr: { items: [{ label: "Qui", texte: "x" }] } });
  });

  it("chaque étape a une consigne qui nomme le format de sortie et la clé section", () => {
    for (const etape of ORDRE_REDACTION) {
      const f = formatEtape(etape);
      expect(f).toContain('"section"');
      expect(f).toContain('"rapport"');
    }
    expect(formatEtape("topics")).toContain('"briques"');
    expect(formatEtape("titres")).toContain("sticky_header");
    expect(formatEtape("tldr")).toContain("SYNTHÈSE");
  });
});

describe("alerting : échec en cascade et réinitialisation", () => {
  it("un échec en cascade reste une Error ordinaire pour le journal, distinguable pour l'alerte", () => {
    const e = new EchecCascade("Passe redaction refusée : le dernier deroule a échoué");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(EchecCascade);
    expect(e.message).toContain("refusée");
    expect(new Error("timeout") instanceof EchecCascade).toBe(false);
  });

  it("reinitialiser ne vide que les sections des passes à reprise idempotente", () => {
    expect(sectionsAReinitialiser(["deroule"])).toEqual(["topics"]);
    expect(sectionsAReinitialiser(["synthese"])).toEqual(["tldr", "clips"]);
    expect(sectionsAReinitialiser(["portrait", "chiffres", "angles"])).toEqual([]);
    expect(sectionsAReinitialiser(["portrait", "chiffres", "angles", "deroule", "synthese", "redaction"])).toEqual(["topics", "tldr", "clips"]);
  });
});
