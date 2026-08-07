import { describe, it, expect } from "vitest";
import { LOOP_TOOLS } from "../src/lib/mcp/tools";

// Frontière dure Vadim : l'endpoint /api/loop/mcp ne doit JAMAIS exposer
// d'outil destructif/admin (contrat VADIM-CONTRAT.md, Option B).
describe("LOOP_TOOLS (endpoint Vadim)", () => {
  const forbidden = [
    "delete_appui", "delete_touche", "archive_cible", "sync_google_contacts", "enrich_cible",
    "enrich_colonne", "validate_cible", "create_cible", "add_contact", "attach_resolved_contacts",
    "update_appui", "set_episode_lock", "budget_override", "cancel_episode",
    // Réduction du 04/08 : parcours de masse et écriture sur le dossier lui-même.
    "list_shows", "list_cibles", "daily_five", "update_cible",
  ];
  for (const t of forbidden) {
    it(`n'expose pas ${t}`, () => expect(LOOP_TOOLS).not.toContain(t));
  }
  it("expose exactement les 6 outils utiles (décision du 04/08)", () => {
    expect([...LOOP_TOOLS].sort()).toEqual(
      ["add_appui", "add_appui_contact", "feedback", "find_cible", "get_dossier", "log_touche"].sort()
    );
  });
});
