import { describe, it, expect } from "vitest";
import { migrerFicheV31 } from "../src/lib/fiche/migration-v31";

// Une fiche v2 représentative (le cas Gobert en miniature). Les ids sont
// CANONIQUES : entete arrive déjà en identite, chiffres en data, playbook en
// apprentissages, questions_reseaux en clips (alias de lecture).
const FICHE_V2 = {
  identite: { numero: "451", sous_titre: "Pivot NBA." },
  trente_secondes: {
    items: [
      { label: "Qui", texte: "Pivot français, triple champion" },
      { label: "Fait d'armes", texte: "4 fois défenseur de l'année" },
      { label: "Pourquoi maintenant", texte: "Retour en France" },
      { label: "État d'esprit", texte: "Revanchard" },
    ],
  },
  enjeu: { texte: "La reconquête après la défaite fondatrice.", lecon: "La routine bat le talent." },
  recit_canonique: { paragraphes: ["Un long récit maîtrisé."] },
  mecanique_succes: {
    definition: "Le meilleur défenseur de sa génération, 4 trophées.",
    pairs: [{ nom: "Embiid", position: "rival direct au poste" }],
    divergences: [{ date: "2013", decision: "Partir à Salt Lake City", effet: "titularisation" }],
    contrefactuel: "Sans ce départ, pas de trophée.",
  },
  univers: {
    intro: ["La NBA pèse 10 Md$ de revenus annuels."],
    distinctions: ["La défense n'est pas un poste, c'est un système."],
    barres: { titre: "Salaires", valeurs: [{ label: "24", affiche: "41", valeur: 41 }] },
    timeline: { titre: "Bascules", jalons: [{ annee: "2013", titre: "Draft" }] },
  },
  data: { kpis: [{ valeur: "238 M$", libelle: "contrat", source: "ESPN 2022" }] },
  apprentissages: { items: [{ titre: "La verticalité comme arme", connu: "établi" }] },
  parcours: { lignes: [{ annee: "2013", texte: "Drafté en 27e position" }, { annee: "2018", texte: "Défenseur de l'année" }] },
  anecdotes: { items: [{ texte: "Anecdote peu connue.", source: "podcast 2019", cachee: true }] },
  entourage: { personnes: [{ nom: "Rudy Fernandez", role: "mentor", texte: "l'a pris sous son aile" }] },
  tensions: { cartes: [{ a: "Discours : le collectif d'abord", b: "Fait : clash public en 2021", angle: "avec bienveillance" }] },
  polemiques: { items: [{ texte: "Clash avec un coéquipier en plein match.", source: "L'Équipe 2021", question: "Ce clash, tu l'assumes encore" }] },
  questions_recurrentes: { items: [{ question: "Pourquoi la défense", reponse: "réponse rodée" }] },
  dix_questions: { questions: [{ num: "01", texte: "Comment tu construis une saison sans blessure" }] },
  zone_grise: { items: [{ id: "zg_gautier", texte: "Ticket non public, ne pas avancer 250 k€.", origine: "note Matthieu" }] },
  a_lire: { liens: [{ niveau: "optionnel", titre: "Long format L'Équipe", url: "https://x", apport: "contexte" }] },
  clips: { questions: [{ question: "Combien tu gagnes vraiment", ressort: "argent" }] },
  personnel: { items: [{ texte: "Père de famille discret.", source: "interview 2020" }] },
  sources: { liens: [{ titre: "src", url: "https://s" }] },
};

describe("migration v3.1 — mapping section par section", () => {
  const r = migrerFicheV31(FICHE_V2 as never);

  it("le TL;DR reçoit un squelette (labels de trente_secondes, fil rouge, comment, polémique)", () => {
    const items = r.ecrits.tldr.items as { label: string; texte: string }[];
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Qui");
    expect(labels).toContain("Fil rouge");
    expect(labels).toContain("Le comment");
    expect(labels).toContain("Polémique");
    // L'ordre des neuf labels est respecté (sous-ensemble ordonné).
    expect(labels.indexOf("Qui")).toBeLessThan(labels.indexOf("Fil rouge"));
  });

  it("data : marché depuis univers, comparables depuis les pairs, graphiques repris, KPI conservés", () => {
    const data = r.ecrits.data as { kpis: unknown[]; marche: { texte: string; comparables: { nom: string }[] }; barres: unknown };
    expect(data.kpis.length).toBe(1);
    expect(data.marche.texte).toContain("NBA");
    expect(data.marche.texte).toContain("système");
    expect(data.marche.comparables.map((c) => c.nom)).toContain("Embiid");
    expect(data.barres).toBeDefined();
  });

  it("apprentissages : divergences, contrefactuel et leçon ajoutés sans écraser l'existant", () => {
    const items = (r.ecrits.apprentissages.items as { titre: string }[]).map((i) => i.titre);
    expect(items).toContain("La verticalité comme arme");
    expect(items.some((t) => t.includes("Salt Lake City"))).toBe(true);
    expect(items.some((t) => t.includes("Contrefactuel"))).toBe(true);
    expect(items.some((t) => t.includes("leçon"))).toBe(true);
  });

  it("clips : la question qui fâche ferme la liste avec son marqueur", () => {
    const qs = r.ecrits.clips.questions as { question: string; fache?: boolean }[];
    expect(qs[qs.length - 1].question).toContain("clash");
    expect(qs[qs.length - 1].fache).toBe(true);
    expect(qs[0].fache).toBeFalsy();
  });

  it("topics : terrain connu depuis les récurrentes, dix questions dans un topic à répartir", () => {
    const topics = r.ecrits.topics as { terrain_connu: { question: string }[]; topics: { titre: string; questions: { texte: string }[] }[] };
    expect(topics.terrain_connu[0].question).toBe("Pourquoi la défense");
    const transition = topics.topics.find((t) => t.titre === "Questions à répartir");
    expect(transition?.questions[0].texte).toContain("saison sans blessure");
  });

  it("personnel : entourage, données cachées (anecdotes, polémique, tension, items v2) et zone grise avec ses identifiants", () => {
    const perso = r.ecrits.personnel as {
      entourage: { nom: string }[];
      donnees_cachees: { texte: string }[];
      zone_grise: { id?: string }[];
      items?: unknown;
    };
    expect(perso.entourage.map((e) => e.nom)).toContain("Rudy Fernandez");
    const textes = perso.donnees_cachees.map((d) => d.texte);
    expect(textes.some((t) => t.includes("Anecdote"))).toBe(true);
    expect(textes.some((t) => t.includes("Clash"))).toBe(true);
    expect(textes.some((t) => t.includes("VS"))).toBe(true);
    expect(textes.some((t) => t.includes("Père de famille"))).toBe(true);
    expect(perso.zone_grise[0].id).toBe("zg_gautier");
    expect(perso.items).toBeUndefined();
  });

  it("revue de presse : à lire (optionnel devient utile), parcours intégral au palmarès", () => {
    const rdp = r.ecrits.revue_de_presse as { a_lire: { niveau?: string }[]; palmares: { date?: string; texte: string }[] };
    expect(rdp.a_lire[0].niveau).toBe("utile");
    expect(rdp.palmares.length).toBe(2);
    expect(rdp.palmares[1].texte).toContain("Défenseur");
  });

  it("les sections sources sont vidées (archivées en versions) et les pertes documentées", () => {
    for (const id of ["trente_secondes", "enjeu", "recit_canonique", "mecanique_succes", "univers", "parcours", "anecdotes", "entourage", "tensions", "polemiques", "questions_recurrentes", "dix_questions", "zone_grise", "a_lire"]) {
      expect(r.vides, `${id} doit être vidée`).toContain(id);
    }
    expect(r.pertes.some((p) => p.includes("timeline"))).toBe(true);
    expect(r.pertes.some((p) => p.includes("recit_canonique"))).toBe(true);
    expect(r.table.length).toBeGreaterThan(4);
  });

  it("idempotente : rejouée sur le résultat, la migration ne produit plus rien", () => {
    const apres: Record<string, Record<string, unknown>> = { ...(FICHE_V2 as never as Record<string, Record<string, unknown>>) };
    for (const [id, content] of Object.entries(r.ecrits)) apres[id] = content;
    for (const id of r.vides) delete apres[id];
    const r2 = migrerFicheV31(apres);
    expect(Object.keys(r2.ecrits)).toEqual([]);
    expect(r2.vides).toEqual([]);
  });
});
