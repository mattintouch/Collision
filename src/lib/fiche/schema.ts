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

/** 01 Identité (v3.1, remplace entete) : Wikipedia systématique quand la page
 *  existe (premier lien), date de naissance (l'âge se calcule au rendu à la
 *  date d'enregistrement), accompagnants et mise en relation saisis à la main. */
export interface IdentiteContent {
  numero?: string;            // numéro d'épisode ("612")
  titre_lignes?: string[];    // nom en lignes ("Xavier", "Niel") ; défaut : invite_nom
  societe?: string;           // affichée dans le bandeau collant
  sous_titre?: string;        // une phrase de fait d'armes vérifiable + une phrase de thèse en « le comment de »
  pilules?: string[];         // pastilles logistiques ("MAR 22 SEPT · 9H30", ...)
  liens?: { label: string; url: string }[]; // Wikipedia d'abord (systématique), sinon LinkedIn
  date_naissance?: string;    // ISO AAAA-MM-JJ, sourcée
  accompagnants?: { nom: string; fonction?: string }[]; // "à confirmer" si inconnu
  mise_en_relation?: { qui?: string; canal?: string };  // qui a connecté, par quel canal
  /** Langue de la fiche (04/09, cas Andy Yen) : "en" bascule TOUT l'habillage
   *  du template en anglais (titres de blocs, labels, checklists, pool de
   *  questions) pour qu'un contenu anglais ne baigne pas dans un chrome
   *  français. Défaut "fr". */
  langue?: "fr" | "en";
}

export interface ChecklistContent { items?: string[] }

/** 03 TL;DR (v3.1) : brief d'attaque en 60 secondes, 1200 caractères au
 *  total, neuf labels dans l'ordre de TLDR_LABELS. */
export const TLDR_LABELS = [
  "Qui", "Fait d'armes", "Fil rouge", "Le comment", "Polémique",
  "Pourquoi maintenant", "Piège", "Levier", "État d'esprit",
] as const;
export interface TldrContent { items?: { label: string; texte: string }[] }
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

/** 08 Personnel (v3.1) : trois sous-blocs. La zone grise y vit désormais :
 *  source unique de vérité des statuts de vérification, identifiants stables
 *  (ZG: xxx), les autres sections pointent et ne recopient jamais. */
export interface PersonnelContent {
  bandeau?: string; // avertissement d'usage (défaut DEFAULT_PERSONNEL_BANDEAU)
  entourage?: { nom: string; role?: string; eclaire?: string; preconfirmer?: string }[];
  donnees_cachees?: { texte: string; source?: string; zg?: string }[];
  /** v4 : `sujet` = libellé court en tête de ligne dans le rendu Zones
   *  grises ; repli sur l'identifiant nettoyé quand il manque. */
  zone_grise?: { id?: string; texte: string; origine?: string; sujet?: string }[];
  /** Forme du contrat v2 (éléments personnels publics) : lue par la migration,
   *  plus jamais écrite par la génération v3.1. */
  items?: { texte: string; source: string }[];
}

/** A6 À lire : 5 à 8 sources hiérarchisées, URLs vérifiées à la génération. */
export type NiveauLecture = "indispensable" | "utile" | "optionnel";
export interface ALireContent {
  /** v4 : embargo=true affiche le badge rouge EMBARGO à côté du titre. */
  liens?: { niveau?: NiveauLecture; titre: string; date?: string; temps_lecture?: string; apport?: string; url?: string; embargo?: boolean }[];
}

/** Anecdotes sourcées ; cachee=true = bonus bien caché, mis en avant au rendu. */
export interface AnecdotesContent {
  items?: { texte: string; source?: string; cachee?: boolean }[];
}

export const DEFAULT_PERSONNEL_BANDEAU =
  "Matière pour le rapport et les relances, diffusion à l'antenne à valider au cas par cas.";

export interface KpiCard { valeur: string; libelle: string; source?: string; zg?: string }
export interface ChiffresContent { kpis?: KpiCard[] }

/** Graph marché v4 : barres CSS pures, valeurs datées et sourcées. Règle
 *  stricte de génération : une série non sourçable = graph OMIS, jamais
 *  estimé. `barres_jumelees` = deux valeurs par label (champ valeur2). */
export interface MarcheGraph {
  id?: string;
  titre: string;
  sous_titre?: string;
  type?: "barres" | "barres_jumelees";
  valeurs: {
    label: string;              // abscisse (année, catégorie)
    valeur: number;             // hauteur relative
    affiche: string;            // valeur affichée ("42,3")
    valeur2?: number;           // barres jumelées : seconde série
    affiche2?: string;
    accent?: string;            // "noir" | "rouge" | "jaune" (défaut gris)
    legende?: string;           // sous-libellé optionnel (cap)
  }[];
  legende?: { serie1?: string; serie2?: string }; // barres jumelées
  callout?: string;             // ce qu'il faut retenir (bordure rouge)
  source?: string;              // ligne source en mono, OBLIGATOIRE à la génération
}

/** 04 Data (v3.1, absorbe chiffres, univers et les pairs de la mécanique ;
 *  v4 : + graphs marché et lexique) : cartes KPI sourcées (chiffre non
 *  confirmé = pointeur zg, jamais orphelin), 1 à 2 graphiques maximum,
 *  sous-bloc Marché et comparables. */
export interface DataContent {
  kpis?: KpiCard[];
  barres?: EntrepriseContent["barres"];
  comparaison?: EntrepriseContent["comparaison"];
  rentabilite?: EntrepriseContent["rentabilite"];
  marche?: {
    texte?: string; // l'essentiel de l'ancien univers en UN paragraphe
    comparables?: { nom: string; position?: string }[]; // une ligne chacun
  };
  /** v4 : trois cartes graphiques du bloc Marché, adaptées au secteur de
   *  l'invité. Absent (fiches v3.1) : le bloc retombe sur texte + comparables. */
  marche_graphs?: MarcheGraph[];
  /** v4 : 8 à 12 termes du jargon du secteur, définis en une phrase pour
   *  quelqu'un qui ne vient pas du secteur. */
  lexique?: { terme: string; definition: string }[];
}

/** 05 Apprentissages (v3.1, absorbe playbook, divergences et leçon) : 5 à 8
 *  systèmes connu / manque / question. */
export interface ApprentissagesContent {
  intro?: string;
  items?: { titre: string; connu?: string; manque?: string; question?: string }[];
}

/** 06 Clickbait (v4, repurpose de la section clips : REMPLACEMENT, règle de
 *  la brique unique) : exactement 10 questions en deux registres, 5 « qui
 *  piquent » (jusqu'à la gêne assumée) et 5 « qui font apprendre » (la grille
 *  de lecture du meilleur de sa catégorie). Tutoiement, pas de guillemets.
 *  Rétrocompatibilité de LECTURE : les fiches v3.1 au format {questions}
 *  s'affichent dans l'ancien style tant qu'elles ne sont pas régénérées. */
export interface ClipsContent {
  piquantes?: string[];
  apprentissages?: string[];
  /** Forme v3.1 (lecture seule, jamais écrite par la génération v4). */
  questions?: { question: string; ressort?: string; clip?: string; meta?: string; zg?: string; fache?: boolean }[];
}

/** 07 Topics (v3.1, absorbe séquençage, dix questions, récurrentes, tensions).
 *  Les questions cœur sont numérotées en continu sur toute la fiche ; pas de
 *  plafond dur sur leur nombre (décision du 31/07 : peu si peu, beaucoup si
 *  beaucoup d'exceptionnelles). */
export interface TopicsContent {
  terrain_connu?: { question: string; reponse?: string; depassement?: string }[];
  topics?: {
    titre: string;
    /** v4 : minutage TOLÉRÉ en lecture, plus jamais affiché ni exigé à la
     *  génération (décision maquette du 31/08). */
    debut_min?: number;
    fin_min?: number;
    intention?: string; // une ligne, 200 caractères max
    /** v4, colonne de fond de la brique : le contexte en un paragraphe. */
    contexte?: string;
    /** v4 : dates clés du sujet, une ligne chacune. */
    dates?: string[];
    /** v4 : citations exactes de l'invité, sourcées par la recherche. */
    citations?: string[];
    /** v4 : chiffre héroïque de la brique (facultatif). */
    hero?: { valeur: string; libelle: string };
    /** v4 : éléments listés (tour de table, modèles cités...). */
    extras?: { titre?: string; items: string[] };
    /** v4, colonne exploitation : les réflexions tactiques de l'équipe. */
    reflexions?: string[];
    /** v4 : brique rendue en pleine largeur (les sujets cœur d'épisode). */
    pleine_largeur?: boolean;
    /** v4 : note tactique TOLÉRÉE en lecture, plus affichée ni exigée. */
    questions?: { num?: string; texte: string; note?: string; zg?: string; clip?: boolean }[];
  }[];
}

/** 09 Revue de presse (v3.1, absorbe a_lire, sources affichées, palmarès,
 *  réseaux). Les sources complètes restent en base (section sources). */
export interface RevueDePresseContent {
  reseaux?: { label: string; url: string }[];
  palmares?: { date?: string; texte: string }[];
  a_lire?: ALireContent["liens"];
}

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

/** Items de la checklist pré-rec (v4, maquette du 31/08) : SEPT gestes fixes,
 *  identiques sur toutes les fiches. Le REC reste cliquable que la checklist
 *  soit cochée ou non (décision maquette : plus de verrou). */
export const DEFAULT_CHECKLIST = [
  "Mode avion sur les deux téléphones",
  "Notifications coupées, Slack fermé",
  "Café et eau sur la table",
  "La casquette",
  "Plafonnier éteint",
  "Check son : deux micros, deux casques",
  "Prévenir l'invité : on enregistre tout, on coupe au montage",
];

/** Checklist post-rec (v4) : la bande rouge « Avant de quitter le studio »,
 *  repliée par défaut. Remplace le footer texte (règle de la brique). */
export const DEFAULT_CHECKLIST_POST = [
  "Photos : invité seul, puis avec Matthieu",
  "Arrêter et vérifier les fichiers audio et vidéo",
  "Envoyer les rushs sur le drive de l'épisode",
  "Mémo vocal à l'équipe : ce qui a marché, ce qu'on coupe",
  "Noter les clips retenus dans le carnet",
  "Remercier l'invité et caler la date de relecture du montage",
];

/** Pool fixe des questions générales de l'émission (v4, fold discret en fin
 *  de fiche) : identiques sur toutes les fiches, jamais générées. */
export const POOL_QUESTIONS_GENERALES = [
  "Travailler plus le COMMENT : comment ? comment ? comment ?",
  "De quoi on va parler · Pourquoi je l'ai invité · Comment je l'ai rencontré · What's in it for me ? · J'attends quoi de cet épisode ?",
  "Pour commencer, je te propose de te présenter.",
  "C'est quoi ton obsession en ce moment ? (relancer en répétant avec un point d'interrogation)",
  "Comment tu progresses ? · Où peut-on te suivre, te contacter ?",
  "Murmurer à l'oreille de toi-même · Pire nuit blanche · Échec préféré · Livre le plus offert",
  "Comment tu t'organises au quotidien ?",
  "Quelle est ta mécanique ? En as-tu une ? Tu as une conviction profonde ?",
  "Ta north star à toi",
  "Quelle question te poserais-tu si tu devais t'interviewer ? Quelle question faut-il que je te pose ? Quelle question tu n'aimerais pas que je te pose ?",
  "Un aspect de ta vie pro où tu voudrais faire mieux · Ta grosse galère du moment",
  "Qu'est-ce qui fait que cet épisode sera un épisode réussi ?",
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
  // Contrat v3.1 (31/07). AUCUN plafond sur le NOMBRE de questions (décision
  // Matthieu) : seuls les champs texte et les comptes structurels se bornent.
  tldr_total_chars: 1200,        // le brief d'attaque entier
  tldr_item_chars: 240,          // une idée par ligne
  topic_intention_chars: 200,
  topic_note_chars: 200,         // sous-note tactique d'une question cœur
  topics_max: 8,                 // 5 à 8 topics (lint : avertissement au delà)
  apprentissages_items: 8,       // 5 à 8 systèmes
  a_lire_min: 3,
  a_lire_max: 5,
  a_lire_apport_chars: 120,
  data_graphiques_max: 2,
  marche_texte_chars: 900,       // UN paragraphe
  // Héritage 30/07 (sections retirées, rollbacks) :
  tldr_items: 9,
  polemiques_items: 4,
  polemiques_item_chars: 300,
  // Contrat v4 (maquette du 31/08) :
  lexique_min: 8,
  lexique_max: 12,
  marche_graphs_max: 3,
  clickbait_par_registre: 5, // 5 qui piquent + 5 qui font apprendre
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
  // Item texte dans une liste imbriquée (topics[].questions[].note, ...).
  const chaqueSousItem = (champ: string, sousListe: string, sous: string, max: number) => {
    const v = c[champ];
    if (!Array.isArray(v)) return;
    v.forEach((item, i) => {
      if (!item || typeof item !== "object") return;
      const liste = (item as Record<string, unknown>)[sousListe];
      if (!Array.isArray(liste)) return;
      liste.forEach((x, j) => {
        if (x && typeof x === "object") champTexte(x as Record<string, unknown>, sous, max, `${sectionId}.${champ}[${i}].${sousListe}[${j}].${sous}`);
      });
    });
  };
  switch (sectionId) {
    // ── contrat v3.1 ─────────────────────────────────────────────────────
    case "tldr":
      chaqueItem("items", "texte", BUDGETS_V3.tldr_item_chars);
      {
        const total = JSON.stringify(c.items ?? []).length;
        if (total > BUDGETS_V3.tldr_total_chars + 200) {
          avertissements.push(`tldr : environ ${total} caractères au total, budget ${BUDGETS_V3.tldr_total_chars} (à réécrire, pas tronqué)`);
        }
      }
      break;
    case "data":
      listeMax("kpis", BUDGETS_V3.chiffres_kpis);
      listeMax("lexique", BUDGETS_V3.lexique_max);
      listeMax("marche_graphs", BUDGETS_V3.marche_graphs_max);
      {
        const m = c.marche;
        if (m && typeof m === "object") champTexte(m as Record<string, unknown>, "texte", BUDGETS_V3.marche_texte_chars, "data.marche.texte");
        // 1 à 2 graphiques maximum : la rentabilité saute en premier.
        const graphiques = (["barres", "comparaison", "rentabilite"] as const).filter((g) => c[g]);
        if (graphiques.length > BUDGETS_V3.data_graphiques_max) {
          delete c.rentabilite;
          avertissements.push(`data : ${graphiques.length} graphiques, budget ${BUDGETS_V3.data_graphiques_max}, rentabilite retirée`);
        }
      }
      break;
    case "apprentissages":
      listeMax("items", BUDGETS_V3.apprentissages_items);
      break;
    case "topics":
      chaqueItem("topics", "intention", BUDGETS_V3.topic_intention_chars);
      chaqueSousItem("topics", "questions", "note", BUDGETS_V3.topic_note_chars);
      break;
    case "personnel":
      listeMax("zone_grise", BUDGETS_V3.zone_grise_items);
      chaqueItem("zone_grise", "texte", BUDGETS_V3.zone_grise_item_chars);
      chaqueItem("donnees_cachees", "texte", BUDGETS_V3.bloc_b_item_chars);
      break;
    case "revue_de_presse":
      listeMax("a_lire", BUDGETS_V3.a_lire_max);
      chaqueItem("a_lire", "apport", BUDGETS_V3.a_lire_apport_chars);
      break;
    // ── sections retirées (rollbacks, données historiques) ───────────────
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
    case "tensions":
      listeMax("cartes", BUDGETS_V3.tensions_cartes);
      break;
    case "parcours":
      listeMax("lignes", BUDGETS_V3.parcours_lignes);
      break;
    case "a_lire":
      listeMax("liens", BUDGETS_V3.a_lire_max);
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
  // ── contrat v3.1 ──────────────────────────────────────────────────────────
  sticky_header: { societe: "iliad" },
  identite: {
    numero: "612",
    titre_lignes: ["Xavier", "Niel"],
    societe: "iliad",
    sous_titre: "Une phrase de fait d'armes vérifiable. Une phrase de thèse en « le comment de ».",
    pilules: ["MAR 22 SEPT · 9H30", "STUDIO 71 · RDC SUR RUE", "2H30"],
    liens: [{ label: "Wikipedia", url: "https://fr.wikipedia.org/wiki/... (SYSTÉMATIQUE quand la page existe, en premier)" }, { label: "LinkedIn", url: "https://www.linkedin.com/in/..." }],
    date_naissance: "1972-08-25 (ISO, sourcée ; l'âge se calcule au rendu à la date d'enregistrement)",
    langue: "fr (défaut) ou en : bascule tout l'habillage du template en anglais (épisode enregistré en anglais)",
    accompagnants: [{ nom: "Prénom Nom, ou « à confirmer »", fonction: "attachée de presse" }],
    mise_en_relation: { qui: "qui a connecté", canal: "par quel canal (intro email, DM, agence...)" },
  },
  checklist_prerec: { items: DEFAULT_CHECKLIST },
  tldr: {
    items: [
      { label: "Qui", texte: "une idée par ligne, phrases courtes ; 1200 caractères pour le bloc entier" },
      { label: "Fait d'armes", texte: "..." },
      { label: "Fil rouge", texte: "..." },
      { label: "Le comment", texte: "..." },
      { label: "Polémique", texte: "..." },
      { label: "Pourquoi maintenant", texte: "..." },
      { label: "Piège", texte: "..." },
      { label: "Levier", texte: "..." },
      { label: "État d'esprit", texte: "neuf labels, DANS CET ORDRE ; la leçon transférable vit dans apprentissages" },
    ],
  },
  data: {
    kpis: [{ valeur: "9,9 Md€", libelle: "CA groupe 2024", source: "iliad, mars 2025 (source datée OBLIGATOIRE ; chiffre non confirmé : zg au lieu de source)", zg: "motcle (pointeur zone grise si le chiffre n'est pas tranché)" }],
    barres: { titre: "CA sur 10 ans, Md€", note: "explication courte", source: "documents annuels", valeurs: [{ label: "24", affiche: "9,9", valeur: 9.9, plein: true }] },
    comparaison: { titre: "Croissance comparée", source: "rapports annuels", valeurs: [{ nom: "iliad", affiche: "+125 %", pct: 125, hero: true }] },
    marche: { texte: "L'essentiel du marché en UN paragraphe (900 caractères max).", comparables: [{ nom: "Pair ou concurrent", position: "positionnement relatif de l'invité, une ligne" }] },
    marche_graphs: [{
      id: "marche-mondial",
      titre: "1 · Le box-office mondial n'a jamais retrouvé 2019 (titre en langage clair)",
      sous_titre: "Recettes mondiales des salles, en milliards de dollars",
      type: "barres (ou barres_jumelees : deux séries par label, valeur2/affiche2 + legende)",
      valeurs: [{ label: "2019", valeur: 42.3, affiche: "42,3", accent: "noir (ou rouge, jaune ; défaut gris)", legende: "sous-libellé optionnel" }],
      callout: "Ce qu'il faut retenir, une à trois phrases (bordure rouge à gauche).",
      source: "Gower Street Analytics (déc. 2025), Comscore (OBLIGATOIRE : série non sourçable = graph omis)",
    }],
    lexique: [{ terme: "Slate", definition: "8 à 12 termes du jargon du secteur, une phrase chacun, écrits pour quelqu'un qui ne vient pas du secteur." }],
  },
  apprentissages: {
    intro: "5 à 8 systèmes. Test : la réponse change la façon de travailler d'un auditeur dès lundi matin.",
    items: [{ titre: "Le pricing comme arme", connu: "ce que les sources établissent, 2 lignes max", manque: "ce qui reste opaque, 2 lignes max", question: "la question qui force la mécanique (critère, seuil, arbitrage, cas précis), tutoiement, sans point final" }],
  },
  clips: {
    piquantes: ["5 questions qui piquent (jusqu'à la gêne assumée : héritage, argent personnel, échecs, ce qu'il referait ou pas), tutoiement, pas de guillemets"],
    apprentissages: ["5 questions qui extraient un apprentissage concret du meilleur de sa catégorie (grille de lecture, règle unique transmissible, habitude contre-intuitive, coût de ses non, comment on entre dans son club)"],
  },
  topics: {
    terrain_connu: [{ question: "Le forfait à 2 euros, comment vous avez fait", reponse: "sa réponse rodée en une ligne", depassement: "tu racontes souvent X, mais qu'est-ce qui s'est passé juste avant" }],
    topics: [{
      titre: "Le titre du topic",
      intention: "une ligne, 200 caractères max",
      contexte: "v4 : le contexte du sujet en un paragraphe (colonne de fond de la brique)",
      dates: ["v4 : dates clés du sujet, une ligne chacune (« Avril 2012 : Le Prénom »)"],
      citations: ["v4 : citation exacte de l'invité, sourcée par la recherche"],
      hero: { valeur: "60 M€ → 1 Md€", libelle: "v4 : chiffre héroïque de la brique (facultatif)" },
      extras: { titre: "Le tour de table", items: ["v4 : éléments listés (facultatif)"] },
      reflexions: ["v4 : réflexions tactiques (colonne verte de la brique)"],
      pleine_largeur: false,
      questions: [{ num: "01 (numérotation CONTINUE sur toute la fiche, pas de plafond)", texte: "question courte, tutoiement, sans point final, adossée à un fait", clip: true, zg: "motcle (pointeur zone grise)" }],
    }],
  },
  personnel: {
    bandeau: DEFAULT_PERSONNEL_BANDEAU,
    entourage: [{ nom: "Cyril Poidatz", role: "cofondateur iliad", eclaire: "ce que cette personne éclaire", preconfirmer: "ce qu'il faut pré-confirmer avec elle avant plateau" }],
    donnees_cachees: [{ texte: "Vieux dossier, anecdote introuvable dans les interviews récentes, archive. En bien ou en mal.", source: "source datée, OBLIGATOIRE sauf pointeur zg", zg: "motcle (si non sourçable)" }],
    zone_grise: [{ id: "zg_motcle (identifiant court et STABLE ; toutes les sections pointent, aucune ne recopie)", texte: "à faire confirmer par l'invité, 400 caractères max", origine: "note Matthieu / rédaction (chiffre non tranché)" }],
  },
  revue_de_presse: {
    reseaux: [{ label: "X", url: "https://x.com/... (liens DIRECTS selon l'archétype : X, Instagram, LinkedIn, YouTube, profils officiels)" }],
    palmares: [{ date: "2024", texte: "liste exhaustive et datée : titres, exits, récompenses, records" }],
    a_lire: [{ niveau: "indispensable (ou utile)", titre: "3 entrées MINIMUM, 5 max si le détour se justifie ; la page Wikipedia y figure systématiquement quand elle existe", date: "mars 2025", temps_lecture: "12 min", apport: "l'apport en une ligne, 120 caractères max", url: "https://... (vérifiée, jamais reconstruite)", embargo: false }],
  },
  // ── sections retirées (données historiques, rollback) ────────────────────
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
  a_lire: { liens: [{ niveau: "indispensable", titre: "RETIRÉ v3.1 : vit dans revue_de_presse.a_lire", date: "mars 2025", temps_lecture: "12 min", apport: "ce que la source apporte en une phrase", url: "https://..." }] },
  trente_secondes: { items: [{ label: "Qui", texte: "RETIRÉ v3.1 : absorbé par tldr" }] },
  parcours: { lignes: [{ annee: "1999", texte: "RETIRÉ v3.1 : les jalons de palmarès vivent dans revue_de_presse.palmares" }] },
  entourage: { personnes: [{ nom: "Cyril Poidatz", role: "cofondateur iliad", texte: "RETIRÉ v3.1 : vit dans personnel.entourage" }] },
  anecdotes: { items: [{ texte: "RETIRÉ v3.1 : vit dans personnel.donnees_cachees", source: "livre 2023, ch. 4", cachee: true }] },
  tensions: { cartes: [{ a: "Discours : ...", b: "Fait : ...", angle: "RETIRÉ v3.1 : intention ou relance d'un topic, sinon personnel" }] },
  polemiques: { items: [{ texte: "RETIRÉ v3.1 : le fait vit dans personnel.donnees_cachees, la question en fin de clips", source: "source publique datée", question: "la question qui fâche" }] },
  questions_recurrentes: { items: [{ question: "RETIRÉ v3.1 : vit dans topics.terrain_connu", reponse: "réponse rodée en une ligne" }] },
  sequencage: { blocs: [{ debut_min: 0, fin_min: 20, court: "RETIRÉ", titre: "Section retirée le 27/07 ; v3.1 : seul le gate time par topic en hérite", intention: "", mode: "", rappel_label: "", rappel: "" }] },
  dix_questions: { questions: [{ num: "01", bloc: 0, texte: "RETIRÉ v3.1 : vit dans topics[].questions", note: "RELANCE : ..." }] },
  zone_grise: { items: [{ id: "zg_motcle", texte: "RETIRÉ v3.1 : vit dans personnel.zone_grise, identifiants conservés", origine: "note Matthieu" }] },
  sources: { liens: [{ date: "2023", titre: "Titre", apport: "ce que la source apporte", url: "https://... (liste exhaustive conservée en BASE ; la revue de presse affiche les indispensables)" }] },
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
/** Bouton photo v4 : recherche Google Images sur le nom EXACT de l'invité,
 *  entre guillemets, URL encodée (les accents passent en percent-encoding).
 *  Pas de récupération automatique d'images : un lien, rien d'autre. */
export function googleImagesUrl(nom: string): string {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`"${nom.trim()}"`)}`;
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
