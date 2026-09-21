import { describe, it, expect, beforeAll } from "vitest";
import {
  MARQUEUR_ITEM,
  construitPromptDev,
  critereAcceptation,
  litMarqueur,
  litMarqueurs,
  marqueurPour,
  type ItemBacklog,
} from "../src/lib/dev/prompt";
import { rattachements, type PrVue } from "../src/lib/backlog/reboucle";

// Chantier « lancement dev en un clic » (21/09). L'item de recette est le bug
// find_cible du 18/09, celui qui sert de démonstration dans la PR.
const ITEM: ItemBacklog = {
  id: "ddb5bfb0-4843-4913-9316-b445c00a9747",
  contenu:
    "find_cible(\"Grimaldi\", show UUID gdiy) a renvoyé 0 résultat le 18/09/2026 alors que create_cible(\"Virginie Grimaldi\") a détecté la cible existante b2498e60.",
  type: "bug",
  auteur: "matt@stefani.fr",
  created_at: "2026-09-18T11:42:28.662021+00:00",
  commentaire_triage:
    "Proposition : a_faire. Bug find_cible : resolving non fiable sur fragment de nom crée risque doublon opérationnel.",
  contexte: { cible: "b2498e60-ce25-4cf1-b066-35a75dcfeb3c" },
};

describe("générateur de prompt de développement (livrable B)", () => {
  const prompt = construitPromptDev(ITEM, { depot: "mattintouch/Collision" });

  it("porte le dépôt, la demande, le contexte et la consigne de PR", () => {
    expect(prompt).toContain("mattintouch/Collision");
    expect(prompt).toContain("find_cible");
    expect(prompt).toContain("LA DEMANDE");
    expect(prompt).toContain("CRITÈRE D'ACCEPTATION");
    expect(prompt).toContain("Ouvre UNE pull request vers main.");
  });

  it("porte le marqueur de rebouclage avec l'id complet de l'item", () => {
    expect(prompt).toContain(marqueurPour(ITEM.id));
    expect(litMarqueur(prompt)).toBe(ITEM.id);
  });

  it("cadre selon le type : un bug se reproduit avant de se corriger", () => {
    expect(prompt).toContain("C'est un BUG");
    expect(construitPromptDev({ ...ITEM, type: "feature" })).toContain("DEMANDE DE FONCTIONNALITÉ");
    expect(construitPromptDev({ ...ITEM, type: "note" })).toContain("NOTE de cadrage");
  });

  it("reprend le commentaire de triage comme critère d'acceptation", () => {
    expect(critereAcceptation(ITEM)).toContain("resolving non fiable");
    expect(critereAcceptation({ ...ITEM, commentaire_triage: null })).toContain("Aucun critère n'a été posé au triage");
  });

  it("rappelle les garde-fous du dépôt : migrations jamais automatiques, secrets hors code", () => {
    expect(prompt).toContain("MIGRATIONS-EN-ATTENTE.md");
    expect(prompt).toContain("Aucun secret");
    expect(prompt).toContain("npx tsc --noEmit");
  });

  it("respecte le style maison : aucun tiret cadratin, aucun emoji", () => {
    expect(prompt).not.toMatch(/[—–]/);
    expect(prompt).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2700}-\u{27BF}]/u);
  });

  it("reste reproductible : même item, même prompt (aucun appel modèle)", () => {
    expect(construitPromptDev(ITEM, { depot: "mattintouch/Collision" })).toBe(prompt);
  });
});

describe("marqueur de rattachement PR vers item", () => {
  it("lit un id, plusieurs ids, et tolère la casse", () => {
    expect(litMarqueurs(`${MARQUEUR_ITEM} ${ITEM.id}`)).toEqual([ITEM.id]);
    expect(litMarqueurs(`backlog-item:${ITEM.id.toUpperCase()}`)).toEqual([ITEM.id]);
    const deux = litMarqueurs(`${marqueurPour("9e70d7e9-1111-2222-3333-444455556666")}\n${marqueurPour(ITEM.id)}`);
    expect(deux).toHaveLength(2);
    expect(deux).toContain(ITEM.id);
  });

  it("ignore un texte sans marqueur ou mal formé", () => {
    expect(litMarqueurs("Une PR ordinaire, sans marqueur.")).toEqual([]);
    expect(litMarqueurs("Backlog-Item: pas-un-uuid")).toEqual([]);
    expect(litMarqueurs(null)).toEqual([]);
  });

  it("dédoublonne le même id cité deux fois", () => {
    expect(litMarqueurs(`${marqueurPour(ITEM.id)} et encore ${marqueurPour(ITEM.id)}`)).toEqual([ITEM.id]);
  });
});

describe("rebouclage : PR vers items (livrable D)", () => {
  const prs: PrVue[] = [
    { numero: 90, titre: "Lancement dev en un clic", corps: `Livre ${marqueurPour("9e70d7e9-1111-2222-3333-444455556666")}\n${marqueurPour("585d5d52-aaaa-bbbb-cccc-ddddeeeeffff")}`, url: "https://github.com/x/y/pull/90", etat: "open" },
    { numero: 89, titre: `Correctif find_cible ${marqueurPour(ITEM.id)}`, corps: null, url: "https://github.com/x/y/pull/89", etat: "open" },
    { numero: 88, titre: "Sans marqueur", corps: "Rien à rattacher", url: "https://github.com/x/y/pull/88", etat: "closed" },
  ];

  it("rattache chaque item marqué à sa PR, y compris depuis le titre", () => {
    const m = rattachements(prs);
    expect(m.get(ITEM.id)).toBe("https://github.com/x/y/pull/89");
    expect(m.get("9e70d7e9-1111-2222-3333-444455556666")).toBe("https://github.com/x/y/pull/90");
    expect(m.size).toBe(3);
  });

  it("la PR la plus récente gagne quand deux PR citent le même item", () => {
    const doublon: PrVue[] = [
      { numero: 91, titre: "récente", corps: marqueurPour(ITEM.id), url: "https://github.com/x/y/pull/91", etat: "open" },
      { numero: 70, titre: "ancienne", corps: marqueurPour(ITEM.id), url: "https://github.com/x/y/pull/70", etat: "closed" },
    ];
    expect(rattachements(doublon).get(ITEM.id)).toBe("https://github.com/x/y/pull/91");
  });

  it("aucune PR marquée : aucun rattachement", () => {
    expect(rattachements([prs[2]]).size).toBe(0);
  });
});

// Le jeton et la cible de lancement vivent dans un module qui lit
// DEV_LINK_SECRET à l'appel : le secret est posé avant l'import dynamique.
describe("lien de lancement signé (livrable A)", () => {
  let mod: typeof import("../src/lib/dev/lien");

  beforeAll(async () => {
    process.env.DEV_LINK_SECRET = "secret-de-test-assez-long-pour-hmac";
    mod = await import("../src/lib/dev/lien");
  });

  it("un jeton signé vaut pour SON item, et seulement pour lui", async () => {
    const jeton = await mod.signDevToken(ITEM.id);
    expect(await mod.verifyDevToken(jeton, ITEM.id)).toBe(true);
    expect(await mod.verifyDevToken(jeton, "00000000-0000-0000-0000-000000000000")).toBe(false);
  });

  it("refuse un jeton absent, vide ou falsifié", async () => {
    expect(await mod.verifyDevToken(null, ITEM.id)).toBe(false);
    expect(await mod.verifyDevToken("", ITEM.id)).toBe(false);
    expect(await mod.verifyDevToken("eyJhbGciOiJIUzI1NiJ9.truque.signature", ITEM.id)).toBe(false);
  });

  it("l'URL Claude Code porte le prompt et le dépôt, sans envoyer le prompt", () => {
    const url = mod.urlClaudeCode("Corrige find_cible", "mattintouch/Collision");
    expect(url.startsWith("https://claude.ai/code?")).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get("prompt")).toBe("Corrige find_cible");
    expect(q.get("repositories")).toBe("mattintouch/Collision");
  });

  it("prompt court : redirection directe ; prompt trop long : page intermédiaire, jamais de troncature", () => {
    const court = mod.cibleLancement("Corrige find_cible", "mattintouch/Collision");
    expect(court.mode).toBe("redirection");

    const long = "x".repeat(mod.LONGUEUR_URL_MAX + 100);
    const bascule = mod.cibleLancement(long, "mattintouch/Collision");
    expect(bascule.mode).toBe("page");
    expect(bascule.url).not.toContain("prompt=");
    expect(bascule.url).toContain("repositories=");
  });

  it("le prompt réel de l'item de recette tient dans une redirection", () => {
    expect(mod.cibleLancement(construitPromptDev(ITEM), "mattintouch/Collision").mode).toBe("redirection");
  });
});
