import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildViewMigration, CIBLE_COLUMNS, VIEW_MIGRATION_FILENAME } from "../scripts/gen-view.mjs";

// Décision #2 — garde de dérive : la migration de vue commit DOIT être la sortie
// exacte du générateur. Si quelqu'un ajoute une colonne à `cibles` sans mettre à
// jour CIBLE_COLUMNS + régénérer (npm run gen:view), ce test casse → CI rouge →
// pas de déploiement (S1a). Fin du c.* figé, sans dérive silencieuse.
describe("cibles_enrichies — vue explicite générée", () => {
  const committed = readFileSync(
    join(__dirname, "..", "supabase", "migrations", VIEW_MIGRATION_FILENAME),
    "utf8"
  );

  it("la migration commit est synchrone avec le générateur", () => {
    expect(committed).toBe(buildViewMigration());
  });

  it("énumère explicitement les colonnes (plus de c.*)", () => {
    expect(committed).not.toContain("c.*");
    for (const col of CIBLE_COLUMNS) expect(committed).toContain(`c.${col}`);
  });

  it("préserve les colonnes calculées critiques du contrat", () => {
    for (const k of ["stage_key", "signal_frais", "watchlist_keys", "nb_appuis", "nb_relais_actionnables"]) {
      expect(committed).toContain(k);
    }
  });
});
