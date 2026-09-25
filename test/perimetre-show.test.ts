import { describe, it, expect } from "vitest";
import { avecPerimetre, perimetreCourant, showDansPerimetre, showsAutorises } from "../src/lib/mcp/perimetre";

// Prérequis 1.3 du brief La Martingale : un membre restreint ne doit atteindre
// que ses shows à travers le connecteur MCP, qui passe par le service role et
// contourne donc la RLS.
const GDIY = "804b9bce-e84e-4233-aeb1-17e38f1d4ca5";
const MARTINGALE = "11111111-2222-3333-4444-555555555555";

describe("périmètre par show (connecteur MCP)", () => {
  it("hors périmètre, tout est autorisé : admin et interne ne changent pas de comportement", async () => {
    await avecPerimetre(null, async () => {
      expect(showDansPerimetre(GDIY)).toBe(true);
      expect(showDansPerimetre(MARTINGALE)).toBe(true);
      expect(showsAutorises()).toBeNull();
    });
  });

  it("un membre restreint atteint son show et pas les autres", async () => {
    await avecPerimetre([MARTINGALE], async () => {
      expect(showDansPerimetre(MARTINGALE)).toBe(true);
      expect(showDansPerimetre(GDIY)).toBe(false);
      expect(showsAutorises()).toEqual([MARTINGALE]);
    });
  });

  it("un show absent ou nul n'est jamais dans un périmètre restreint", async () => {
    await avecPerimetre([MARTINGALE], async () => {
      expect(showDansPerimetre(null)).toBe(false);
      expect(showDansPerimetre(undefined)).toBe(false);
      expect(showDansPerimetre("")).toBe(false);
    });
  });

  it("une liste VIDE ferme tout : un externe sans accès ne voit aucun show", async () => {
    // Le piège inverse serait de lire une liste vide comme « pas de
    // restriction » : un membre externe sans aucune ligne user_shows verrait
    // alors la base entière. Seule l'absence de clé dans le jeton (admin,
    // interne) lève le filtre.
    await avecPerimetre([], async () => {
      expect(showsAutorises()).toEqual([]);
      expect(showDansPerimetre(GDIY)).toBe(false);
      expect(showDansPerimetre(MARTINGALE)).toBe(false);
    });
  });

  it("le périmètre ne fuit pas hors de son appel", async () => {
    await avecPerimetre([MARTINGALE], async () => {
      expect(showsAutorises()).toEqual([MARTINGALE]);
    });
    expect(perimetreCourant().shows).toBeNull();
    expect(showDansPerimetre(GDIY)).toBe(true);
  });

  it("le périmètre suit à travers les appels imbriqués et asynchrones", async () => {
    await avecPerimetre([MARTINGALE], async () => {
      await new Promise((r) => setTimeout(r, 1));
      expect(showDansPerimetre(GDIY)).toBe(false);
      await avecPerimetre([GDIY], async () => {
        expect(showDansPerimetre(GDIY)).toBe(true);
      });
      expect(showDansPerimetre(GDIY)).toBe(false);
    });
  });
});

// Correction du 25/09 : le périmètre se lit dans user_shows, pas dans le rôle.
// Lier le périmètre au seul rôle « externe » condamnait un collaborateur
// extérieur à la lecture seule (scopesForRole("externe") ne donne que "read"),
// alors que le brief lui demande de travailler sur son show.
describe("rôle et périmètre sont deux questions distinctes", () => {
  it("un membre restreint garde ses droits d'écriture dans son périmètre", async () => {
    const { scopesForRole } = await import("../src/lib/mcp/oauth");
    // Lhou : interne (donc écriture) mais restreinte à un seul show.
    expect(scopesForRole("interne")).toContain("write");
    await avecPerimetre([MARTINGALE], async () => {
      expect(showDansPerimetre(MARTINGALE)).toBe(true);
      expect(showDansPerimetre(GDIY)).toBe(false);
    });
    // Le rôle externe, lui, resterait en lecture seule : ce n'est pas le
    // réglage attendu pour quelqu'un qui doit produire.
    expect(scopesForRole("externe")).toEqual(["read"]);
  });
});
