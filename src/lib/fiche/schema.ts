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
export interface EnjeuContent { texte?: string }
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
export interface ZoneGriseContent { items?: { texte: string; origine?: string }[] }
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
  enjeu: { texte: "Pourquoi cet invité, pourquoi maintenant, ce que l'épisode doit produire. 5 lignes max." },
  recit_canonique: { paragraphes: ["L'histoire telle que le grand public informé la connaît, 5 à 8 paragraphes maîtrisés.", "Origines, bascules, ascension, statut actuel. Pas de données d'annuaire."] },
  mecanique_succes: {
    definition: "En quoi il est le meilleur de son univers, avec la métrique explicite (taux, palmarès, part de marché).",
    pairs: [{ nom: "Pair ou concurrent", position: "positionnement relatif de l'invité" }],
    divergences: [{ date: "2012", decision: "la décision structurante", effet: "ce qu'elle a produit" }],
    contrefactuel: "Ce qui serait arrivé sans ces décisions (raisonnement, pas un fait).",
  },
  univers: {
    intro: ["Le marché ou l'écosystème de l'invité : taille, économie, acteurs, tendances multi-années. Tout sourcé et daté."],
    barres: { titre: "CA sur 10 ans, Md€", note: "explication courte", source: "documents annuels", valeurs: [{ label: "24", affiche: "9,9", valeur: 9.9, plein: true }] },
    comparaison: { titre: "Croissance comparée", source: "rapports annuels", valeurs: [{ nom: "iliad", affiche: "+125 %", pct: 125, hero: true }] },
    rentabilite: { titre: "Rentabilité", note: "la question à en tirer", source: "résultats annuels", valeurs: [{ label: "2024", affiche: "37 %", pct: 37 }] },
    timeline: { titre: "Les bascules", jalons: [{ annee: "12", titre: "Free Mobile", texte: "Le forfait à 2 euros.", cle: true }] },
  },
  personnel: {
    bandeau: DEFAULT_PERSONNEL_BANDEAU,
    items: [{ texte: "Élément personnel PUBLIC (famille, épreuve, passion).", source: "source publique datée, OBLIGATOIRE" }],
  },
  a_lire: { liens: [{ niveau: "indispensable", titre: "Titre de la source", date: "mars 2025", temps_lecture: "12 min", apport: "ce que la source apporte en une phrase", url: "https://... (vérifiée, jamais reconstruite)" }] },
  trente_secondes: { items: [{ label: "Qui", texte: "..." }, { label: "Fait d'armes", texte: "..." }, { label: "Pourquoi maintenant", texte: "..." }, { label: "État d'esprit", texte: "..." }] },
  chiffres: { kpis: [{ valeur: "9,9 Md€", libelle: "CA groupe 2024", source: "iliad, mars 2025" }] },
  parcours: { lignes: [{ annee: "1999", texte: "Lance Free, accès internet sans abonnement" }] },
  playbook: { intro: "Cinq systèmes identifiés dans les sources.", items: [{ titre: "Le pricing comme arme", connu: "ce qu'on sait", manque: "ce qui manque", question: "la question qui l'extrait" }] },
  entourage: { personnes: [{ nom: "Cyril Poidatz", role: "cofondateur iliad", texte: "pourquoi il compte" }] },
  anecdotes: { items: [{ texte: "Anecdote sourcée sur l'invité.", source: "livre 2023, ch. 4", cachee: false }, { texte: "Anecdote bien cachée, jamais racontée en interview.", source: "podcast confidentiel 2019", cachee: true }] },
  tensions: { cartes: [{ a: "Discours : ...", b: "Fait : ...", angle: "comment l'aborder sans agressivité" }] },
  questions_recurrentes: { items: [{ question: "Le forfait à 2 euros, comment vous avez fait", reponse: "réponse rodée en une ligne" }] },
  questions_reseaux: { questions: [{ question: "Combien tu gagnes vraiment aujourd'hui ?", ressort: "argent", clip: "le chiffre lâché fait l'extrait" }] },
  sequencage: { blocs: [{ debut_min: 0, fin_min: 20, court: "Origines", titre: "Créteil, Minitel, la débrouille", intention: "Récit. Le mettre à l'aise.", mode: "RÉCIT · ÉMOTION", rappel_label: "ZONE GRISE", rappel: "texte du rappel contextuel" }] },
  dix_questions: { questions: [{ num: "01", bloc: 0, texte: "Question courte, tutoiement, sans point final", note: "RELANCE : ... · TERRAIN GLISSANT : ..." }] },
  zone_grise: { items: [{ texte: "Information non vérifiée, à faire dire par l'invité.", origine: "note Matthieu" }] },
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
