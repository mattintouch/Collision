import { describe, it, expect } from "vitest";
import { generateFicheHtml } from "../src/lib/fiche/generate";
import { FICHE_SECTIONS, FICHE_SECTION_IDS, sectionPosition, canonicalSectionId } from "../src/lib/fiche/sections";
import { slugify, FICHE_STATUTS } from "../src/lib/fiche/store";
import { SECTION_CONTRACTS, DEFAULT_CHECKLIST } from "../src/lib/fiche/schema";
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
  it("la checklist par défaut inclut machine à café et climatisation", () => {
    expect(DEFAULT_CHECKLIST).toContain("Éteindre la machine à café");
    expect(DEFAULT_CHECKLIST).toContain("Climatisation OK");
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
