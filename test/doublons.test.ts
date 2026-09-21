import { describe, it, expect } from "vitest";
import { normName } from "../src/lib/contacts/resolve";
import {
  LONGUEUR_MIN_LEV1,
  SEUIL_BLOCAGE_SIM,
  SEUIL_ZONE_GRISE_SIM,
  classifieCandidat,
  identifiantsForts,
  levenshtein,
  normNomDoublon,
} from "../src/lib/doublons";

// P1 du chantier doublons (25/08) : create_cible et ensureCible matchent sur
// nom normalisé + show. La normalisation est celle de normName, la même que le
// miroir Folk : casse, accents, espaces multiples. Cas de référence : les
// quatre fiches Yuval Noah Harari nées de variations invisibles du nom.
describe("normalisation des noms (détection de doublons à la création)", () => {
  it("casse, espaces multiples et espaces de bord se replient sur la même clé", () => {
    const attendu = normName("Yuval Noah Harari");
    expect(normName("yuval noah harari")).toBe(attendu);
    expect(normName("Yuval  Noah  HARARI")).toBe(attendu);
    expect(normName(" Yuval Noah Harari ")).toBe(attendu);
    expect(normName("Yuval Noah Harari".replace(/ /g, " "))).toBe(attendu);
  });

  it("les accents se replient (cas Rafaèle Tordjman)", () => {
    expect(normName("Rafaèle Tordjman")).toBe(normName("Rafaele Tordjman"));
    expect(normName("Clémence Lepic")).toBe(normName("Clemence Lepic"));
  });

  it("deux personnes différentes restent différentes", () => {
    expect(normName("Yuval Noah Harari")).not.toBe(normName("Yuval Harari"));
    expect(normName("Ben Smith")).not.toBe(normName("Ben Smith AFKL"));
  });
});

// Anti-doublon du 21/09 : normalisation FORTE (normNomDoublon), miroir TS de
// la fonction SQL norm_nom de la migration 0054. Distincte de normName (P1) :
// particules retirées, parenthèses retirées, ponctuation en espace, tokens
// triés.
describe("normNomDoublon (normalisation forte, miroir de norm_nom)", () => {
  it("minuscules, accents, ponctuation", () => {
    expect(normNomDoublon("Jean-Pierre O'Neill")).toBe("jean neill o pierre");
    expect(normNomDoublon("Grégoire GIBAULT")).toBe("gibault gregoire");
  });

  it("particules retirées (patronymes à particule)", () => {
    expect(normNomDoublon("Ludwig van Beethoven")).toBe(normNomDoublon("Beethoven Ludwig"));
    expect(normNomDoublon("Charles de Gaulle")).toBe("charles gaulle");
    expect(normNomDoublon("Tariq bin Laden")).toBe(normNomDoublon("Laden Tariq"));
  });

  it("contenu entre parenthèses retiré", () => {
    expect(normNomDoublon("Recette Magellan (ignorer)")).toBe("magellan recette");
    expect(normNomDoublon("Major Mouvement (Grégoire Gibault)")).toBe("major mouvement");
  });

  it("tokens triés : l'ordre prénom/nom ne compte plus", () => {
    expect(normNomDoublon("Zeghidour Neil")).toBe(normNomDoublon("Neil Zeghidour"));
  });

  it("vide et null se replient sur la chaîne vide", () => {
    expect(normNomDoublon("")).toBe("");
    expect(normNomDoublon(null)).toBe("");
    expect(normNomDoublon(undefined)).toBe("");
    expect(normNomDoublon("de la (du)")).toBe("");
  });
});

describe("levenshtein (second filtre après le blocking trigramme)", () => {
  it("cas de référence", () => {
    expect(levenshtein("neil zghidour", "neil zeghidour")).toBe(1);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

// Les DEUX CAS DU CONSTAT du 21/09 doivent tomber du bon côté des seuils.
describe("classifieCandidat (seuils de blocage et de zone grise)", () => {
  it("Neil Zghidour contre Neil Zeghidour : distance 1 sur nom long, BLOQUE", () => {
    const a = normNomDoublon("Neil Zghidour");
    const b = normNomDoublon("Neil Zeghidour");
    const lev = levenshtein(a, b);
    expect(lev).toBe(1);
    expect(Math.min(a.length, b.length)).toBeGreaterThanOrEqual(LONGUEUR_MIN_LEV1);
    expect(classifieCandidat({ champ: "nom", valeur: b, sim: 0.8, lev }, a, false)).toBe("bloque");
  });

  it("Major Movement contre l'organisation Major Mouvement : ZONE GRISE (jamais bloqué sur un champ organisation)", () => {
    const nouveau = normNomDoublon("Major Movement");
    const orga = normNomDoublon("Major Mouvement");
    const lev = levenshtein(nouveau, orga);
    expect(classifieCandidat({ champ: "organisation", valeur: orga, sim: 0.75, lev }, nouveau, false)).toBe("zone_grise");
  });

  it("très haute similarité de nom : bloqué seulement avec organisation concordante", () => {
    const c = { champ: "nom" as const, valeur: "aaaa bb", sim: SEUIL_BLOCAGE_SIM, lev: 3 };
    expect(classifieCandidat(c, "aaaa bc", true)).toBe("bloque");
    expect(classifieCandidat(c, "aaaa bc", false)).toBe("zone_grise");
  });

  it("distance 1 sur un nom court : zone grise, pas de blocage (prénoms proches)", () => {
    // « lea » contre « leo » : lev 1 mais nom trop court pour bloquer.
    expect(classifieCandidat({ champ: "nom", valeur: "leo", sim: 0.5, lev: 1 }, "lea", false)).toBe("zone_grise");
  });

  it("similarité faible et distance longue : distinct", () => {
    expect(classifieCandidat({ champ: "nom", valeur: "marc dupont", sim: SEUIL_ZONE_GRISE_SIM - 0.1, lev: 6 }, "jean martin", false)).toBe("distinct");
  });
});

describe("identifiantsForts (emails et profils LinkedIn des contacts fournis)", () => {
  it("emails en minuscules, dédoublonnés ; LinkedIn ramené au slug", () => {
    const ids = identifiantsForts([
      { kind: "email", valeur: "Neil@Example.COM " },
      { kind: "email", valeur: "neil@example.com" },
      { kind: "reseau", valeur: "https://www.linkedin.com/in/Neil-Zeghidour/" },
      { kind: "site", valeur: "https://linkedin.com/company/kyutai" },
      { kind: "telephone", valeur: "+33600000000" },
    ]);
    expect(ids.emails).toEqual(["neil@example.com"]);
    expect(ids.linkedin).toEqual(["neil-zeghidour", "kyutai"]);
  });

  it("sans contacts : vide", () => {
    expect(identifiantsForts(undefined)).toEqual({ emails: [], linkedin: [] });
    expect(identifiantsForts([{ kind: "email", valeur: "pas-un-email" }])).toEqual({ emails: [], linkedin: [] });
  });
});
