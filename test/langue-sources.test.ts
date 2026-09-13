import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  blocFaitsValides,
  blocIdees,
  blocLangue,
  estSourceEquipe,
  partitionneNotes,
  prioriteIdee,
  promptGroupe,
  trieIdees,
} from "../src/lib/fiche/generation";

describe("propagation de la langue PAR APPEL (addendum D du 13/09)", () => {
  it("promptGroupe préfixe le bloc de langue en anglais, identité en français", () => {
    expect(promptGroupe("fr", "corps du message")).toBe("corps du message");
    const en = promptGroupe("en", "corps du message");
    expect(en.startsWith(blocLangue("en"))).toBe(true);
    expect(en.endsWith("corps du message")).toBe(true);
  });

  it("chaque appel construit par un groupe porte le bloc de langue dans son message utilisateur", () => {
    const src = readFileSync("src/lib/fiche/generation.ts", "utf8");
    // 5 appels de recherche : portrait, chiffres, angles, squelette, brique
    // (la brique est DANS la boucle : un promptGroupe par brique, pas un par
    // groupe), plus la synthèse sans recherche. Six messages utilisateur, six
    // enveloppes promptGroupe(langue, ...).
    const appelsRecherche = src.match(/runWebSearchJSONVerbose</g) ?? [];
    expect(appelsRecherche.length).toBe(5);
    const enveloppes = src.match(/promptGroupe\(langue, `/g) ?? [];
    expect(enveloppes.length).toBe(6);
  });

  it("chaque appel de la passe redaction porte la consigne de langue dans son message utilisateur", () => {
    const src = readFileSync("src/lib/fiche/redaction.ts", "utf8");
    // prefixeLangue défini une fois, appliqué au message de chaque étape ET à
    // la réécriture ciblée du tldr.
    const usages = src.match(/\$\{prefixeLangue\}/g) ?? [];
    expect(usages.length).toBeGreaterThanOrEqual(2);
  });
});

describe("hiérarchie des sources : faits validés par l'équipe (addendum E du 13/09)", () => {
  it("estSourceEquipe reconnaît l'entourage et les briefs officiels, pas la matière non vérifiée", () => {
    expect(estSourceEquipe("Email Helen Dunn (Hiltzik Strategies) du 11/09/2026, fil « Recording »")).toBe(true);
    expect(estSourceEquipe("PDF « GDIY x Eric Schmidt — London Location Brief » + fil email 11/09")).toBe(true);
    expect(estSourceEquipe("Brief officiel de l'équipe Schmidt")).toBe(true);
    expect(estSourceEquipe("Attachée de presse, appel du 10/09")).toBe(true);
    expect(estSourceEquipe("écho non recoupé")).toBe(false);
    expect(estSourceEquipe("note Matthieu")).toBe(false);
    expect(estSourceEquipe("article Forbes, jan. 2024")).toBe(false);
    expect(estSourceEquipe(null)).toBe(false);
    expect(estSourceEquipe("")).toBe(false);
  });

  it("partitionneNotes sépare les faits validés de la matière non vérifiée", () => {
    const notes = [
      { id: "1", text: "fait équipe", source: "Email de son équipe" },
      { id: "2", text: "rumeur", source: "écho non recoupé" },
      { id: "3", text: "sans source", source: null },
    ];
    const { valides, autres } = partitionneNotes(notes);
    expect(valides.map((n) => n.id)).toEqual(["1"]);
    expect(autres.map((n) => n.id)).toEqual(["2", "3"]);
  });

  it("blocFaitsValides porte le titre du bloc, la primauté, la contradiction en une ligne et l'interdiction d'omission", () => {
    const bloc = blocFaitsValides([{ text: "Founding Partner de la Lafayette Fellowship", source: "Email Helen Dunn" }]);
    expect(bloc).toContain("FAITS VALIDÉS PAR L'ÉQUIPE DE L'INVITÉ");
    expect(bloc).toContain("FAITS ÉTABLIS");
    expect(bloc).toContain("jamais en zone grise");
    expect(bloc).toContain("ne les déclasse jamais");
    expect(bloc).toContain("PRIME");
    expect(bloc).toContain("UNE ligne");
    expect(bloc).toContain("AUCUNE omission silencieuse");
    expect(bloc).toContain("Founding Partner de la Lafayette Fellowship");
    expect(blocFaitsValides([])).toBe("");
  });

  it("le bloc faits validés est injecté dans les 4 recherches, la synthèse et la rédaction", () => {
    const gen = readFileSync("src/lib/fiche/generation.ts", "utf8");
    // portrait, chiffres, angles, squelette, brique, synthèse : six messages
    // utilisateur portent ${faitsTxt}.
    const injections = gen.match(/\$\{faitsTxt\}/g) ?? [];
    expect(injections.length).toBe(6);
    const red = readFileSync("src/lib/fiche/redaction.ts", "utf8");
    expect(red).toContain("${faitsValides}");
  });

  it("prioriteIdee lit un ordre explicite, uniquement sur le type angle", () => {
    expect(prioriteIdee({ type: "angle", texte: "La carte France complète, priorité 1" })).toBe(1);
    expect(prioriteIdee({ type: "angle", texte: "Priorite: 2, le triumvirat" })).toBe(2);
    expect(prioriteIdee({ type: "angle", texte: "P3 le pari Relativity" })).toBe(3);
    expect(prioriteIdee({ type: "angle", texte: "à traiter en priorité (Helen)" })).toBe(0);
    expect(prioriteIdee({ type: "angle", texte: "sans ordre exprimé" })).toBeNull();
    expect(prioriteIdee({ type: "question", texte: "priorité 1 quand même" })).toBeNull();
  });

  it("trieIdees met les angles priorisés d'abord dans leur ordre, le reste garde l'ordre de création", () => {
    const idees = [
      { type: "question", texte: "q sans priorité" },
      { type: "angle", texte: "angle priorité 2" },
      { type: "angle", texte: "angle sans ordre" },
      { type: "angle", texte: "angle en priorité" },
    ];
    expect(trieIdees(idees).map((i) => i.texte)).toEqual([
      "angle en priorité",
      "angle priorité 2",
      "q sans priorité",
      "angle sans ordre",
    ]);
  });

  it("blocIdees annonce l'ordre quand des angles sont priorisés, pas sinon", () => {
    const avec = blocIdees([{ type: "angle", texte: "priorité 1 : la carte France", source_url: null }]);
    expect(avec).toContain("ORDRE : la liste est triée");
    const sans = blocIdees([{ type: "angle", texte: "sans ordre", source_url: null }]);
    expect(sans).not.toContain("ORDRE : la liste est triée");
  });
});
