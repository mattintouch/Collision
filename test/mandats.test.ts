import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { MANDATS_MAX, asMandats } from "../src/lib/fiche/schema";

describe("mandats actuels du sticky header (brief du 13/09)", () => {
  it("asMandats exige la société, nettoie les champs et plafonne à quatre entrées", () => {
    expect(asMandats(null)).toEqual([]);
    expect(asMandats("texte")).toEqual([]);
    expect(asMandats([{ role: "CEO" }])).toEqual([]);
    expect(
      asMandats([
        { societe: "Relativity Space", role: "CEO et chairman", depuis: "2025-03", une_ligne: "lanceurs réutilisables Terran R, concurrent de SpaceX" },
        { societe: "Swift Beat", role: "CEO", depuis: "2023" },
        { societe: "  " },
      ])
    ).toEqual([
      { societe: "Relativity Space", role: "CEO et chairman", depuis: "2025-03", une_ligne: "lanceurs réutilisables Terran R, concurrent de SpaceX" },
      { societe: "Swift Beat", role: "CEO", depuis: "2023" },
    ]);
    const six = asMandats(Array.from({ length: 6 }, (_, i) => ({ societe: `S${i}` })));
    expect(six).toHaveLength(MANDATS_MAX);
  });

  it("le prompt du portrait demande le champ, en cours seulement, trié pour l'entretien", () => {
    const src = readFileSync("src/lib/fiche/generation.ts", "utf8");
    expect(src).toContain("MANDATS ACTUELS (champ mandats_actuels");
    expect(src).toContain('"mandats_actuels": [1 à 4');
    expect(src).toContain("triés par importance pour l'entretien");
    expect(src).toContain("jamais les anciens postes ni les simples investissements");
  });

  it("le rendu mappe le champ via asMandats et le sticky porte les pilules", () => {
    const page = readFileSync("src/app/fiches/[slug]/page.tsx", "utf8");
    expect(page).toContain("mandats_actuels: asMandats(identite.mandats_actuels)");
    const view = readFileSync("src/app/fiches/[slug]/FicheView.tsx", "utf8");
    expect(view).toContain('className="mandats"');
    expect(view).toContain("title={m.une_ligne}");
  });
});
