import { describe, it, expect } from "vitest";
import { computeCibleScore, isPlaceholder, estivalActif, type ScoreInput } from "../src/lib/domain";

// « now » figé pour rendre la fraîcheur de signal déterministe.
const NOW = Date.parse("2026-07-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function base(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    nom: "Jean Test",
    role: "CEO",
    organisation: "Acme",
    archetype: null,
    note_priorite: null,
    voie: "froid",
    stage_key: "identifie",
    jours_depuis_touche: null,
    dernier_signal_date: null,
    dernier_signal_pertinence: null,
    nb_appuis: 0,
    nb_relais_actionnables: 0,
    ...over,
  };
}

describe("isPlaceholder", () => {
  const yes = ["Un chef étoilé local", "Founder Canvas", "Fondatrice Polène", "XX Hugel", "Delphine H (Ernotte?)", "CEO d'une licorne"];
  const no = ["Tony Parker", "Olivier Pomel", "Xavier Niel", "Édouard Meylan"];
  for (const n of yes) it(`flags « ${n} »`, () => expect(isPlaceholder(n, null, null)).toBe(true));
  for (const n of no) it(`n'flag pas « ${n} »`, () => expect(isPlaceholder(n, "CEO", "Org")).toBe(false));
  it("flag un jeton unique sans rôle ni orga", () => expect(isPlaceholder("Squeezie", null, null)).toBe(true));
});

describe("computeCibleScore — cas golden", () => {
  it("signal frais (≤14j) ajoute pertinence×4 + badge", () => {
    const r = computeCibleScore(base({ archetype: "big_fish", note_priorite: null, stage_key: "qualifie", jours_depuis_touche: 2, dernier_signal_date: daysAgo(13), dernier_signal_pertinence: 5, nb_appuis: 1 }), false, NOW);
    // base 4*8=32 + signal 5*4=20 + voie 0 + relais 2 + resurgence 0 (touché récent) + momentum +8 = 62
    expect(r.score).toBe(62);
    expect(r.badges).toContain("signal frais");
    expect(r.placeholder).toBe(false);
  });

  it("signal périmé (>14j) n'ajoute rien", () => {
    const r = computeCibleScore(base({ archetype: "big_fish", stage_key: "qualifie", jours_depuis_touche: 2, dernier_signal_date: daysAgo(40), dernier_signal_pertinence: 5, nb_appuis: 1 }), false, NOW);
    expect(r.score).toBe(42); // 32 + 0 + relais 2 + momentum 8
    expect(r.badges).not.toContain("signal frais");
  });

  it("gagné (≥confirme) est fortement pénalisé", () => {
    const won = computeCibleScore(base({ archetype: "big_fish", stage_key: "confirme", jours_depuis_touche: 6, nb_appuis: 1 }), false, NOW);
    expect(won.badges).toContain("gagné");
    const active = computeCibleScore(base({ archetype: "big_fish", stage_key: "contacte", jours_depuis_touche: 6, nb_appuis: 1 }), false, NOW);
    expect(active.score).toBeGreaterThan(won.score);
  });

  it("relais actionnable > appui simple", () => {
    const withRelais = computeCibleScore(base({ nb_appuis: 1, nb_relais_actionnables: 1 }), false, NOW);
    const withAppui = computeCibleScore(base({ nb_appuis: 1, nb_relais_actionnables: 0 }), false, NOW);
    expect(withRelais.score).toBeGreaterThan(withAppui.score);
    expect(withRelais.badges).toContain("relais actionnable");
  });

  it("fenêtre de relance (1–2× cadence) donne le max de résurgence", () => {
    const r = computeCibleScore(base({ voie: "froid", jours_depuis_touche: 20 }), false, NOW); // cadence 14 → [14;28]
    expect(r.badges).toContain("fenêtre de relance");
  });

  it("estival : tag estival remonte, cac40 en juillet descend", () => {
    const estivalOn = computeCibleScore(base({ archetype: "big_fish", note_priorite: 3, watchlist_keys: ["estival"], sujets: ["business"] }), true, NOW);
    const estivalOff = computeCibleScore(base({ archetype: "big_fish", note_priorite: 3, watchlist_keys: ["estival"], sujets: ["business"] }), false, NOW);
    expect(estivalOn.score).toBeGreaterThan(estivalOff.score);
    expect(estivalOn.badges).toContain("estival ☀");

    const cac40 = computeCibleScore(base({ archetype: "big_fish", note_priorite: 3, watchlist_keys: ["cac40"], sujets: ["finance"] }), true, NOW);
    const cac40Off = computeCibleScore(base({ archetype: "big_fish", note_priorite: 3, watchlist_keys: ["cac40"], sujets: ["finance"] }), false, NOW);
    expect(cac40.score).toBeLessThan(cac40Off.score);
    expect(cac40.badges).toContain("à reporter (sept.)");
  });

  it("placeholder détecté et signalé", () => {
    const r = computeCibleScore(base({ nom: "Un chef étoilé local", role: null, organisation: null }), false, NOW);
    expect(r.placeholder).toBe(true);
  });

  it("score borné 0–100", () => {
    const r = computeCibleScore(base({ note_priorite: 5, voie: "chaud", stage_key: "qualifie", jours_depuis_touche: 20, dernier_signal_date: daysAgo(1), dernier_signal_pertinence: 5, nb_appuis: 5, nb_relais_actionnables: 5 }), true, NOW);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("cohorte réelle golden — classement", () => {
  // Cas réels figés de la base, scorés hors saison estivale (juillet mais estival=false).
  const tonyParker = computeCibleScore(
    base({ nom: "Tony Parker", role: "Président", organisation: "ASVEL", archetype: "big_fish", note_priorite: 4, voie: "chaud", stage_key: "qualifie", jours_depuis_touche: 5, dernier_signal_date: daysAgo(6), dernier_signal_pertinence: 5, nb_appuis: 2, nb_relais_actionnables: 1 }),
    false, NOW
  );
  const aghionGagne = computeCibleScore(
    base({ nom: "Philippe Aghion", role: "Économiste", organisation: "Collège de France", archetype: "big_fish", stage_key: "publie", jours_depuis_touche: 90, nb_appuis: 1 }),
    false, NOW
  );
  const hugel = computeCibleScore(base({ nom: "XX Hugel", role: null, organisation: null }), false, NOW);

  it("Tony Parker (frais, big fish, relais) domine un gagné", () => {
    expect(tonyParker.score).toBeGreaterThan(aghionGagne.score);
    expect(tonyParker.badges).toContain("signal frais");
    expect(tonyParker.badges).toContain("relais actionnable");
    expect(tonyParker.placeholder).toBe(false);
  });

  it("Aghion gagné (publié) porte le badge gagné et coule au fond", () => {
    expect(aghionGagne.badges).toContain("gagné");
  });

  it("« XX Hugel » est un placeholder", () => {
    expect(hugel.placeholder).toBe(true);
  });
});

describe("estivalActif", () => {
  it("respecte le forçage explicite", () => {
    expect(estivalActif("ete")).toBe(true);
    expect(estivalActif("off")).toBe(false);
  });
  it("raisonne en date de PUBLICATION projetée, pas en mois courant (chantier 4 §5.5)", () => {
    // Décalage par défaut 45 jours : sourcing du 1er juin → publication mi-juillet, hors fenêtre.
    expect(estivalActif("auto", Date.parse("2026-06-01T12:00:00Z"))).toBe(false);
    // Sourcing du 10 juillet → publication fin août, fenêtre estivale.
    expect(estivalActif("auto", Date.parse("2026-07-10T12:00:00Z"))).toBe(true);
    // Sourcing du 1er août (l'ancienne règle coupait au 31 juillet) → publication mi-septembre, encore dans la fenêtre.
    expect(estivalActif("auto", Date.parse("2026-08-01T12:00:00Z"))).toBe(true);
    // Sourcing du 15 septembre → publication fin octobre, hors fenêtre.
    expect(estivalActif("auto", Date.parse("2026-09-15T12:00:00Z"))).toBe(false);
  });
});
