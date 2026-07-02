import { describe, it, expect } from "vitest";
import { LOOP_TOOLS } from "../src/lib/mcp/tools";

// Frontière dure Vadim : l'endpoint /api/loop/mcp ne doit JAMAIS exposer
// d'outil destructif/admin (contrat VADIM-CONTRAT.md, Option B).
describe("LOOP_TOOLS (endpoint Vadim)", () => {
  const forbidden = ["delete_appui", "delete_touche", "archive_cible", "sync_google_contacts", "enrich_cible", "enrich_colonne", "validate_cible", "create_cible", "add_contact", "attach_resolved_contacts", "update_appui"];
  for (const t of forbidden) {
    it(`n'expose pas ${t}`, () => expect(LOOP_TOOLS).not.toContain(t));
  }
  it("expose exactement les 8 outils de la boucle", () => {
    expect([...LOOP_TOOLS].sort()).toEqual(
      ["add_appui", "daily_five", "find_cible", "get_dossier", "list_cibles", "list_shows", "log_touche", "update_cible"].sort()
    );
  });
});
