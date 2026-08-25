import { describe, it, expect } from "vitest";
import {
  buildRecapEmail, normaliseCause, promptCorrection,
  nomsProches, dedoublonneAllies, retireCiblesDesAllies, statutValide, vaAuSandbox,
  demandesSemaine, stockDemandes, ageJours, groupesDoublons,
  type RecapData, type MouvementCible,
} from "../src/lib/recap/hebdo";

const data: RecapData = {
  depuis: "2026-07-20T00:00:00Z",
  mouvements: [
    { nom: "Fanny Jaulin", organisation: "Orakl Oncology", etape: "programmée", statut: "enregistrement calé le 28 juillet", allies: ["Louise Vidal", "Marc Petit"], rang: 1, fiche_url: "https://magellan.collision.studio/fiches/fanny-jaulin" },
    { nom: "Ariel Benzaquen", organisation: null, etape: "passée à contacté", statut: "allié ajouté cette semaine", allies: [], rang: 2 },
    { nom: "Zoé Nguyen", organisation: "Alan", etape: "qualifiée", statut: "mouvement cette semaine", allies: ["Paul Roux"], rang: 3 },
  ],
  sandbox: ["Nadia Fares", "Hugo Lippens", "Sarah Ourahmoune"],
  notes: [{ invite: "Raphaël Chiche", note: 4, commentaire: "Playbook décisif" }],
  besoins: [{ show: "gdiy", contrainte: "1 femme, épisode estival", periode: "été 2026", candidates: 1 }],
  generations: { done: 8, failed: 10 },
  echecs: [
    { cause: "timeout au delà du délai de garde", jobs: [{ nom: "Ariel Benzaquen", type: "profil" }, { nom: "Rudy Gobert", type: "deroule" }] },
    { cause: "recherche web sans résultat exploitable", jobs: [{ nom: "Tarik Benabdallah", type: "profil" }] },
  ],
  cout: { semaine_eur: 2.92, mois_eur: 3.43, plafond_eur: 200 },
  prompt_correction: null,
  backlog: [
    { id: "b1a2c3d4e5f6a7b8", auteur: "clemence@stefani.fr", contenu: "Rendre visibles depuis la régie les saisies faites sur la fiche pendant le REC", contexte: {}, type: "feature", resume: "Afficher sur la régie les saisies faites sur la fiche pendant le REC, pour que les deux opérateurs se voient écrire.", created_at: "2026-07-22T09:00:00Z" },
    { id: "z9y8x7w6v5u4t3s2", auteur: "clemence@stefani.fr", contenu: "Ajouter un filtre par ville", contexte: {}, type: "bug", resume: "Le filtre par ville manque au board.", created_at: "2026-07-01T09:00:00Z" },
  ],
  livraisons: [
    { resume: "La fiche de préparation se relit en un clin d'oeil : le brief d'attaque tient en 9 lignes en haut de fiche.", url: "https://github.com/mattintouch/Collision/pull/41" },
    { resume: "Le récap du lundi devient plus court et actionnable.", url: null },
  ],
  livraisons_incompletes: false,
  demandes_semaine: [
    { id: "b1a2c3d4e5f6a7b8", auteur: "clemence@stefani.fr", contenu: "Rendre visibles depuis la régie les saisies faites sur la fiche pendant le REC", contexte: {}, type: "feature", resume: "Afficher sur la régie les saisies faites sur la fiche pendant le REC, pour que les deux opérateurs se voient écrire.", created_at: "2026-07-22T09:00:00Z" },
  ],
  stock: { total: 9, anciens: 3 },
  doublons: [],
};

/** Texte visible de l'email : blocs pre exclus (prompts, tirets autorisés),
 *  balises retirées. C'est sur CE texte que porte la règle « aucun tiret ». */
function texteVisible(html: string): string {
  return html.replace(/<pre[\s\S]*?<\/pre>/g, " ").replace(/<[^>]+>/g, " ");
}

describe("récap hebdo v2 — structure", () => {
  it("v3 : produit exactement quatre sections, A puis B puis C puis D", () => {
    const { html } = buildRecapEmail(data);
    expect((html.match(/<h2/g) ?? []).length).toBe(4);
    const a = html.indexOf("A. Ce qui a bougé");
    const b = html.indexOf("B. Échecs et coûts");
    const c = html.indexOf("C. Magellan cette semaine");
    const d = html.indexOf("D. Demandes produit");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(c);
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

  it("un invité confirmé porte le lien vers sa fiche de préparation, les autres non", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toContain('href="https://magellan.collision.studio/fiches/fanny-jaulin"');
    expect(html).toContain(">Fiche de préparation</a>");
    // Un seul lien de fiche : Ariel et Zoé n'en portent pas.
    expect((html.match(/Fiche de préparation/g) ?? []).length).toBe(1);
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
    expect(html).toContain("Cause timeout au delà du délai de garde : Ariel Benzaquen (job profil), Rudy Gobert (job deroule). À relancer.");
    expect(html).toContain("Cause recherche web sans résultat exploitable : Tarik Benabdallah (job profil). À relancer.");
    expect((html.match(/timeout au delà du délai de garde/g) ?? []).length).toBe(1);
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

describe("récap hebdo v3 — C, Magellan cette semaine", () => {
  it("liste les livraisons en langage utilisateur, avec le lien détail discret", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toContain("le brief d'attaque tient en 9 lignes");
    expect(html).toContain('href="https://github.com/mattintouch/Collision/pull/41"');
  });

  it("une seule ligne explicite quand aucune livraison, jamais de section vide silencieuse", () => {
    const { html } = buildRecapEmail({ ...data, livraisons: [] });
    expect(html).toContain("Aucune livraison cette semaine.");
  });

  it("mention discrète quand GitHub était indisponible", () => {
    expect(buildRecapEmail(data).html).not.toContain("sans l'accès GitHub");
    const { html } = buildRecapEmail({ ...data, livraisons_incompletes: true });
    expect(html).toContain("elle peut être incomplète");
  });
});

describe("récap hebdo v3 — D, demandes produit", () => {
  it("affiche le résumé 2 lignes, l'auteur et l'âge, JAMAIS le verbatim complet", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toContain("pour que les deux opérateurs se voient écrire.");
    expect(html).toContain("clemence@stefani.fr");
    expect(html).not.toContain("Rendre visibles depuis la régie les saisies faites sur la fiche pendant le REC");
  });

  it("seuls les items de demandes_semaine paraissent en détail : le stock reste une ligne", () => {
    const { html } = buildRecapEmail(data);
    expect(html).not.toContain("Le filtre par ville manque au board.");
    expect(html).toContain("9 demandes en attente de triage, dont 3 de plus de 2 semaines");
    expect(html).toContain("/backlog");
  });

  it("chaque item porte Valider, Rejeter (claude.ai préremplis) et Voir le détail ancré", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toContain(`https://claude.ai/new?q=${encodeURIComponent("passe l'item b1a2c3d4 en a_faire")}`);
    expect(html).toContain(`https://claude.ai/new?q=${encodeURIComponent("rejette l'item b1a2c3d4")}`);
    expect(html).toContain("/backlog#b1a2c3d4");
    expect(html).toContain(">Valider</a>");
    expect(html).toContain(">Rejeter</a>");
    expect(html).toContain(">Voir le détail</a>");
  });

  it("le pied de page tient en une phrase et le méga-prompt a disparu", () => {
    const { html } = buildRecapEmail(data);
    expect(html).toContain("ouvrent une conversation Claude préremplie");
    expect(html).not.toContain("Prompt consolidé");
    expect(html).not.toContain("triage_backlog");
  });

  it("backlog à jour : ligne dédiée quand le stock est vide, section explicite sans demande", () => {
    const { html } = buildRecapEmail({ ...data, demandes_semaine: [], stock: { total: 0, anciens: 0 } });
    expect(html).toContain("Aucune demande nouvelle cette semaine.");
    expect(html).toContain("Le backlog est à jour");
  });

  it("échappe le HTML des résumés (anti-injection)", () => {
    const piege: RecapData = {
      ...data,
      demandes_semaine: [{ id: "b2c3d4e5f6a7", auteur: "x", contenu: "y", contexte: {}, resume: "<script>alert(1)</script>", created_at: "2026-07-22T09:00:00Z" }],
    };
    expect(buildRecapEmail(piege).html).not.toContain("<script>alert(1)</script>");
  });

  it("longueur : l'email complet du fixture reste sous 4 000 caractères hors prompts", () => {
    const { html } = buildRecapEmail(data);
    expect(html.replace(/<pre[\s\S]*?<\/pre>/g, "").length).toBeLessThan(4000);
  });
});

describe("P3 doublons — scan hebdomadaire et rendu", () => {
  it("groupe par nom normalisé et par show, singletons écartés, plus gros groupes d'abord", () => {
    const g = groupesDoublons([
      { show: "gdiy", nom: "Yuval Noah Harari", id: "a" },
      { show: "gdiy", nom: "yuval  noah HARARI", id: "b" },
      { show: "gdiy", nom: "Yuval Noah Harari", id: "c" },
      { show: "ccg", nom: "Yuval Noah Harari", id: "d" },
      { show: "gdiy", nom: "Rafaèle Tordjman", id: "e" },
      { show: "gdiy", nom: "Rafaele Tordjman", id: "f" },
      { show: "gdiy", nom: "Ben Smith", id: "g" },
    ]);
    expect(g).toHaveLength(2);
    expect(g[0].ids).toEqual(["a", "b", "c"]);
    expect(g[1].ids).toEqual(["e", "f"]);
  });

  it("l'email propose la fusion en un clic, rien quand le pipeline est propre", () => {
    expect(buildRecapEmail(data).html).not.toContain("Doublons détectés");
    const { html } = buildRecapEmail({ ...data, doublons: [{ show: "gdiy", nom: "Yuval Noah Harari", ids: ["a", "b", "c"] }] });
    expect(html).toContain("Doublons détectés");
    expect(html).toContain("Yuval Noah Harari (GDIY, 3 fiches");
    expect(html).toContain(`https://claude.ai/new?q=${encodeURIComponent("fusionne les doublons de Yuval Noah Harari sur gdiy : garde la fiche la plus complète comme survivante")}`);
  });
});

describe("récap hebdo v3 — helpers de la section D", () => {
  const items = [
    { id: "a".repeat(12), auteur: "x", contenu: "récente", contexte: {}, type: "feature", created_at: "2026-07-19T00:00:00Z" },
    { id: "b".repeat(12), auteur: "x", contenu: "note récente", contexte: {}, type: "note", created_at: "2026-07-21T00:00:00Z" },
    { id: "c".repeat(12), auteur: "x", contenu: "vieille demande", contexte: {}, type: "bug", created_at: "2026-06-01T00:00:00Z" },
    { id: "d".repeat(12), auteur: "x", contenu: "sans type ni date", contexte: {} },
  ];

  it("demandesSemaine garde la fenêtre et exclut TOUJOURS les notes", () => {
    const r = demandesSemaine(items, "2026-07-14T00:00:00Z");
    expect(r.map((i) => i.contenu)).toEqual(["récente"]);
  });

  it("stockDemandes compte hors notes, avec les anciens au delà de 14 jours", () => {
    const maintenant = new Date("2026-07-21T00:00:00Z").getTime();
    expect(stockDemandes(items, maintenant)).toEqual({ total: 3, anciens: 1 });
  });

  it("ageJours arrondit au jour plein et tolère l'absence de date", () => {
    const maintenant = new Date("2026-07-21T12:00:00Z").getTime();
    expect(ageJours("2026-07-19T00:00:00Z", maintenant)).toBe(2);
    expect(ageJours(undefined, maintenant)).toBe(0);
  });
});

describe("récap hebdo v2 — normalisation des causes", () => {
  it("regroupe les variantes sous une cause lisible", () => {
    expect(normaliseCause("timeout")).toBe("timeout au delà du délai de garde");
    expect(normaliseCause("timeout après 600s")).toBe("timeout au delà du délai de garde");
    expect(normaliseCause("Recherche web sans résultat exploitable")).toBe("recherche web sans résultat exploitable");
    expect(normaliseCause("Your credit balance is too low to access the Anthropic API")).toBe("crédit API épuisé");
    expect(normaliseCause("x".repeat(200)).length).toBe(80);
  });
});

describe("récap hebdo v2 — B3, prompt de correction conditionnel", () => {
  const timeout = "timeout au delà du délai de garde";

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

describe("logique de la partie A (chantier 2 du 27/07)", () => {
  it("2b : les graphies proches d'un même allié sont dédoublonnées, une seule conservée", () => {
    expect(dedoublonneAllies(["Kevin Beesley", "Kevin Beesly"])).toEqual(["Kevin Beesley"]);
    expect(dedoublonneAllies(["Kalem Mauvois", "Kevin Beesley"])).toEqual(["Kalem Mauvois", "Kevin Beesley"]);
    expect(nomsProches("Rafaèle Tordjman", "Rafaele Tordjman")).toBe(true);
    expect(nomsProches("Kevin Beesley", "Kalem Mauvois")).toBe(false);
  });

  it("2c : une personne qui a sa propre ligne de mouvement disparaît des alliés des autres lignes", () => {
    const mouvements: MouvementCible[] = [
      { nom: "Virginie Taittinger", organisation: "Taittinger", etape: "qualifiée", statut: "en progression", allies: ["Ferdinand Pougatch-Taittinger", "Vitalie Taittinger"], rang: 2 },
      { nom: "Ferdinand Pougatch-Taittinger", organisation: null, etape: "identifiée", statut: "entrée au pipeline cette semaine", allies: [], rang: 3 },
    ];
    const nets = retireCiblesDesAllies(mouvements);
    expect(nets[0].allies).toEqual(["Vitalie Taittinger"]);
    expect(nets[1].nom).toBe("Ferdinand Pougatch-Taittinger");
  });

  it("2d : jamais « enregistrement à caler » sur une cible enregistrée ou publiée (cas Tordjman)", () => {
    expect(statutValide("enregistre", null)).toBe("publication à venir");
    expect(statutValide("publie", null)).toBe("épisode publié");
    expect(statutValide("confirme", null)).toBe("enregistrement à caler");
    expect(statutValide("programme", null)).toBe("enregistrement à caler");
    expect(statutValide("confirme", "28 juillet")).toBe("enregistrement calé le 28 juillet");
  });

  it("2e : un big fish ou une pépite ne va JAMAIS au sandbox, même au stade identifie", () => {
    expect(vaAuSandbox({ archetype: "big_fish", priorite: null, nb_allies: 0 })).toBe(false); // Xavier Niel
    expect(vaAuSandbox({ archetype: "pepite", priorite: null, nb_allies: 0 })).toBe(false);
    expect(vaAuSandbox({ archetype: null, priorite: "haute", nb_allies: 0 })).toBe(false);
    expect(vaAuSandbox({ archetype: "quick_win", priorite: null, nb_allies: 0 })).toBe(false);
    expect(vaAuSandbox({ archetype: null, priorite: null, nb_allies: 1 })).toBe(false);
  });

  it("2e : le sandbox ne garde que les cibles sans archétype, sans priorité haute et sans allié", () => {
    expect(vaAuSandbox({ archetype: null, priorite: null, nb_allies: 0 })).toBe(true);
    expect(vaAuSandbox({ archetype: null, priorite: "normale", nb_allies: 0 })).toBe(true);
  });
});
