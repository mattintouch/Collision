// Contrat de contenu des sections de fiche (rendu /fiches/{slug} ET génération).
// Chaque section stocke un objet JSON dont la forme est définie ici. Le rendu est
// TOLÉRANT : champ manquant = ignoré, section vide ou non applicable = absente de
// la page (règle du brief : jamais de section vide). Les coercitions ci-dessous
// transforment un JSON arbitraire en donnée sûre pour le rendu.

export interface LienDate {
  date?: string;      // libellé daté ("MARS 2025")
  titre: string;
  apport?: string;    // ce que la source apporte
  url?: string;
}

export interface EnteteContent {
  numero?: string;            // numéro d'épisode ("612")
  titre_lignes?: string[];    // nom en lignes ("Xavier", "Niel") ; défaut : invite_nom
  societe?: string;           // affichée dans le bandeau collant
  sous_titre?: string;        // qui il est, pourquoi maintenant
  pilules?: string[];         // pastilles logistiques ("MAR 22 SEPT · 9H30", ...)
  liens?: { label: string; url: string }[]; // LinkedIn, Wikipedia
}

export interface ChecklistContent { items?: string[] }
/** A1 TL;DR (refonte du 30/07) : l'essentiel en 5 puces max, écrit par la
 *  passe de rédaction (synthèse de la fiche entière, jamais une recherche). */
export interface TldrContent { items?: string[] }
/** A1 Enjeu : promesse de dynamique + risque, ET la leçon transférable
 *  explicitement nommée (doctrine de profondeur, couche C). */
export interface EnjeuContent { texte?: string; lecon?: string }
export interface SourcesContent { liens?: LienDate[] }
export interface TrenteSecondesContent { items?: { label: string; texte: string }[] }

/** A2 Récit canonique : l'histoire maîtrisée, 5 à 8 paragraphes de prose. */
export interface RecitContent { paragraphes?: string[] }

/** A3 Mécanique du succès (OBLIGATOIRE, cœur de la fiche). */
export interface MecaniqueContent {
  definition?: string;    // le « meilleur » dans son univers, métrique explicite
  pairs?: { nom: string; position?: string }[]; // concurrents nommés + positionnement relatif
  divergences?: { date: string; decision: string; effet?: string }[]; // 3-5 points datés
  contrefactuel?: string; // signalé comme raisonnement, pas comme fait
}

/** A5 Personnel : éléments publics uniquement, source obligatoire par item. */
export interface PersonnelContent {
  bandeau?: string; // avertissement d'usage (défaut DEFAULT_PERSONNEL_BANDEAU)
  items?: { texte: string; source: string }[];
}

/** A6 À lire : 5 à 8 sources hiérarchisées, URLs vérifiées à la génération. */
export type NiveauLecture = "indispensable" | "utile" | "optionnel";
export interface ALireContent {
  liens?: { niveau?: NiveauLecture; titre: string; date?: string; temps_lecture?: string; apport?: string; url?: string }[];
}

/** Anecdotes sourcées ; cachee=true = bonus bien caché, mis en avant au rendu. */
export interface AnecdotesContent {
  items?: { texte: string; source?: string; cachee?: boolean }[];
}

export const DEFAULT_PERSONNEL_BANDEAU =
  "Matière pour le rapport et les relances, diffusion à l'antenne à valider au cas par cas.";

export interface KpiCard { valeur: string; libelle: string; source?: string }
export interface ChiffresContent { kpis?: KpiCard[] }

/** Visualisations adaptatives (entrepreneur : CA/concurrents ; artiste : albums ;
 *  sportif : palmarès). Mêmes composants, autres données. Toutes optionnelles. */
export interface EntrepriseContent {
  barres?: {                 // barres verticales (CA 10 ans, ventes d'albums, ...)
    titre: string;
    note?: string;
    source?: string;
    valeurs: { label: string; affiche: string; valeur: number; plein?: boolean }[];
  };
  comparaison?: {            // barres horizontales (croissance comparée)
    titre?: string;
    source?: string;
    valeurs: { nom: string; affiche: string; pct: number; hero?: boolean }[];
  };
  rentabilite?: {            // barres horizontales pleines (marge, taux)
    titre?: string;
    note?: string;
    source?: string;
    valeurs: { label: string; affiche: string; pct: number }[];
  };
  timeline?: {               // bascules datées
    titre: string;
    jalons: { annee: string; titre: string; texte?: string; cle?: boolean }[];
  };
}

export interface ParcoursContent { lignes?: { annee: string; texte: string }[] }
export interface PlaybookContent {
  intro?: string;
  items?: { titre: string; connu?: string; manque?: string; question?: string }[];
}
export interface EntourageContent { personnes?: { nom: string; role?: string; texte?: string }[] }
export interface TensionsContent { cartes?: { a: string; b: string; angle?: string }[] }
/** B13 Polémiques (refonte du 30/07) : le fait public sourcé et la question
 *  qui fâche, frontale mais adossée au fait. */
export interface PolemiquesContent {
  items?: { texte: string; source?: string; question?: string }[];
}
export interface RecurrentesContent {
  intro?: string;
  items?: { question: string; reponse?: string }[];
}
/** Questions clips (recadrage produit) : proposées par Vadim, challengées par
 *  l'équipe, à dégainer en tournage. `meta` libre prime si fournie. */
export interface ReseauxContent {
  questions?: { question: string; ressort?: string; clip?: string; meta?: string }[];
}
export interface SequencageContent {
  blocs?: {
    debut_min: number;
    fin_min: number;
    court: string;            // libellé du chip de nav
    titre: string;
    intention?: string;
    mode?: string;            // "RÉCIT · ÉMOTION", "EXTRACTION · LE COMMENT", ...
    rappel_label?: string;    // "ZONE GRISE" / "CHIFFRE" / "TENSION 2" / ...
    rappel?: string;
  }[];
}
export interface DixQuestionsContent {
  questions?: { num?: string; bloc?: number; texte: string; note?: string }[];
}
/** Zone grise (correctif du 27/07, règle 6) : chaque item porte un identifiant
 *  court et stable (zg_gautier). Les rappels du séquençage et les notes des
 *  dix questions POINTENT l'identifiant (« ZG: gautier, consigne courte »),
 *  ils ne recopient jamais le texte complet. */
export interface ZoneGriseContent { items?: { id?: string; texte: string; origine?: string }[] }
export interface FooterContent { texte?: string }

/** Items par défaut de la checklist pré-rec (brief §4.3 + ajouts Matt).
 *  La checklist ENTIÈRE doit être cochée pour lancer le REC. */
export const DEFAULT_CHECKLIST = [
  "Mode avion, les deux téléphones",
  "Café + eau sur la table",
  "Éteindre la machine à café",
  "Climatisation OK",
  "Son OK + cams OK",
  "Brief invité : euh, couper la parole, questions directes",
  "Photos : invité seul de face + avec Matthieu",
];

export const DEFAULT_FOOTER =
  "POST-REC : PHOTOS (INVITÉ SEUL DE FACE + AVEC MATTHIEU) · MÉMO VOCAL : RESSENTI, CE QUI A MARQUÉ, ACCROCHES LINKEDIN, TITRE, POTENTIEL DE L'ÉPISODE";

/**
 * Contrat d'édition par section : l'exemple JSON que `update_section` attend.
 * Renvoyé par get_section (champ `contrat`) pour que le challenge via MCP
 * (Matthieu, Clémence, Claude) écrive la bonne forme sans documentation externe.
 */
/** Budgets durs : contrat v3 (règle 2) + correctif anti-répétition du 27/07
 *  (règle 2, chiffrés par champ). Appliqués au parsing de la génération,
 *  rappelés dans les prompts, imposés par la passe de rédaction ET par le
 *  serveur au stockage (clampBudgets dans writeSection : troncature avec
 *  avertissement). Une ligne ≈ 80 caractères. */
export const BUDGETS_V3 = {
  // Le correctif anti-répétition remplace « 1 ouverture + 7 temps » :
  // le récit tient en 5 paragraphes maximum de 300 caractères chacun.
  recit_paragraphes: 5,
  recit_paragraphe_chars: 300,
  parcours_lignes: 12,
  playbook_items: 6,
  univers_points: 4,    // points de marché hors graphiques
  a_lire_sources: 3,
  bloc_b_item_chars: 240, // 3 lignes × ~80 caractères : au delà, échec de génération
  enjeu_texte_chars: 1200,
  enjeu_lecon_chars: 600,
  sequencage_rappel_chars: 140,   // un POINTEUR, pas un paragraphe
  sequencage_intention_chars: 450,
  dix_questions_note_chars: 200,
  zone_grise_items: 12,
  zone_grise_item_chars: 400,
  chiffres_kpis: 16,
  tensions_cartes: 3,
  zg_pointeur_chars: 90, // pointeur « ZG: <mot-clé> » hors zone grise
  // Refonte du 30/07 : TL;DR en tête, polémiques vers le bas.
  tldr_items: 5,
  tldr_item_chars: 200,
  polemiques_items: 4,
  polemiques_item_chars: 300,
} as const;

/** Identifiant court et stable d'un item de zone grise (règle 6) : dérivé du
 *  premier mot significatif du texte, unique dans la fiche. Sert quand la
 *  génération n'en a pas fourni. */
export function idZoneGrise(texte: string, existants: Set<string>): string {
  const VIDES = new Set(["le", "la", "les", "un", "une", "des", "de", "du", "au", "aux", "ne", "pas", "et", "ou", "en", "sur", "par", "pour", "avec", "sans", "que", "qui", "son", "sa", "ses", "il", "elle", "a"]);
  const mots = texte
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .filter((m) => m.length >= 3 && !VIDES.has(m));
  const base = `zg_${(mots[0] ?? "item").slice(0, 16)}`;
  if (!existants.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!existants.has(`${base}_${i}`)) return `${base}_${i}`;
  return `${base}_${existants.size}`;
}

/** Troncature propre au mot le plus proche, avec ellipse. */
function tronque(s: string, max: number): string {
  if (s.length <= max) return s;
  const coupe = s.slice(0, max - 1);
  const auMot = coupe.replace(/\s+\S*$/, "");
  return `${auMot || coupe}…`;
}

/** Validation serveur des budgets (correctif anti-répétition, règle 2) :
 *  troncature avec avertissement, jamais de rejet silencieux. Appelée par
 *  writeSection sur tout contenu entrant. Pure : ne mute pas l'entrée. */
export function clampBudgets(
  sectionId: string,
  content: Record<string, unknown>
): { content: Record<string, unknown>; avertissements: string[] } {
  const avertissements: string[] = [];
  const c: Record<string, unknown> = JSON.parse(JSON.stringify(content ?? {}));
  const champTexte = (obj: Record<string, unknown>, champ: string, max: number, ou: string) => {
    const v = obj[champ];
    if (typeof v === "string" && v.length > max) {
      obj[champ] = tronque(v, max);
      avertissements.push(`${ou} : ${v.length} caractères, budget ${max}, tronqué`);
    }
  };
  const listeMax = (champ: string, max: number) => {
    const v = c[champ];
    if (Array.isArray(v) && v.length > max) {
      c[champ] = v.slice(0, max);
      avertissements.push(`${sectionId}.${champ} : ${v.length} éléments, budget ${max}, tronqué`);
    }
  };
  const chaqueItem = (champ: string, sous: string, max: number) => {
    const v = c[champ];
    if (!Array.isArray(v)) return;
    v.forEach((item, i) => {
      if (item && typeof item === "object") champTexte(item as Record<string, unknown>, sous, max, `${sectionId}.${champ}[${i}].${sous}`);
    });
  };
  switch (sectionId) {
    case "enjeu":
      champTexte(c, "texte", BUDGETS_V3.enjeu_texte_chars, "enjeu.texte");
      champTexte(c, "lecon", BUDGETS_V3.enjeu_lecon_chars, "enjeu.lecon");
      break;
    case "recit_canonique":
      listeMax("paragraphes", BUDGETS_V3.recit_paragraphes);
      {
        const v = c.paragraphes;
        if (Array.isArray(v)) {
          c.paragraphes = v.map((p, i) => {
            if (typeof p === "string" && p.length > BUDGETS_V3.recit_paragraphe_chars) {
              avertissements.push(`recit_canonique.paragraphes[${i}] : ${p.length} caractères, budget ${BUDGETS_V3.recit_paragraphe_chars}, tronqué`);
              return tronque(p, BUDGETS_V3.recit_paragraphe_chars);
            }
            return p;
          });
        }
      }
      break;
    case "sequencage":
      chaqueItem("blocs", "rappel", BUDGETS_V3.sequencage_rappel_chars);
      chaqueItem("blocs", "intention", BUDGETS_V3.sequencage_intention_chars);
      break;
    case "dix_questions":
      chaqueItem("questions", "note", BUDGETS_V3.dix_questions_note_chars);
      break;
    case "zone_grise":
      listeMax("items", BUDGETS_V3.zone_grise_items);
      chaqueItem("items", "texte", BUDGETS_V3.zone_grise_item_chars);
      break;
    case "chiffres":
      listeMax("kpis", BUDGETS_V3.chiffres_kpis);
      break;
    case "tensions":
      listeMax("cartes", BUDGETS_V3.tensions_cartes);
      break;
    case "playbook":
      listeMax("items", BUDGETS_V3.playbook_items);
      break;
    case "parcours":
      listeMax("lignes", BUDGETS_V3.parcours_lignes);
      break;
    case "a_lire":
      listeMax("liens", BUDGETS_V3.a_lire_sources);
      break;
    case "tldr":
      listeMax("items", BUDGETS_V3.tldr_items);
      {
        const v = c.items;
        if (Array.isArray(v)) {
          c.items = v.map((p, i) => {
            if (typeof p === "string" && p.length > BUDGETS_V3.tldr_item_chars) {
              avertissements.push(`tldr.items[${i}] : ${p.length} caractères, budget ${BUDGETS_V3.tldr_item_chars}, tronqué`);
              return tronque(p, BUDGETS_V3.tldr_item_chars);
            }
            return p;
          });
        }
      }
      break;
    case "polemiques":
      listeMax("items", BUDGETS_V3.polemiques_items);
      chaqueItem("items", "texte", BUDGETS_V3.polemiques_item_chars);
      chaqueItem("items", "question", BUDGETS_V3.polemiques_item_chars);
      break;
  }
  return { content: c, avertissements };
}

export const SECTION_CONTRACTS: Record<string, unknown> = {
  sticky_header: { societe: "iliad" },
  entete: {
    numero: "612",
    titre_lignes: ["Xavier", "Niel"],
    societe: "iliad",
    sous_titre: "Qui il est, pourquoi maintenant, en une phrase.",
    pilules: ["MAR 22 SEPT · 9H30", "STUDIO 71 · RDC SUR RUE", "2H30"],
    liens: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/..." }],
  },
  checklist_prerec: { items: DEFAULT_CHECKLIST },
  tldr: { items: ["5 puces MAXIMUM de 200 caractères : l'essentiel si la fiche n'est lue que 3 minutes (qui, fait d'armes, mécanique centrale, angle de l'épisode, piège à éviter). Écrit par la passe de rédaction, synthèse de la fiche entière."] },
  enjeu: {
    texte: "La promesse de DYNAMIQUE (pas le sujet de domaine), le risque principal (jargon, pitch défensif). 5 lignes max.",
    lecon: "La leçon transférable à un auditeur étranger au domaine, explicite, une à deux phrases.",
  },
  recit_canonique: {
    paragraphes: [
      "5 paragraphes MAXIMUM de 300 caractères chacun (correctif du 27/07).",
      "Le récit raconte : la chronologie datée appartient à parcours, les stats à chiffres.",
    ],
  },
  mecanique_succes: {
    definition: "En quoi il est le meilleur de son univers, avec la métrique explicite (taux, palmarès, part de marché).",
    pairs: [{ nom: "Pair ou concurrent", position: "positionnement relatif de l'invité" }],
    divergences: [{ date: "2012", decision: "DÉCISION structurante, formulée comme décision, jamais comme récit biographique (contrat v3)", effet: "ce qu'elle a produit" }],
    contrefactuel: "Ce qui serait arrivé sans ces décisions (raisonnement, pas un fait).",
  },
  univers: {
    intro: ["Marché, fédérations, économie UNIQUEMENT : 4 points maximum, hors graphiques (contrat v3). La chronologie biographique appartient à parcours, elle n'a pas sa place ici."],
    distinctions: ["Distinction sectorielle à tenir au micro, ex. la biopharma n'est pas la MedTech : molécules vs dispositifs, dix ans vs cycle court."],
    barres: { titre: "CA sur 10 ans, Md€", note: "explication courte", source: "documents annuels", valeurs: [{ label: "24", affiche: "9,9", valeur: 9.9, plein: true }] },
    comparaison: { titre: "Croissance comparée", source: "rapports annuels", valeurs: [{ nom: "iliad", affiche: "+125 %", pct: 125, hero: true }] },
    rentabilite: { titre: "Rentabilité", note: "la question à en tirer", source: "résultats annuels", valeurs: [{ label: "2024", affiche: "37 %", pct: 37 }] },
  },
  personnel: {
    bandeau: DEFAULT_PERSONNEL_BANDEAU,
    items: [{ texte: "Élément personnel PUBLIC (famille, épreuve, passion).", source: "source publique datée, OBLIGATOIRE" }],
  },
  a_lire: { liens: [{ niveau: "indispensable", titre: "3 sources MAXIMUM (contrat v3), les meilleures seulement", date: "mars 2025", temps_lecture: "12 min", apport: "ce que la source apporte en une phrase", url: "https://... (vérifiée, jamais reconstruite)" }] },
  trente_secondes: { items: [{ label: "Qui", texte: "..." }, { label: "Fait d'armes", texte: "..." }, { label: "Pourquoi maintenant", texte: "..." }, { label: "État d'esprit", texte: "..." }] },
  chiffres: { kpis: [{ valeur: "9,9 Md€", libelle: "CA groupe 2024", source: "iliad, mars 2025" }] },
  parcours: { lignes: [{ annee: "1999", texte: "PROPRIÉTAIRE de la chronologie datée (contrat v3) : 12 lignes maximum, aucune autre section ne re-frise la biographie" }] },
  playbook: { intro: "Six leviers maximum (contrat v3).", items: [{ titre: "Le pricing comme arme", connu: "ce qu'on sait, 2 lignes max", manque: "ce qui manque, 2 lignes max", question: "la question qui l'extrait, 2 lignes max" }] },
  entourage: { personnes: [{ nom: "Cyril Poidatz", role: "cofondateur iliad", texte: "pourquoi il compte" }] },
  anecdotes: { items: [{ texte: "Anecdote sourcée sur l'invité.", source: "livre 2023, ch. 4", cachee: false }, { texte: "Anecdote bien cachée, jamais racontée en interview.", source: "podcast confidentiel 2019", cachee: true }] },
  tensions: { cartes: [{ a: "Discours : ...", b: "Fait : ...", angle: "comment l'aborder sans agressivité" }] },
  polemiques: { items: [{ texte: "La controverse PUBLIQUE documentée, factuelle et datée (4 items max, 300 caractères).", source: "source publique datée, obligatoire", question: "la question qui fâche, frontale mais adossée au fait, tutoiement, sans point final" }] },
  questions_recurrentes: { items: [{ question: "Le forfait à 2 euros, comment vous avez fait", reponse: "réponse rodée en une ligne" }] },
  questions_reseaux: { questions: [{ question: "Combien tu gagnes vraiment aujourd'hui ?", ressort: "argent", clip: "le chiffre lâché fait l'extrait" }] },
  // sequencage RETIRÉ (refonte du 27/07) : la conversation n'est plus scriptée.
  // Le contrat reste lisible pour les données historiques, l'écriture est déconseillée.
  sequencage: { blocs: [{ debut_min: 0, fin_min: 20, court: "RETIRÉ", titre: "Section retirée le 27/07, plus générée ni affichée", intention: "", mode: "", rappel_label: "", rappel: "" }] },
  dix_questions: { questions: [{ num: "01", bloc: 0, texte: "Question courte, tutoiement, sans point final", note: "RELANCE : ... · TERRAIN GLISSANT : ..." }] },
  zone_grise: { items: [{ id: "zg_motcle (identifiant court et stable ; les rappels et notes pointent « ZG: motcle, consigne »)", texte: "Information non vérifiée, à faire dire par l'invité. Les chiffres contradictoires non tranchés par la rédaction atterrissent ici : ne pas citer une valeur unique à l'antenne.", origine: "note Matthieu / rédaction (chiffre non tranché)" }] },
  sources: { liens: [{ date: "2023", titre: "Titre", apport: "ce que la source apporte", url: "https://..." }] },
  footer: { texte: DEFAULT_FOOTER },
};

/* ───────────────────────── coercitions défensives ───────────────────────── */

export function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}
export function asNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
export function asArray<T>(v: unknown, map: (x: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map(map)
    .filter((x): x is T => x !== null);
}
export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}
/** N'autorise que les URL http(s) (anti javascript:). */
export function safeUrl(v: unknown): string | undefined {
  const s = asString(v);
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : undefined;
}
/** true si un objet de contenu est effectivement vide (section à ne pas rendre). */
export function isEmptyContent(content: unknown): boolean {
  if (!content || typeof content !== "object") return true;
  const values = Object.values(content as Record<string, unknown>);
  return values.every((v) =>
    v == null ||
    (typeof v === "string" && !v.trim()) ||
    (Array.isArray(v) && v.length === 0) ||
    (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0)
  );
}
