import { describe, it, expect } from "vitest";
import { generateFicheHtml } from "../src/lib/fiche/generate";
import { FICHE_SECTIONS, FICHE_SECTION_IDS, sectionPosition, canonicalSectionId } from "../src/lib/fiche/sections";
import { slugify, FICHE_STATUTS } from "../src/lib/fiche/store";
import { SECTION_CONTRACTS, DEFAULT_CHECKLIST, DEFAULT_CHECKLIST_POST, googleImagesUrl } from "../src/lib/fiche/schema";
import { suggestQuestionsReseaux } from "../src/lib/fiche/questions";
import { buildVcf, buildVcard } from "../src/lib/vcf";

describe("catalogue des sections (brief GDIY)", () => {
  it("section_id uniques", () => {
    expect(new Set(FICHE_SECTION_IDS).size).toBe(FICHE_SECTION_IDS.length);
  });
  it("contrat v3.1 : neuf sections actives dans l'ordre imposé", () => {
    const actifs = FICHE_SECTIONS.filter((s) => !s.retire).map((s) => s.id);
    expect(actifs).toEqual([
      "sticky_header", "identite", "checklist_prerec", "tldr", "data",
      "apprentissages", "clips", "topics", "personnel", "revue_de_presse",
      "sources", "footer",
    ]);
  });
  it("les sections des contrats précédents restent lisibles, marquées retirées", () => {
    for (const id of ["recit_canonique", "mecanique_succes", "univers", "parcours", "anecdotes", "enjeu", "trente_secondes", "polemiques", "questions_recurrentes", "sequencage", "dix_questions", "zone_grise", "a_lire", "entourage", "tensions"]) {
      expect(FICHE_SECTION_IDS, `${id} doit rester au catalogue`).toContain(id);
      expect(FICHE_SECTIONS.find((s) => s.id === id)?.retire, `${id} doit être retirée`).toBe(true);
    }
    expect(FICHE_SECTIONS.length).toBe(27);
  });
  it("alias hérités : v2 (presentation, entreprise, sources_rapides) et v3.1 (entete, chiffres, playbook, questions_reseaux)", () => {
    expect(canonicalSectionId("presentation")).toBe("recit_canonique");
    expect(canonicalSectionId("entreprise")).toBe("univers");
    expect(canonicalSectionId("sources_rapides")).toBe("a_lire");
    expect(canonicalSectionId("entete")).toBe("identite");
    expect(canonicalSectionId("chiffres")).toBe("data");
    expect(canonicalSectionId("playbook")).toBe("apprentissages");
    expect(canonicalSectionId("questions_reseaux")).toBe("clips");
    expect(canonicalSectionId("topics")).toBe("topics");
    expect(sectionPosition("entete")).toBe(sectionPosition("identite"));
  });
  it("chaque section porte son contrat d'édition (get_section → update_section)", () => {
    for (const id of FICHE_SECTION_IDS) {
      expect(SECTION_CONTRACTS[id], `contrat manquant : ${id}`).toBeDefined();
    }
  });
  it("checklists v4 : sept gestes pré-rec, six post-rec (maquette du 31/08)", () => {
    expect(DEFAULT_CHECKLIST).toHaveLength(7);
    expect(DEFAULT_CHECKLIST).toContain("Mode avion sur les deux téléphones");
    expect(DEFAULT_CHECKLIST).toContain("Prévenir l'invité : on enregistre tout, on coupe au montage");
    expect(DEFAULT_CHECKLIST_POST).toHaveLength(6);
    expect(DEFAULT_CHECKLIST_POST[0]).toBe("Photos : invité seul, puis avec Matthieu");
  });
});

describe("store des fiches structurées", () => {
  it("slugify : accents retirés, minuscules, tirets", () => {
    expect(slugify("Raphaël Chiche")).toBe("raphael-chiche");
    expect(slugify("François O'Neil")).toBe("francois-o-neil");
    expect(slugify("  Étienne   Klein  ")).toBe("etienne-klein");
  });
  it("slugify : chaîne vide → repli stable", () => {
    expect(slugify("")).toBe("fiche");
    expect(slugify("!!!")).toBe("fiche");
  });
  it("statuts : la progression attendue du brief", () => {
    expect(FICHE_STATUTS).toEqual(["draft", "en_challenge", "finale", "verrouillee"]);
  });
});

describe("questions clips (questions_reseaux)", () => {
  it("mode démo (sans clé) : jeu réparti sur les ressorts", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const { questions, demo } = await suggestQuestionsReseaux({ nom: "Test Invité" }, 8);
      expect(demo).toBe(true);
      expect(questions.length).toBe(8);
      const ressorts = new Set(questions.map((q) => q.ressort));
      expect(ressorts.has("argent")).toBe(true);
      expect(ressorts.has("echec")).toBe(true);
      expect(ressorts.has("contre_pied")).toBe(true);
      expect(ressorts.has("confession")).toBe(true);
      // Style maison : pas de tiret cadratin dans les questions produites.
      expect(questions.every((q) => !q.question.includes("—"))).toBe(true);
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });
  it("borne le nombre demandé (min 3, max 12)", async () => {
    const prev = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const min = await suggestQuestionsReseaux({ nom: "X" }, 1);
      expect(min.questions.length).toBe(3);
    } finally {
      if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
    }
  });
});

describe("generateFicheHtml", () => {
  it("produit un document autonome avec les tokens Onesta", () => {
    const html = generateFicheHtml({ nom: "Claude Onesta", soustitre: "Haute performance" });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("#1B3FBF"); // cobalt
    expect(html).toContain("Claude Onesta");
    expect(html).toContain("Haute performance");
  });

  it("affiche « à alimenter » pour chaque section sans matière", () => {
    const html = generateFicheHtml({ nom: "X" });
    const count = (html.match(/Section à alimenter/g) ?? []).length;
    expect(count).toBe(10); // 00→09, aucune matière fournie
  });

  it("rend les sections alimentées et ne les marque pas manquantes", () => {
    const html = generateFicheHtml({
      nom: "X",
      mission: "Comprendre sa méthode de collectif.",
      chiffres: [{ valeur: "64", libelle: "médailles", source: "CNOSF" }],
      questions_reseaux: ["Ta plus grosse remise en question ?"],
      sources: [{ titre: "Interview", url: "https://exemple.fr/x", type: "article" }],
    });
    expect(html).toContain("Comprendre sa méthode");
    expect(html).toContain(">64<");
    expect(html).toContain("https://exemple.fr/x");
    // 10 sections - 4 alimentées = 6 manquantes
    expect((html.match(/Section à alimenter/g) ?? []).length).toBe(6);
  });

  it("échappe le HTML (anti-injection)", () => {
    const html = generateFicheHtml({ nom: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("neutralise un href non http", () => {
    const html = generateFicheHtml({ nom: "X", sources: [{ titre: "piège", url: "javascript:alert(1)" }] });
    expect(html).not.toContain("javascript:alert(1)");
  });
});

describe("buildVcf", () => {
  it("génère une vCard 3.0 valide", () => {
    const v = buildVcard({ nom: "Matt Stefani", emails: ["matt@collision.studio"], phones: ["+33600000000"], organisation: "Collision", role: "Host" });
    expect(v).toContain("BEGIN:VCARD");
    expect(v).toContain("VERSION:3.0");
    expect(v).toContain("FN:Matt Stefani");
    expect(v).toContain("N:Stefani;Matt;;;");
    expect(v).toContain("EMAIL;TYPE=INTERNET:matt@collision.studio");
    expect(v).toContain("ORG:Collision");
    expect(v).toContain("END:VCARD");
  });

  it("ne garde que les cartes utiles (nom + un moyen de contact)", () => {
    // A a un email → gardé ; "" sans nom → exclu ; B sans contact → exclu (B4).
    const vcf = buildVcf([{ nom: "A", emails: ["a@b.c"] }, { nom: "" }, { nom: "B" }, { nom: "C", phones: ["+33600"] }]);
    expect((vcf.match(/BEGIN:VCARD/g) ?? []).length).toBe(2);
  });

  it("échappe les caractères spéciaux vCard", () => {
    const v = buildVcard({ nom: "Doe; John", organisation: "A,B" });
    expect(v).toContain("A\\,B");
  });
});

describe("template v4 (maquette du 31/08)", async () => {
  const { tldrAccent, accentBarre, hauteurBarre, sujetZoneGrise } = await import("../src/app/fiches/[slug]/FicheView");
  const { appliquerRedaction } = await import("../src/lib/fiche/redaction");
  const { doublonsQuestions } = await import("../src/lib/fiche/lint");

  it("bouton photo : nom entre guillemets, URL encodée, accents compris", () => {
    expect(googleImagesUrl("Dimitri Rassam")).toBe("https://www.google.com/search?tbm=isch&q=%22Dimitri%20Rassam%22");
    const url = googleImagesUrl("Gérard Depardieu");
    expect(url).toContain("%22G%C3%A9rard%20Depardieu%22");
    expect(url.startsWith("https://www.google.com/search?tbm=isch&q=")).toBe(true);
  });

  it("accents du TL;DR : tension en vert, piège en rouge, levier ou « à lui faire lâcher » en or", () => {
    expect(tldrAccent("La tension de l'épisode")).toBe("green");
    expect(tldrAccent("Piège")).toBe("red");
    expect(tldrAccent("Le piège")).toBe("red");
    expect(tldrAccent("À lui faire lâcher")).toBe("gold");
    expect(tldrAccent("Levier")).toBe("gold");
    expect(tldrAccent("Qui")).toBeNull();
    expect(tldrAccent("Fait d'armes")).toBeNull();
  });

  it("barres de graph marché : accents et hauteurs relatives", () => {
    expect(accentBarre("noir").col).toBe("#16150F");
    expect(accentBarre("rouge").col).toBe("#D4231A");
    expect(accentBarre("jaune").col).toBe("#F5C542");
    expect(accentBarre(undefined).col).toBe("#C4C0B2");
    expect(hauteurBarre(42.3, 42.3)).toBe(140);
    expect(hauteurBarre(12, 42.3)).toBe(Math.round((12 / 42.3) * 140));
    expect(hauteurBarre(0.1, 100)).toBe(4); // plancher visuel
    expect(hauteurBarre(5, 0)).toBe(4); // série dégénérée : jamais de division par zéro
  });

  it("zones grises : sujet affiché depuis le champ, l'identifiant, ou les premiers mots", () => {
    expect(sujetZoneGrise({ sujet: "Jean-Pierre Rassam, le père", texte: "x" })).toBe("Jean-Pierre Rassam, le père");
    expect(sujetZoneGrise({ id: "zg_pere_suicide", texte: "x" })).toBe("pere suicide");
    expect(sujetZoneGrise({ texte: "Rythme annuel de Yapluka non tranché entre les sources" })).toBe("Rythme annuel de Yapluka…");
  });

  it("lint : une question du clickbait en double avec une brique est détectée", () => {
    const doublons = doublonsQuestions({
      clips: { piquantes: ["Sans le nom Rassam, tu les lèves, les 60 millions ?"], apprentissages: [] },
      topics: { topics: [{ titre: "T", questions: [{ num: "01", texte: "Sans le nom Rassam, tu les lèves, les 60 millions ?" }] }] },
    });
    expect(doublons).toHaveLength(1);
    expect(doublons[0].endroits.sort()).toEqual(["clips.piquantes[0]", "topics[0].questions[0]"]);
  });

  it("rédaction : une réécriture de data qui omet marche_graphs et lexique les conserve", () => {
    const actuel = {
      data: {
        kpis: [{ valeur: "60 M€", libelle: "levée", source: "communiqué, sept. 2026" }],
        marche_graphs: [{ titre: "G", type: "barres", valeurs: [{ label: "2019", valeur: 42, affiche: "42" }], source: "src" }],
        lexique: [{ terme: "Slate", definition: "le portefeuille de films" }],
      },
    };
    const admis = appliquerRedaction(actuel, { data: { kpis: [{ valeur: "60 M€", libelle: "levée Yapluka", source: "communiqué, sept. 2026" }] } });
    expect(admis.data.kpis).toHaveLength(1);
    expect(admis.data.marche_graphs).toEqual(actuel.data.marche_graphs);
    expect(admis.data.lexique).toEqual(actuel.data.lexique);
  });
});

describe("idées éditoriales — injection dans la génération (chantier du 27/08)", async () => {
  const { blocIdees } = await import("../src/lib/fiche/generation");

  it("le bloc impose l'intégration et porte type, texte et source", () => {
    const bloc = blocIdees([
      { type: "question", texte: "Lui faire raconter la nuit du closing raté de 2019", source_url: null },
      { type: "source", texte: "Vidéo Konbini où il détaille sa routine", source_url: "https://youtube.com/watch?v=x" },
    ]);
    expect(bloc).toContain("à INTÉGRER OBLIGATOIREMENT");
    expect(bloc).toContain("JAMAIS ignorée en silence");
    expect(bloc).toContain("[question] Lui faire raconter la nuit du closing raté de 2019");
    expect(bloc).toContain("[source] Vidéo Konbini où il détaille sa routine (source : https://youtube.com/watch?v=x)");
  });

  it("aucun bloc quand le backlog est vide", async () => {
    expect(blocIdees([])).toBe("");
  });
});
