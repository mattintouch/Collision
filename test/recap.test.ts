import { describe, it, expect } from "vitest";
import { buildRecapEmail, normaliseCause, promptCorrection, type RecapData } from "../src/lib/recap/hebdo";

const data: RecapData = {
  depuis: "2026-07-20T00:00:00Z",
  mouvements: [
    { nom: "Fanny Jaulin", organisation: "Orakl Oncology", etape: "programmée", statut: "enregistrement calé le 28 juillet", allies: ["Louise Vidal", "Marc Petit"], rang: 1 },
    { nom: "Ariel Benzaquen", organisation: null, etape: "passée à contacté", statut: "allié ajouté cette semaine", allies: [], rang: 2 },
    { nom: "Zoé Nguyen", organisation: "Alan", etape: "qualifiée", statut: "mouvement cette semaine", allies: ["Paul Roux"], rang: 3 },
  ],
  sandbox: ["Nadia Fares", "Hugo Lippens", "Sarah Ourahmoune"],
  notes: [{ invite: "Raphaël Chiche", note: 4, commentaire: "Playbook décisif" }],
  besoins: [{ show: "gdiy", contrainte: "1 femme, épisode estival", periode: "été 2026", candidates: 1 }],
  generations: { done: 8, failed: 10 },
  echecs: [
    { cause: "timeout au delà de 10 minutes", jobs: [{ nom: "Ariel Benzaquen", type: "profil" }, { nom: "Rudy Gobert", type: "deroule" }] },
    { cause: "recherche web sans résultat exploitable", jobs: [{ nom: "Tarik Benabdallah", type: "profil" }] },
  ],
  cout: { semaine_eur: 2.92, mois_eur: 3.43, plafond_eur: 200 },
  prompt_correction: null,
  backlog: [
    { id: "b1a2c3d4e5f6a7b8", auteur: "clemence@stefani.fr", contenu: "Rendre visibles depuis la régie les saisies faites sur la fiche pendant le REC", contexte: {} },
    { id: "z9y8x7w6v5u4t3s2", auteur: "clemence@stefani.fr", contenu: "Ajouter un filtre par ville", contexte: {} },
  ],
  mega_prompt: null,
};

/** Texte visible de l'email : blocs pre exclus (prompts, tirets autorisés),
 *  balises retirées. C'est sur CE texte que porte la règle « aucun tiret ». */
function texteVisible(html: string): string {
  return html.replace(/<pre[\s\S]*?<\/pre>/g, " ").replace(/<[^>]+>/g, " ");
}

describe("récap hebdo v2 — structure", () => {
  it("produit exactement trois sections, A puis B puis C", () => {
    const { html } = buildRecapEmail(data);
    expect((html.match(/<h2/g) ?? []).length).toBe(3);
    const a = html.indexOf("A. Ce qui a bougé");
    const b = html.indexOf("B. Échecs et coûts");
    const c = html.indexOf("C. Demandes produit");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("la signature « Collision Productions » est seule sur sa ligne, en clôture", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toMatch(/<p [^>]*>Collision Productions<\/p>\s*<\/body>/);
  });
});

describe("récap hebdo v2 — A, mouvements prioritaires", () => {
  it("une ligne par personne : nom, organisation, étape, statut, alliés", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toContain("<b>Fanny Jaulin</b> (Orakl Oncology), programmée, enregistrement calé le 28 juillet. Alliés : Louise Vidal, Marc Petit.");
  });

  it("« Alliés : aucun. » quand la cible n'a pas d'appui", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toContain("<b>Ariel Benzaquen</b>, passée à contacté, allié ajouté cette semaine. Alliés : aucun.");
  });

  it("l'ordre de rang est respecté : validés, puis urgents, puis notables", () => {
    const { html } = buildRecapEmail(data);
    const fanny = html.indexOf("Fanny Jaulin");
    const ariel = html.indexOf("Ariel Benzaquen");
    const zoe = html.indexOf("Zoé Nguyen");
    expect(fanny).toBeLessThan(ariel);
    expect(ariel).toBeLessThan(zoe);
  });

  it("section explicite quand aucun mouvement", () => {
    const { html } = buildRecapEmail({ ...data, mouvements: [] });
    expect(html).toContain("Aucun mouvement prioritaire cette semaine.");
  });

  it("le sandbox est un paragraphe unique, noms séparés par des tirets", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toContain("Nadia Fares - Hugo Lippens - Sarah Ourahmoune");
    expect(html).toContain("aucune action requise");
  });
});

describe("récap hebdo v2 — règle des tirets", () => {
  it("aucun tiret dans le texte visible, hors séparateurs du sandbox", () => {
    const avecPrompts: RecapData = {
      ...data,
      prompt_correction: "Découpe la recherche web en sous-requêtes plus courtes.",
      mega_prompt: "Contexte : la console de fiche est temps réel.",
    };
    const { html } = buildRecapEmail(avecPrompts);
    const texte = texteVisible(html).replace("Nadia Fares - Hugo Lippens - Sarah Ourahmoune", " ");
    expect(texte).not.toMatch(/[—–-]/);
  });

  it("aucun tiret cadratin nulle part, même dans le sandbox", () => {
    const { html } = buildRecapEmail(data);
    expect(texteVisible(html)).not.toMatch(/[—–]/);
  });
});

describe("récap hebdo v2 — B, échecs et coûts", () => {
  it("chaque échec nomme sa fiche, son type de job et sa cause, groupés par cause", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toContain("Cause timeout au delà de 10 minutes : Ariel Benzaquen (job profil), Rudy Gobert (job deroule). À relancer.");
    expect(html).toContain("Cause recherche web sans résultat exploitable : Tarik Benabdallah (job profil). À relancer.");
    expect((html.match(/timeout au delà de 10 minutes/g) ?? []).length).toBe(1);
  });

  it("porte les compteurs et la ligne de coût", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toContain("8 réussie(s)");
    expect(html).toContain("2.92 €");
    expect(html).toContain("plafond 200 €");
    expect(buildRecapEmail({ ...data, cout: null }).html).not.toContain("Coût API estimé");
  });

  it("le prompt de correction n'apparaît QUE s'il est fourni (échec systématique)", () => {
    expect(buildRecapEmail(data).html).not.toContain("Échec systématique détecté");
    const { html } = buildRecapEmail({ ...data, prompt_correction: "Découpe la recherche web en sous-requêtes plus courtes." });
    expect(html).toContain("Échec systématique détecté");
    expect(html).toContain("sous-requêtes plus courtes");
  });
});

describe("récap hebdo v2 — C, demandes produit", () => {
  it("demandes brutes verbatim, groupées par auteur, identifiant visible", () => {
    const { html } = buildRecapEmail(data);
    expect((html.match(/clemence@stefani\.fr/g) ?? []).length).toBe(1); // un seul groupe
    expect(html).toContain("Rendre visibles depuis la régie les saisies faites sur la fiche pendant le REC");
    expect(html).toContain("(id : b1a2c3d4)");
    expect(html).toContain("(id : z9y8x7w6)");
  });

  it("le pied d'action utilise un identifiant réel et cite triage_backlog", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toContain("passe l'item b1a2c3d4 en a_faire");
    expect(html).toContain("rejette l'item b1a2c3d4");
    expect(html).toContain("triage_backlog");
  });

  it("le méga-prompt s'affiche en bloc unique quand il existe", () => {
    const { html } = buildRecapEmail({ ...data, mega_prompt: "Contexte : la console est temps réel." });
    expect(html).toContain("Prompt consolidé à coller dans Claude Code");
    expect(html).toContain("Contexte : la console est temps réel.");
  });

  it("section explicite et pied d'action absent quand aucune demande", () => {
    const { html } = buildRecapEmail({ ...data, backlog: [], mega_prompt: null });
    expect(html).toContain("Aucune demande nouvelle");
    expect(html).not.toContain("passe l'item");
  });

  it("échappe le HTML des contenus (anti-injection)", () => {
    const piege: RecapData = { ...data, backlog: [{ id: "b2c3d4e5f6a7", auteur: "x", contenu: "<script>alert(1)</script>", contexte: {} }] };
    expect(buildRecapEmail(piege).html).not.toContain("<script>alert(1)</script>");
  });
});

describe("récap hebdo v2 — normalisation des causes", () => {
  it("regroupe les variantes sous une cause lisible", () => {
    expect(normaliseCause("timeout")).toBe("timeout au delà de 10 minutes");
    expect(normaliseCause("timeout après 600s")).toBe("timeout au delà de 10 minutes");
    expect(normaliseCause("Recherche web sans résultat exploitable")).toBe("recherche web sans résultat exploitable");
    expect(normaliseCause("Your credit balance is too low to access the Anthropic API")).toBe("crédit API épuisé");
    expect(normaliseCause("x".repeat(200)).length).toBe(80);
  });
});

describe("récap hebdo v2 — B3, prompt de correction conditionnel", () => {
  const timeout = "timeout au delà de 10 minutes";

  it("un incident ponctuel ne produit PAS de prompt", () => {
    expect(promptCorrection([{ cause: timeout, cible_id: "a" }], [])).toBeNull();
    expect(promptCorrection(
      [{ cause: timeout, cible_id: "a" }, { cause: timeout, cible_id: "b" }, { cause: timeout, cible_id: "c" }],
      [] // cause absente la semaine précédente, moins de 5 fiches : ponctuel
    )).toBeNull();
  });

  it("la semaine réelle du 27/07 (6 timeouts, 2 seulement la semaine passée) reste sans prompt", () => {
    const semaine = ["a", "b", "c", "a", "b", "c"].map((id) => ({ cause: timeout, cible_id: id }));
    expect(promptCorrection(semaine, [{ cause: timeout }, { cause: timeout }])).toBeNull();
  });

  it("une cause massive sur deux semaines (3 jobs et plus chaque semaine) déclenche le prompt", () => {
    const p = promptCorrection(
      [{ cause: timeout, cible_id: "a" }, { cause: timeout, cible_id: "b" }, { cause: timeout, cible_id: "a" }],
      [{ cause: timeout }, { cause: timeout }, { cause: timeout }]
    );
    expect(p).toContain("Découpe la recherche web en sous-requêtes plus courtes");
    expect(p).toContain("retry avec backoff");
  });

  it("une cause massive (5 fiches distinctes) déclenche le prompt même sans historique", () => {
    const cause = "recherche web sans résultat exploitable";
    const p = promptCorrection(
      ["a", "b", "c", "d", "e"].map((id) => ({ cause, cible_id: id })),
      []
    );
    expect(p).toContain("repli à une seule requête large");
  });
});
