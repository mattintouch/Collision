import { describe, it, expect } from "vitest";
import { scopesForRole } from "../src/lib/mcp/oauth";
import { requiredScope, LOOP_TOOLS } from "../src/lib/mcp/tools";

// S2 / décision #6 — portées read/write/admin.
describe("scopesForRole", () => {
  it("admin obtient read+write+admin", () => expect(scopesForRole("admin")).toEqual(["read", "write", "admin"]));
  it("interne obtient read+write", () => expect(scopesForRole("interne")).toEqual(["read", "write"]));
  it("externe obtient read seul", () => expect(scopesForRole("externe")).toEqual(["read"]));
  it("legacy / rôle inconnu : fail-open admin (pas de lockout)", () => {
    expect(scopesForRole(null)).toEqual(["read", "write", "admin"]);
    expect(scopesForRole(undefined)).toEqual(["read", "write", "admin"]);
    expect(scopesForRole("n'importe")).toEqual(["read", "write", "admin"]);
  });
});

describe("requiredScope", () => {
  it("écriture simple exige write", () => {
    expect(requiredScope("add_appui", {})).toBe("write");
    expect(requiredScope("log_touche", {})).toBe("write");
    expect(requiredScope("update_cible", {})).toBe("write");
    expect(requiredScope("add_appui_contact", {})).toBe("write");
  });
  it("destructif exige admin", () => {
    for (const t of ["delete_appui", "delete_touche", "archive_cible", "sync_google_contacts"]) {
      expect(requiredScope(t, {})).toBe("admin");
    }
  });
  it("enrich exige admin seulement si apply=true", () => {
    expect(requiredScope("enrich_cible", {})).toBe("write");
    expect(requiredScope("enrich_cible", { apply: true })).toBe("admin");
    expect(requiredScope("enrich_colonne", { apply: true })).toBe("admin");
    expect(requiredScope("enrich_colonne", { apply: false })).toBe("write");
  });
});

describe("cohérence Vadim (write) contre les scopes", () => {
  it("aucun outil de la boucle n'exige admin (write suffit)", () => {
    for (const t of LOOP_TOOLS) {
      // requiredScope ne s'applique qu'aux écritures ; les lectures ne passent pas par W().
      // On vérifie qu'aucune écriture de la boucle n'est classée admin.
      expect(requiredScope(t, { apply: true })).not.toBe("admin");
    }
  });
});
