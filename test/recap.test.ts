import { describe, it, expect } from "vitest";
import { buildRecapEmail, type RecapData } from "../src/lib/recap/hebdo";

const data: RecapData = {
  depuis: "2026-07-10T00:00:00Z",
  ecritures: [{ outil: "log_touche", acteur: "matt@stefani.fr", total: 12, echecs: 1 }],
  generations: { done: 8, failed: 26, erreurs: [{ error: "Your credit balance is too low to access the Anthropic API", jobs: 24, objectifs: "portrait, chiffres, angles, deroule" }, { error: "timeout", jobs: 2, objectifs: "angles" }] },
  backlog: [{ id: "b1", auteur: "vadim", contenu: "Ajouter un filtre par ville", contexte: {} }],
  notes: [{ invite: "Raphaël Chiche", note: 4, commentaire: "Playbook décisif, chiffres à durcir" }],
  cout: { semaine_eur: 12.4, mois_eur: 57.8, plafond_eur: 200 },
  besoins: [{ show: "gdiy", contrainte: "1 femme, épisode estival, closing sous 15 jours", periode: "été 2026", candidates: 1 }],
};

describe("récap hebdo (chantier 1)", () => {
  it("produit exactement deux sections, A et B", () => {
    const { html } = buildRecapEmail(data, [{ id: "b1", triage: "a_faire", justification: "Clair et utile." }]);
    expect(html).toContain("A. Ce qui a bougé");
    expect(html).toContain("B. Demandes produit");
    expect((html.match(/<h2/g) ?? []).length).toBe(2); // pas de troisième section
  });
  it("porte les compteurs et le triage proposé", () => {
    const { subject, html } = buildRecapEmail(data, [{ id: "b1", triage: "a_faire", justification: "Clair et utile." }]);
    expect(subject).toContain("récap hebdo");
    expect(html).toContain("log_touche");
    expect(html).toContain("8 réussi(s)");
    expect(html).toContain("a_faire");
    expect(html).toContain("Ajouter un filtre par ville");
  });
  it("échappe le HTML des contenus (anti-injection)", () => {
    const piege: RecapData = { ...data, backlog: [{ id: "b2", auteur: "x", contenu: "<script>alert(1)</script>", contexte: {} }] };
    const { html } = buildRecapEmail(piege, [{ id: "b2", triage: "rejete", justification: "test" }]);
    expect(html).not.toContain("<script>alert(1)</script>");
  });
  it("section B explicite quand aucune demande", () => {
    const vide: RecapData = { ...data, backlog: [] };
    const { html } = buildRecapEmail(vide, []);
    expect(html).toContain("Aucune demande nouvelle");
  });
  it("regroupe les échecs par cause : une panne = une ligne (retour du 20/07)", () => {
    const { html } = buildRecapEmail(data, []);
    expect(html).toContain("Échec sur 24 job(s)");
    expect(html).toContain("portrait, chiffres, angles, deroule");
    // la cause n'apparaît qu'une fois, pas une ligne par job
    expect((html.match(/credit balance is too low/g) ?? []).length).toBe(1);
  });
  it("porte les besoins éditoriaux non couverts (chantier 4)", () => {
    const { html } = buildRecapEmail(data, []);
    expect(html).toContain("Besoin non couvert (GDIY)");
    expect(html).toContain("1 cible(s) actionnable(s), il en faut 2");
    expect((html.match(/<h2/g) ?? []).length).toBe(2); // toujours deux sections
  });
  it("porte la ligne de coût API quand la télémétrie existe (chantier 3)", () => {
    const { html } = buildRecapEmail(data, []);
    expect(html).toContain("Coût API estimé");
    expect(html).toContain("12.40 €");
    expect(html).toContain("plafond 200 €");
    const sansTelemetrie: RecapData = { ...data, cout: null };
    expect(buildRecapEmail(sansTelemetrie, []).html).not.toContain("Coût API estimé");
  });
  it("porte les notes de plateau de la semaine (chantier 2)", () => {
    const { html } = buildRecapEmail(data, []);
    expect(html).toContain("Note de plateau Raphaël Chiche");
    expect(html).toContain("4/5");
    expect(html).toContain("Playbook décisif");
    expect((html.match(/<h2/g) ?? []).length).toBe(2); // toujours deux sections
  });
});
