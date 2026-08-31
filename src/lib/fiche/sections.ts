// Catalogue des sections de la fiche prépa GDIY, contrat v3.1 (brief du 31/07,
// validé sur le cas réel Rudy Gobert). Ordre et section_id STABLES : ils
// pilotent get_fiche / update_section (édition fine) et le rendu. Ajouter ou
// retirer une section = ici, en un seul endroit.
//
// Principe directeur (v3.1) : PROPRIÉTÉ UNIQUE DES FAITS. Chaque fait vit dans
// une seule section, les autres pointent. Neuf sections de contenu, plus le
// bandeau, les sources (conservées en base) et le pied de page. Les sections
// des contrats précédents restent lisibles (retire: true) : données
// historiques et rollback, mais ni semées, ni rendues, ni générées.

export interface FicheSectionDef {
  id: string;         // clé stable (section_id) pour l'édition MCP
  titre: string;      // libellé affiché
  num?: string;       // numéro affiché (01..09), absent pour le chrome
  role?: string;      // note de cadrage (usage interne / génération)
  /** Section d'un contrat précédent : lisible (historique, rollback), jamais
   *  semée sur une fiche, jamais rendue, jamais générée. */
  retire?: boolean;
}

export const FICHE_SECTIONS: FicheSectionDef[] = [
  // ── chrome ────────────────────────────────────────────────────────────────
  { id: "sticky_header", titre: "Bandeau", role: "nom invité + société à gauche, GDIY en mono à droite, collant au scroll. v3.1 : trois ancres de navigation (TL;DR, Clips, Questions) pour l'accès direct à H-1 sur mobile" },

  // ── contrat v3.1, ordre imposé ────────────────────────────────────────────
  { id: "identite", titre: "Identité", num: "01", role: "prénom nom en titre avec lien Wikipedia quand la page existe (règle systématique), sinon LinkedIn, sinon rien ; titre · société(s) ; date de naissance (l'âge se calcule au rendu à la date d'enregistrement) ; pilules logistiques ; accompagnants (noms + fonctions, à confirmer si inconnu) ; mise en relation (qui a connecté, par quel canal) ; sous-titre d'épisode : une phrase de fait d'armes vérifiable + une phrase de thèse en « le comment de »" },
  { id: "checklist_prerec", titre: "Checklist pré-rec", num: "02", role: "v4 : sept gestes fixes identiques sur toutes les fiches, bande rouge dépliée par défaut, repliable ; le bouton REC vit dans la bande, cliquable dépliée ou repliée, et arme un chronomètre de séance local (intégration console reportée)" },
  { id: "tldr", titre: "TL;DR", num: "03", role: "brief d'attaque lisible en 60 secondes, 1200 caractères max. Phrases courtes, une idée par ligne. Neuf labels dans cet ordre : Qui, Fait d'armes, Fil rouge, Le comment, Polémique, Pourquoi maintenant, Piège, Levier, État d'esprit. La leçon transférable vit dans apprentissages, pas ici" },
  { id: "data", titre: "Data", num: "04", role: "cartes KPI (valeur, libellé, source datée ; chiffre non confirmé = pointeur ZG, jamais de chiffre orphelin), adaptées à l'archétype ; 1 à 2 graphiques maximum ; sous-bloc Marché et comparables. v4 : + marche_graphs (trois cartes graphiques du marché en barres CSS, valeurs datées et sourcées, série non sourçable = graph omis) et lexique (8 à 12 termes du jargon du secteur, une phrase chacun)" },
  { id: "apprentissages", titre: "Apprentissages", num: "05", role: "5 à 8 systèmes au format connu / manque / question, points de décision structurants inclus. Test de qualité : la réponse change la façon de travailler d'un auditeur dès lundi matin" },
  { id: "clips", titre: "Clickbait", num: "06", role: "v4 (repurpose de clips, règle de la brique unique) : exactement 10 questions en deux registres, 5 qui piquent (jusqu'à la gêne assumée : héritage, argent personnel, échecs, ce qu'il referait ou pas) et 5 qui font apprendre (grille de lecture, règle transmissible, habitude contre-intuitive, coût de ses non, comment on entre dans son club). Tutoiement, pas de guillemets, à doser selon la température du studio. Les fiches v3.1 au format {questions} restent lisibles dans l'ancien style" },
  { id: "topics", titre: "Main topics", num: "07", role: "v4 : 5 à 8 briques, chacune avec titre, contexte en un paragraphe, dates clés, citations sourcées, chiffre héroïque facultatif, éléments listés (extras), Réflexions tactiques et questions cœur numérotées en continu sur toute la fiche (tag clip sur les candidates réseaux) ; le Terrain connu (question posée partout / réponse rodée / dépassement, TOUJOURS 3 items) se rend en bloc dédié. Ni minutage ni notes tactiques : champs tolérés en lecture, plus jamais affichés ni exigés. Dosage doctrine : 60 % mécanique personnelle, 20 % domaine subordonné, 20 % leçons transférables ; max 3 questions sur 10 sur le domaine" },
  { id: "personnel", titre: "Personnel", num: "08", role: "trois sous-blocs : Entourage (mentors, associés, coachs, pivots, ennemis utiles : rôle, ce qu'il éclaire, ce qu'il faut pré-confirmer avant plateau) ; Données cachées (vieux dossiers, anecdotes introuvables dans les interviews récentes, archives, en bien ou en mal, chaque item sourcé ou pointé ZG) ; Zone grise (bandeau, source unique de vérité des statuts de vérification, identifiants stables ZG: xxx, toutes les autres sections pointent, aucune ne recopie)" },
  { id: "revue_de_presse", titre: "Revue de presse", num: "09", role: "quatre sous-blocs dans cet ordre : Réseaux sociaux de l'invité (liens directs selon l'archétype) ; Palmarès (liste exhaustive et datée des titres, exits, récompenses, records) ; À lire la veille (3 à 5 entrées justifiées, niveau indispensable/utile, temps de lecture, apport en une ligne de 120 caractères max, la page Wikipedia y figure systématiquement quand elle existe) ; Sources complètes (conservées en base, la fiche affiche les indispensables et renvoie vers Magellan)" },

  // ── base : la liste exhaustive des sources reste stockée et fusionnée ─────
  { id: "sources", titre: "Sources", role: "liste exhaustive en BASE, liens datés avec l'apport de chacun, URLs vérifiées. La fiche ne l'affiche plus en pleine page : la revue de presse montre les indispensables et renvoie vers Magellan (get_section sources)" },

  // ── chrome ────────────────────────────────────────────────────────────────
  { id: "footer", titre: "Pied de page", role: "v4 : remplacé au rendu par la checklist post-rec (bande rouge « Avant de quitter le studio », six gestes fixes, repliée par défaut). Le contenu texte reste stocké (rollback) mais ne s'affiche plus" },

  // ── contrats précédents (retirés le 31/07, données historiques lisibles) ──
  { id: "enjeu", titre: "Enjeu (retiré)", retire: true, role: "RETIRÉ v3.1 : absorbé par tldr (Fil rouge, Piège) et apprentissages (leçon)" },
  { id: "recit_canonique", titre: "Récit canonique (retiré)", retire: true, role: "RETIRÉ v3.1 : absorbé par tldr" },
  { id: "trente_secondes", titre: "30 secondes (retiré)", retire: true, role: "RETIRÉ v3.1 : absorbé par tldr (Qui, Fait d'armes, État d'esprit, Pourquoi maintenant)" },
  { id: "mecanique_succes", titre: "Mécanique du succès (retiré)", retire: true, role: "RETIRÉ v3.1 : pairs absorbés par data (comparables), divergences par apprentissages" },
  { id: "univers", titre: "Univers (retiré)", retire: true, role: "RETIRÉ v3.1 : absorbé par data (Marché et comparables)" },
  { id: "parcours", titre: "Parcours (retiré)", retire: true, role: "RETIRÉ v3.1 : les jalons à valeur de palmarès migrent vers revue_de_presse, le reste est une perte assumée (historique dans le versionnement)" },
  { id: "anecdotes", titre: "Anecdotes (retiré)", retire: true, role: "RETIRÉ v3.1 : absorbé par personnel (Données cachées)" },
  { id: "entourage", titre: "Entourage (retiré)", retire: true, role: "RETIRÉ v3.1 : absorbé par personnel (Entourage)" },
  { id: "tensions", titre: "Tensions (retiré)", retire: true, role: "RETIRÉ v3.1 : tension rattachable = intention ou relance d'un topic ; tension orpheline = personnel" },
  { id: "polemiques", titre: "Polémiques (retiré)", retire: true, role: "RETIRÉ v3.1 : le fait part dans personnel (Données cachées), la ligne de synthèse dans tldr (Polémique), la question frontale en fin de liste clips (décision du 31/07)" },
  { id: "questions_recurrentes", titre: "Questions récurrentes (retiré)", retire: true, role: "RETIRÉ v3.1 : absorbé par topics (Terrain connu)" },
  { id: "sequencage", titre: "Séquençage (retiré)", retire: true, role: "RETIRÉ (27/07 puis v3.1) : seul le gate time par topic en hérite" },
  { id: "dix_questions", titre: "Les questions (retiré)", retire: true, role: "RETIRÉ v3.1 : absorbé par topics (questions cœur numérotées en continu)" },
  { id: "zone_grise", titre: "Zone grise (retiré)", retire: true, role: "RETIRÉ v3.1 : absorbé par personnel (sous-bloc Zone grise), identifiants ZG conservés" },
  { id: "a_lire", titre: "À lire (retiré)", retire: true, role: "RETIRÉ v3.1 : absorbé par revue_de_presse (À lire la veille)" },
];

export const FICHE_SECTION_IDS = FICHE_SECTIONS.map((s) => s.id);
/** Sections actives du contrat v3.1 (semées, rendues, générées). */
export const FICHE_SECTIONS_ACTIVES = FICHE_SECTIONS.filter((s) => !s.retire);
export const FICHE_SECTION_IDS_ACTIFS = FICHE_SECTIONS_ACTIVES.map((s) => s.id);

/** Sections OBLIGATOIRES du contrat v3.1 : une fiche dont l'une d'elles est
 *  vide n'est pas présentable (gate au rendu, badge à l'index). */
export const SECTIONS_OBLIGATOIRES = ["data", "apprentissages", "topics"] as const;

/** Renommages : contrat v2 (§5) puis v3.1 (les sections dont la FORME de
 *  contenu est compatible sont renommées, contenu conservé ; les autres
 *  passent par le script de migration). Lecture ET écriture. */
export const LEGACY_SECTION_ALIASES: Record<string, string> = {
  // v2 (13/07)
  presentation: "recit_canonique",
  entreprise: "univers",
  sources_rapides: "a_lire",
  // v3.1 (31/07) : formes compatibles.
  entete: "identite",
  questions_reseaux: "clips",
  chiffres: "data",
  playbook: "apprentissages",
};

/** Résout un section_id en tenant compte des alias hérités. */
export function canonicalSectionId(id: string): string {
  return LEGACY_SECTION_ALIASES[id] ?? id;
}

/** Une section retirée du contrat (lisible mais ni semée ni rendue) ? */
export function sectionRetiree(id: string): boolean {
  return FICHE_SECTIONS.find((s) => s.id === canonicalSectionId(id))?.retire === true;
}

/** Ordre (position) d'une section par son id ; -1 si inconnue. Les sections
 *  retirées vivent en fin de catalogue : elles trient après le contenu actif. */
export function sectionPosition(id: string): number {
  return FICHE_SECTION_IDS.indexOf(canonicalSectionId(id));
}

/**
 * Tâche 4 (handoff 24/07) : paramètre `sections` de get_fiche. Note MCP : un
 * paramètre tableau ajouté en cours de route peut arriver TYPÉ EN CHAÎNE dans
 * une session déjà ouverte : accepter tableau ET chaîne (séparateurs virgule
 * ou espace). Alias hérités résolus. null = toute la fiche (comportement
 * historique). Ids inconnus renvoyés pour une erreur actionnable.
 */
export function parseSectionsParam(v: unknown): { ids: Set<string> | null; inconnus: string[] } {
  let bruts: string[] = [];
  if (Array.isArray(v)) bruts = v.filter((x): x is string => typeof x === "string");
  else if (typeof v === "string") bruts = v.split(/[\s,]+/);
  else return { ids: null, inconnus: [] };
  const nettoyes = bruts.map((s) => s.trim()).filter(Boolean);
  if (!nettoyes.length) return { ids: null, inconnus: [] };
  const connus = new Set(FICHE_SECTION_IDS);
  const ids = new Set<string>();
  const inconnus: string[] = [];
  for (const brut of nettoyes) {
    const id = canonicalSectionId(brut);
    if (connus.has(id)) ids.add(id);
    else inconnus.push(brut);
  }
  return { ids, inconnus };
}
