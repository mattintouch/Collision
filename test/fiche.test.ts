import { describe, it, expect } from "vitest";
import { generateFicheHtml } from "../src/lib/fiche/generate";
import { FICHE_SECTIONS, FICHE_SECTION_IDS, sectionPosition } from "../src/lib/fiche/sections";
import { slugify, FICHE_STATUTS } from "../src/lib/fiche/store";
import { suggestQuestionsReseaux } from "../src/lib/fiche/questions";
import { buildVcf, buildVcard } from "../src/lib/vcf";

describe("catalogue des sections (brief GDIY)", () => {
  it("section_id uniques", () => {
    expect(new Set(FICHE_SECTION_IDS).size).toBe(FICHE_SECTION_IDS.length);
  });
  it("contient playbook (critère d'acceptation : une fiche sans playbook est un échec)", () => {
    expect(FICHE_SECTION_IDS).toContain("playbook");
  });
  it("ordre : en-tête avant playbook avant sources avant footer", () => {
    expect(sectionPosition("entete")).toBeLessThan(sectionPosition("playbook"));
    expect(sectionPosition("playbook")).toBeLessThan(sectionPosition("sources"));
    expect(sectionPosition("sources")).toBeLessThan(sectionPosition("footer"));
  });
  it("couvre les 19 sections du brief", () => {
    expect(FICHE_SECTIONS.length).toBe(19);
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
