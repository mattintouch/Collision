import { describe, it, expect } from "vitest";
import { prendreVerrou, rendreVerrou } from "../src/lib/enrichment/verrou";

type SB = Parameters<typeof prendreVerrou>[0];

function fakeSb(store: Map<string, unknown>): SB {
  return {
    from(_t: string) {
      return {
        select: () => ({
          eq: (_c: string, key: string) => ({
            maybeSingle: async () => ({ data: store.has(key) ? { value: store.get(key) } : null, error: null }),
          }),
        }),
        upsert: async (row: { key: string; value: unknown }) => {
          store.set(row.key, row.value);
          return { error: null };
        },
      };
    },
  } as unknown as SB;
}

const T0 = Date.parse("2026-07-24T10:00:00Z");

describe("verrou de drainage (tâche 1, anti chevauchement)", () => {
  it("la première exécution prend le bail, la seconde passe son tour", async () => {
    const sb = fakeSb(new Map());
    expect(await prendreVerrou(sb, 280_000, T0)).toBe(true);
    expect(await prendreVerrou(sb, 280_000, T0 + 60_000)).toBe(false);
  });

  it("le bail expire seul (un crash ne bloque jamais la file)", async () => {
    const sb = fakeSb(new Map());
    await prendreVerrou(sb, 280_000, T0);
    expect(await prendreVerrou(sb, 280_000, T0 + 281_000)).toBe(true);
  });

  it("rendreVerrou libère immédiatement", async () => {
    const store = new Map<string, unknown>();
    const sb = fakeSb(store);
    await prendreVerrou(sb, 280_000, T0);
    await rendreVerrou(sb);
    expect(await prendreVerrou(sb, 280_000, T0 + 1_000)).toBe(true);
  });

  it("table absente (0038) : jamais bloquant", async () => {
    const casse = { from() { throw new Error("relation system_state does not exist"); } } as unknown as SB;
    expect(await prendreVerrou(casse, 280_000)).toBe(true);
    await expect(rendreVerrou(casse)).resolves.toBeUndefined();
  });
});
