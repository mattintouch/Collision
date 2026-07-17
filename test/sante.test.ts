import { describe, it, expect } from "vitest";
import { classifyApiError, sanitizeError, breakerOuvert, breakerEchec, breakerSucces } from "../src/lib/ai/sante";

type SB = Parameters<typeof breakerOuvert>[0];

/** Faux client Supabase : system_state en mémoire, juste ce que le breaker utilise. */
function fakeSb(store: Map<string, unknown>): SB {
  return {
    from(_table: string) {
      return {
        select() {
          return {
            eq(_col: string, key: string) {
              return {
                maybeSingle: async () => ({ data: store.has(key) ? { value: store.get(key) } : null, error: null }),
              };
            },
          };
        },
        upsert: async (row: { key: string; value: unknown }) => {
          store.set(row.key, row.value);
          return { error: null };
        },
      };
    },
  } as unknown as SB;
}

describe("classifyApiError (chantier 2)", () => {
  it("classe un crédit épuisé en credit", () => {
    expect(classifyApiError("Your credit balance is too low to access the Anthropic API")).toBe("credit");
  });
  it("classe surcharge, 5xx et réseau en transitoire", () => {
    expect(classifyApiError("Overloaded")).toBe("transitoire");
    expect(classifyApiError("HTTP 529")).toBe("transitoire");
    expect(classifyApiError("fetch failed")).toBe("transitoire");
    expect(classifyApiError("read ECONNRESET")).toBe("transitoire");
  });
  it("classe un JSON illisible en autre (pas de retry complet)", () => {
    expect(classifyApiError("Recherche web sans résultat exploitable")).toBe("autre");
    expect(classifyApiError("JSON illisible dans la réponse")).toBe("autre");
  });
});

describe("sanitizeError (garde-fou §8.2, aucun secret dans les journaux)", () => {
  it("masque les clés API et les jetons", () => {
    const out = sanitizeError("401 avec sk-ant-api03-abcDEF123 et Authorization: Bearer eyJhbGciOi.abc-def");
    expect(out).not.toContain("sk-ant-api03-abcDEF123");
    expect(out).toContain("sk-ant-***");
    expect(out).not.toContain("eyJhbGciOi");
  });
  it("tronque les messages interminables", () => {
    expect(sanitizeError("x".repeat(2000)).length).toBeLessThanOrEqual(500);
  });
});

describe("disjoncteur API (persisté dans system_state)", () => {
  const T0 = Date.parse("2026-07-17T10:00:00Z");
  const MIN = 60_000;

  it("s'ouvre après 3 échecs transitoires dans la fenêtre, une seule fois", async () => {
    const sb = fakeSb(new Map());
    expect(await breakerEchec(sb, "Overloaded", "transitoire", T0)).toBe(false);
    expect(await breakerEchec(sb, "Overloaded", "transitoire", T0 + MIN)).toBe(false);
    expect(await breakerEchec(sb, "Overloaded", "transitoire", T0 + 2 * MIN)).toBe(true); // vient de s'ouvrir
    const etat = await breakerOuvert(sb, T0 + 3 * MIN);
    expect(etat.ouvert).toBe(true);
    // Un échec de plus n'est pas une nouvelle ouverture (une alerte, pas quatre).
    expect(await breakerEchec(sb, "Overloaded", "transitoire", T0 + 4 * MIN)).toBe(false);
  });

  it("les échecs espacés hors fenêtre ne l'ouvrent pas", async () => {
    const sb = fakeSb(new Map());
    expect(await breakerEchec(sb, "Overloaded", "transitoire", T0)).toBe(false);
    expect(await breakerEchec(sb, "Overloaded", "transitoire", T0 + 11 * MIN)).toBe(false);
    expect(await breakerEchec(sb, "Overloaded", "transitoire", T0 + 22 * MIN)).toBe(false);
    expect((await breakerOuvert(sb, T0 + 23 * MIN)).ouvert).toBe(false);
  });

  it("un crédit épuisé l'ouvre immédiatement", async () => {
    const sb = fakeSb(new Map());
    expect(await breakerEchec(sb, "credit balance is too low", "credit", T0)).toBe(true);
    expect((await breakerOuvert(sb, T0 + MIN)).ouvert).toBe(true);
  });

  it("se referme seul après la durée d'ouverture, et sur succès", async () => {
    const store = new Map<string, unknown>();
    const sb = fakeSb(store);
    await breakerEchec(sb, "credit balance is too low", "credit", T0);
    expect((await breakerOuvert(sb, T0 + 31 * MIN)).ouvert).toBe(false); // expiration (30 min)
    await breakerEchec(sb, "credit balance is too low", "credit", T0 + 40 * MIN);
    await breakerSucces(sb);
    expect((await breakerOuvert(sb, T0 + 41 * MIN)).ouvert).toBe(false);
  });

  it("ne stocke jamais de secret dans l'état persisté", async () => {
    const store = new Map<string, unknown>();
    const sb = fakeSb(store);
    await breakerEchec(sb, "401 sk-ant-api03-abcDEF123", "credit", T0);
    expect(JSON.stringify([...store.values()])).not.toContain("sk-ant-api03-abcDEF123");
  });

  it("reste inoffensif si la table est absente (0038 non appliquée)", async () => {
    const casse = { from() { throw new Error("relation system_state does not exist"); } } as unknown as SB;
    expect((await breakerOuvert(casse)).ouvert).toBe(false);
    expect(await breakerEchec(casse, "Overloaded", "transitoire")).toBe(false);
    await expect(breakerSucces(casse)).resolves.toBeUndefined();
  });
});
