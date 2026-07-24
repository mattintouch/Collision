import { describe, it, expect } from "vitest";
import { coutEstimeEur, verifierBudget, etatBudgetLecture, setBudgetOverride } from "../src/lib/ai/cout";

type SB = Parameters<typeof verifierBudget>[0];

interface FakeJob { objectif: string; model: string | null; tokens_in: number | null; tokens_out: number | null }

/** Faux client Supabase : jobs instrumentés + system_state en mémoire.
 *  jobs === null simule la migration 0039 absente (erreur de colonne). */
function fakeSb(jobs: FakeJob[] | null, state = new Map<string, unknown>()): SB {
  return {
    from(table: string) {
      if (table === "enrichment_jobs") {
        const chain = {
          select: () => chain,
          gte: () => chain,
          not: () => chain,
          limit: async () =>
            jobs === null
              ? { data: null, error: { message: "column enrichment_jobs.tokens_in does not exist" } }
              : { data: jobs, error: null },
        };
        return chain;
      }
      return {
        select: () => ({
          eq: (_c: string, key: string) => ({
            maybeSingle: async () => ({ data: state.has(key) ? { value: state.get(key) } : null, error: null }),
          }),
        }),
        upsert: async (row: { key: string; value: unknown }) => {
          state.set(row.key, row.value);
          return { error: null };
        },
      };
    },
  } as unknown as SB;
}

const NOW = Date.parse("2026-07-17T12:00:00Z");
const haiku = (tokensOut: number): FakeJob => ({ objectif: "fiche:portrait", model: "claude-haiku-4-5", tokens_in: 0, tokens_out: tokensOut });

describe("coutEstimeEur (chantier 3)", () => {
  it("applique la grille par famille de modèle", () => {
    expect(coutEstimeEur("claude-haiku-4-5", 1_000_000, 1_000_000)).toBe(6); // 1 + 5
    expect(coutEstimeEur("claude-sonnet-4-6", 1_000_000, 1_000_000)).toBe(18); // 3 + 15
  });
  it("replie sur le prix par défaut pour un modèle inconnu", () => {
    expect(coutEstimeEur("mystere-9000", 1_000_000, 0)).toBe(3);
    expect(coutEstimeEur(null, 0, 1_000_000)).toBe(15);
  });
});

describe("plafond budget mensuel (200 €, alerte 80, coupure 100)", () => {
  it("sous 80 pour cent : rien ne bloque, aucune alerte", async () => {
    const sb = fakeSb([haiku(10_000_000)]); // 50 €
    const b = await verifierBudget(sb, NOW);
    expect(b.depense_eur).toBe(50);
    expect(b.bloque).toBe(false);
    expect(b.alertes_dues).toEqual([]);
  });

  it("à 85 pour cent : alerte 80 déclenchée UNE fois, générations non bloquées", async () => {
    const state = new Map<string, unknown>();
    const sb = fakeSb([haiku(34_000_000)], state); // 170 €
    const premier = await verifierBudget(sb, NOW);
    expect(premier.alertes_dues).toEqual(["80"]);
    expect(premier.bloque).toBe(false);
    const second = await verifierBudget(sb, NOW);
    expect(second.alertes_dues).toEqual([]); // marqueur posé, pas de spam
  });

  it("à 105 pour cent : coupure, alertes 80 et 100 dues", async () => {
    const state = new Map<string, unknown>();
    const sb = fakeSb([haiku(42_000_000)], state); // 210 €
    const b = await verifierBudget(sb, NOW);
    expect(b.bloque).toBe(true);
    expect(b.alertes_dues).toEqual(["80", "100"]);
  });

  it("l'override admin lève la coupure pour le mois en cours", async () => {
    const state = new Map<string, unknown>();
    const sb = fakeSb([haiku(42_000_000)], state); // 210 €
    await setBudgetOverride(sb, true, NOW);
    const b = await verifierBudget(sb, NOW);
    expect(b.override).toBe(true);
    expect(b.bloque).toBe(false);
    // Le mois suivant, l'override expire de lui-même.
    const aout = Date.parse("2026-08-02T12:00:00Z");
    const bAout = await verifierBudget(sb, aout);
    expect(bAout.override).toBe(false);
  });

  it("télémétrie absente (0039 non appliquée) : dépense inconnue, jamais bloquant", async () => {
    const sb = fakeSb(null);
    const b = await verifierBudget(sb, NOW);
    expect(b.depense_eur).toBeNull();
    expect(b.bloque).toBe(false);
    expect(b.alertes_dues).toEqual([]);
  });

  it("etatBudgetLecture ne pose AUCUN marqueur (l'alerte reste due)", async () => {
    const state = new Map<string, unknown>();
    const sb = fakeSb([haiku(34_000_000)], state); // 170 €
    const lecture = await etatBudgetLecture(sb, NOW);
    expect(lecture.ratio).toBeCloseTo(0.85);
    const apres = await verifierBudget(sb, NOW);
    expect(apres.alertes_dues).toEqual(["80"]); // la lecture n'a rien consommé
  });
});

describe("recherches web dans le coût (tâche 6 du handoff)", () => {
  it("compte 10 € les 1000 requêtes en plus des tokens", async () => {
    const sb = fakeSb([{ objectif: "fiche:portrait", model: "claude-haiku-4-5", tokens_in: 0, tokens_out: 0, web_searches: 500 } as FakeJob & { web_searches: number }]);
    const b = await verifierBudget(sb, NOW);
    expect(b.depense_eur).toBe(5);
  });
  it("sans la colonne (0042 non appliquée) : coût tokens seuls, jamais bloquant", async () => {
    const sb = fakeSb([haiku(1_000_000)]); // 5 €, web_searches absent
    const b = await verifierBudget(sb, NOW);
    expect(b.depense_eur).toBe(5);
  });
});
