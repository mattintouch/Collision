// Correctif anti-répétition (brief du 27/07), règle 5 : le lint de fiche.
// Mesure NON destructive : détecte les séquences recopiées entre sections,
// les chiffres remarquables répétés hors section propriétaire, les
// dépassements de budget et le méta narratif. Sert l'outil MCP lint_fiche,
// alimente la passe de rédaction, et fournit les critères d'acceptation
// (« zéro doublon bloquant sur une fiche fraîchement générée »).

import { BUDGETS_V3 } from "./schema";

type Content = Record<string, unknown>;

/** Propriétaire canonique par type de fait (règle 1) : sert au verdict
 *  « garder ici, pointer ailleurs ». */
export const PROPRIETAIRES: Record<string, string> = {
  chiffres: "données chiffrées sourcées",
  zone_grise: "statuts de vérification et chiffres non tranchés",
  parcours: "chronologie datée",
  enjeu: "cadrage éditorial de l'épisode",
  a_lire: "lectures recommandées curées",
  entourage: "personnes de l'écosystème",
};

export interface DoublonSequence {
  extrait: string;        // la séquence répétée (12 mots)
  sections: string[];     // sections où elle apparaît
  proprietaire: string | null; // section propriétaire présumée (si elle en fait partie)
}

export interface ChiffreRepete {
  valeur: string;
  occurrences: number;    // hors section chiffres
  sections: string[];
}

export interface LintRapport {
  doublons: DoublonSequence[];
  chiffres_repetes: ChiffreRepete[];      // > 2 occurrences hors chiffres = bloquant
  hors_budget: string[];                  // avertissements de clampBudgets à blanc
  meta_narratif: { section: string; extrait: string }[];
  bloquants: number;
}

/** Textes d'un contenu, aplatis avec leur chemin. */
function textesDe(content: Content, prefix = ""): { chemin: string; texte: string }[] {
  const out: { chemin: string; texte: string }[] = [];
  const walk = (v: unknown, chemin: string) => {
    if (typeof v === "string") {
      if (v.trim()) out.push({ chemin, texte: v });
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${chemin}[${i}]`));
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v as Content)) walk(x, chemin ? `${chemin}.${k}` : k);
    }
  };
  walk(content, prefix);
  return out;
}

/** Un même lien vit LÉGITIMEMENT dans a_lire (curée) et sources (exhaustive) :
 *  seul le champ apport ne doit pas se dupliquer (règle 1). Le lint des
 *  séquences ignore donc titre, url et date de ces deux sections. */
const SECTIONS_LIENS = new Set(["a_lire", "sources"]);
const CHAMPS_LIENS_IGNORES = /(^|\.)(titre|url|date|temps_lecture|niveau)($|\[)/;

/** Un pointeur de zone grise (« ZG: gautier, ne pas dire 250 k€ ») cite le
 *  chiffre interdit PAR CONSTRUCTION : ses valeurs ne comptent pas comme
 *  répétition. */
const estPointeurZg = (texte: string) => /^\s*zg\s*:/i.test(texte) || /·\s*zg\s*:/i.test(texte);

const normalise = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9à-ÿ%€$]+/gi, " ").trim();

const SEQUENCE_MOTS = 12;

/** Détection du méta narratif (règle 3) : historique de modifications,
 *  mentions de qui a demandé quoi, commentaires sur la génération. */
const META_NARRATIF = /\b(recadrage du|bloc neuf|version pr[eé]c[eé]dente|demand[eé] par|ajout[eé] (le|par)|r[eé]g[eé]n[eé]r[eé] (le|par)|section (mise [aà] jour|r[eé][eé]crite))\b/i;

/** Chiffres remarquables : valeur avec unité (M€, M$, %, k€...), nombre
 *  décimal, ou entier d'au moins 3 chiffres. Les entiers nus de 1 ou 2
 *  chiffres sont ignorés (numéros de questions, jours de dates : mesuré sur
 *  la fiche Gobert, « 24 » comptait 22 occurrences de pur bruit), comme les
 *  années seules (1900-2099) : une date répétée n'est pas un KPI recopié. */
const CHIFFRE_RE = /\d{1,3}(?:[\u00a0\u202f ]\d{3})+(?:[.,]\d+)?\s?(?:%|€|\$|M€|M\$|Md€|Md\$|k€|k\$|M\b|Md\b)?|\d+(?:[.,]\d+)?\s?(?:%|€|\$|M€|M\$|Md€|Md\$|k€|k\$|M\b|Md\b)|\b\d+[.,]\d+\b|\b\d{3,}\b/g;

function chiffresRemarquables(texte: string): string[] {
  const out: string[] = [];
  for (const m of texte.matchAll(CHIFFRE_RE)) {
    const brut = m[0].replace(/[\u00a0\u202f]/g, " ").trim();
    const nu = brut.replace(/[^\d.,]/g, "");
    if (/^(19|20)\d{2}$/.test(nu) && nu === brut) continue; // année seule
    if (nu.replace(/[.,]/g, "").length < 2) continue;
    out.push(brut);
  }
  return out;
}

/** Sections exclues du comptage des chiffres : la propriétaire (chiffres),
 *  les listes de liens (titres et URLs portent légitimement les valeurs du
 *  corps) et la zone grise, propriétaire des chiffres non tranchés et des
 *  formulations interdites (« ne pas dire 250 k€ » n'est pas une répétition). */
const SECTIONS_SANS_COMPTAGE_CHIFFRES = new Set(["chiffres", "sources", "a_lire", "zone_grise"]);

/**
 * Lint d'une fiche assemblée : sections → contenu. Règle 5 :
 * 1. séquences de 12 mots présentes dans 2 sections ou plus ;
 * 2. chiffres remarquables à plus de 2 occurrences hors section chiffres ;
 * 3. budgets (règle 2) ; 4. méta narratif (règle 3).
 */
export function lintFiche(sections: Record<string, Content>): LintRapport {
  const parSequence = new Map<string, { extrait: string; sections: Set<string> }>();
  const parChiffre = new Map<string, { valeur: string; sections: string[] }>();
  const meta_narratif: LintRapport["meta_narratif"] = [];

  for (const [sectionId, content] of Object.entries(sections)) {
    const textes = textesDe(content ?? {});
    const motsSection: string[] = [];
    for (const { chemin, texte } of textes) {
      if (META_NARRATIF.test(texte)) {
        meta_narratif.push({ section: sectionId, extrait: texte.slice(0, 120) });
      }
      const lienIgnore = SECTIONS_LIENS.has(sectionId) && CHAMPS_LIENS_IGNORES.test(chemin);
      if (!lienIgnore) motsSection.push(...normalise(texte).split(" ").filter(Boolean));
      if (!SECTIONS_SANS_COMPTAGE_CHIFFRES.has(sectionId) && !estPointeurZg(texte)) {
        for (const valeur of chiffresRemarquables(texte)) {
          const cle = valeur.replace(/\s/g, "");
          const cur = parChiffre.get(cle) ?? { valeur, sections: [] };
          cur.sections.push(sectionId);
          parChiffre.set(cle, cur);
        }
      }
    }
    for (let i = 0; i + SEQUENCE_MOTS <= motsSection.length; i++) {
      const seq = motsSection.slice(i, i + SEQUENCE_MOTS).join(" ");
      const cur = parSequence.get(seq) ?? { extrait: seq, sections: new Set<string>() };
      cur.sections.add(sectionId);
      parSequence.set(seq, cur);
    }
  }

  // Doublons : séquences vues dans 2 sections ou plus. Les fenêtres
  // glissantes d'un même passage recopié se chaînent en un extrait maximal
  // (deux fenêtres consécutives partagent 11 mots), par ensemble de sections.
  const bruts = [...parSequence.values()].filter((s) => s.sections.size >= 2);
  const parGroupe = new Map<string, { sections: string[]; shingles: string[] }>();
  for (const d of bruts) {
    const cle = [...d.sections].sort().join("|");
    const g = parGroupe.get(cle) ?? { sections: [...d.sections].sort(), shingles: [] };
    g.shingles.push(d.extrait);
    parGroupe.set(cle, g);
  }
  const doublons: DoublonSequence[] = [];
  for (const g of parGroupe.values()) {
    const set = new Set(g.shingles);
    const suivantDe = new Map<string, string>();
    const aPredecesseur = new Set<string>();
    for (const s of set) {
      const suffixe = s.split(" ").slice(1).join(" ");
      for (const t of set) {
        if (t === s) continue;
        if (t.split(" ").slice(0, SEQUENCE_MOTS - 1).join(" ") === suffixe) {
          suivantDe.set(s, t);
          aPredecesseur.add(t);
          break;
        }
      }
    }
    const proprietaire = g.sections.find((s) => PROPRIETAIRES[s]) ?? null;
    for (const s of set) {
      if (aPredecesseur.has(s)) continue;
      let extrait = s;
      let cur = s;
      const vus = new Set([s]);
      while (suivantDe.has(cur)) {
        const nxt = suivantDe.get(cur)!;
        if (vus.has(nxt)) break;
        extrait += ` ${nxt.split(" ").slice(SEQUENCE_MOTS - 1).join(" ")}`;
        cur = nxt;
        vus.add(nxt);
      }
      doublons.push({ extrait, sections: g.sections, proprietaire });
    }
  }

  const chiffres_repetes: ChiffreRepete[] = [...parChiffre.values()]
    .filter((x) => x.sections.length > 2)
    .map((x) => ({ valeur: x.valeur, occurrences: x.sections.length, sections: [...new Set(x.sections)].sort() }))
    .sort((a, b) => b.occurrences - a.occurrences);

  // Budgets : clampBudgets à blanc (import circulaire évité : contrôle local
  // sur les mêmes seuils que schema.ts pour les champs texte majeurs).
  const hors_budget: string[] = [];
  const controleTexte = (sectionId: string, chemin: string, texte: string, max: number) => {
    if (texte.length > max) hors_budget.push(`${sectionId}.${chemin} : ${texte.length} caractères, budget ${max}`);
  };
  for (const [sectionId, content] of Object.entries(sections)) {
    for (const { chemin, texte } of textesDe(content ?? {})) {
      if (sectionId === "sequencage" && chemin.endsWith(".rappel")) controleTexte(sectionId, chemin, texte, BUDGETS_V3.sequencage_rappel_chars);
      if (sectionId === "sequencage" && chemin.endsWith(".intention")) controleTexte(sectionId, chemin, texte, BUDGETS_V3.sequencage_intention_chars);
      if (sectionId === "dix_questions" && chemin.endsWith(".note")) controleTexte(sectionId, chemin, texte, BUDGETS_V3.dix_questions_note_chars);
      if (sectionId === "zone_grise" && chemin.endsWith(".texte")) controleTexte(sectionId, chemin, texte, BUDGETS_V3.zone_grise_item_chars);
      if (sectionId === "enjeu" && chemin === "texte") controleTexte(sectionId, chemin, texte, BUDGETS_V3.enjeu_texte_chars);
      if (sectionId === "enjeu" && chemin === "lecon") controleTexte(sectionId, chemin, texte, BUDGETS_V3.enjeu_lecon_chars);
      if (sectionId === "recit_canonique" && chemin.startsWith("paragraphes[")) controleTexte(sectionId, chemin, texte, BUDGETS_V3.recit_paragraphe_chars);
    }
  }

  const bloquants = doublons.length + chiffres_repetes.length + meta_narratif.length;
  return { doublons, chiffres_repetes, hors_budget, meta_narratif, bloquants };
}
