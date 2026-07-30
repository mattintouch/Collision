// Catalogue des sections de la fiche prépa GDIY (contrat v2, Bloc A / Bloc B).
// Ordre et section_id STABLES : ils pilotent get_fiche / update_section (édition
// fine) et le rendu. Ajouter/retirer une section = ici, en un seul endroit.
//
// Principe directeur (contrat §0) : le filtre éditorial n'est pas « connu vs
// inconnu » mais « surface vs mécanisme ». Deux objets dans une même page :
// Bloc A, document d'apprentissage (lu 48 h avant) ; Bloc B, console d'épisode
// (scannée pendant l'enregistrement, à partir de l'ancre « console »).

export interface FicheSectionDef {
  id: string;         // clé stable (section_id) pour l'édition MCP
  titre: string;      // libellé affiché
  num?: string;       // numéro affiché (A1..A6, B1..B12), absent pour le chrome
  bloc?: "A" | "B";   // A = comprendre (lecture), B = console (enregistrement)
  role?: string;      // note de cadrage (usage interne / génération)
}

export const FICHE_SECTIONS: FicheSectionDef[] = [
  // ── chrome ────────────────────────────────────────────────────────────────
  { id: "sticky_header", titre: "Bandeau", role: "nom invité + société à gauche, GDIY à droite, collant au scroll" },
  { id: "entete", titre: "En-tête", role: "nom (liens LinkedIn/Wikipedia), sous-titre qui/pourquoi maintenant, pilules logistiques" },
  { id: "checklist_prerec", titre: "Checklist pré-rec", role: "cases à cocher persistées : avion x2, café+eau, machine à café éteinte, clim, son+cams, brief invité, photos. TOUTE la checklist cochée pour lancer le REC" },

  // ── Bloc A : comprendre (lecture avant enregistrement) ───────────────────
  // Refonte du 30/07 (décision Matthieu) : la fiche s'ouvre sur un TL;DR.
  { id: "tldr", titre: "TL;DR", num: "A1", bloc: "A", role: "l'ESSENTIEL en 5 puces maximum d'une ligne chacune : ce que Matthieu doit retenir si la fiche n'est lue que 3 minutes (qui, le fait d'armes, la mécanique centrale, l'angle de l'épisode, le piège à éviter). Écrit par la passe de rédaction : c'est une SYNTHÈSE de la fiche entière, jamais une recherche" },
  { id: "enjeu", titre: "Enjeu de l'épisode", num: "A2", bloc: "A", role: "la promesse de DYNAMIQUE (pas le sujet de domaine), le risque principal (jargon, pitch défensif), et la leçon transférable explicitement nommée (doctrine, couche C)" },
  { id: "recit_canonique", titre: "Récit canonique", num: "A3", bloc: "A", role: "l'histoire telle que le grand public informé la connaît, 5 à 8 paragraphes maîtrisés : origines, bascules, ascension, statut actuel. INTERDITS : SIREN, toque, adresses, données d'annuaire (sauf pertinence narrative). Doit permettre de reformuler la trajectoire de mémoire" },
  { id: "mecanique_succes", titre: "Mécanique du succès", num: "A4", bloc: "A", role: "OBLIGATOIRE, cœur de la fiche : définition du « meilleur » avec métrique explicite, pairs nommés et positionnement relatif, 3 à 5 points de divergence datés (décisions structurantes), contrefactuel signalé comme raisonnement" },
  { id: "univers", titre: "Univers / marché", num: "A5", bloc: "A", role: "adapté au profil : marché (entrepreneur), discipline et hiérarchie (sportif), écosystème professionnel (avocat, médecin). Taille, économie, acteurs, tendances multi-années, tout sourcé et daté. Visuels barres/timeline réutilisables" },
  { id: "personnel", titre: "Personnel", num: "A6", bloc: "A", role: "situation familiale, histoires personnelles PUBLIQUES, épreuves, passions. Source publique obligatoire par élément (sinon zone grise). Bandeau d'usage : matière pour le rapport, diffusion à l'antenne à valider. Aucune inférence sur la vie privée" },
  // a_lire déplacé en ANNEXE de pied de fiche (refonte conversation du 27/07) :
  // c'est l'outil de recherche de la veille, pas une lecture du Bloc A.

  // ── Bloc B : console (pendant l'enregistrement, ancre « console ») ───────
  // v3.1 item 1 : les questions clips remontent en tête du Bloc B, juste après
  // les chiffres (outil de plateau, accès immédiat). Réorganisation d'ORDRE et
  // de NUMÉRO uniquement : les section_id sont stables, les ancres tiennent.
  { id: "trente_secondes", titre: "30 secondes avant d'entrer", num: "B1", bloc: "B", role: "qui, fait d'armes, pourquoi maintenant, état d'esprit probable de l'invité" },
  { id: "chiffres", titre: "En chiffres", num: "B2", bloc: "B", role: "JAMAIS VIDE : 8 à 15 données clés sourcées et datées, mélange invité + univers" },
  { id: "questions_reseaux", titre: "Questions clips", num: "B3", bloc: "B", role: "questions clickbait à dégainer en tournage pour fabriquer un short viral (moment de mou, relance). Proposées par Vadim, challengées par l'équipe. Chaque item : question (tutoiement), ressort (argent, échec, contre-pied, confession), clip (réaction visée)" },
  { id: "parcours", titre: "Parcours", num: "B4", bloc: "B", role: "dates en gras, sans point final, nettoyé des données d'annuaire, chaque ligne peut déclencher une question" },
  { id: "playbook", titre: "Playbook", num: "B5", bloc: "B", role: "SECTION REINE (doctrine) : 6 leviers max couvrant les 3 familles de mécaniques (action, réflexion, innovation), calibrés sur l'archétype. Format : établi / opaque / la question qui force la mécanique (critère, seuil, arbitrage, cas précis). OBLIGATOIRE" },
  { id: "entourage", titre: "Entourage", num: "B6", bloc: "B", role: "mentors, associés, rencontres pivots, ennemis utiles. Au moins une question dessus" },
  { id: "anecdotes", titre: "Anecdotes sur l'invité", num: "B7", bloc: "B", role: "anecdotes sourcées, les bien cachées marquées en bonus (cachee=true) : matériau narratif exclusif" },
  { id: "tensions", titre: "Tensions", num: "B8", bloc: "B", role: "2-4 cartes opposant deux faits vérifiés (contradictions, zones d'ombre)" },
  { id: "questions_recurrentes", titre: "Questions récurrentes (à dépasser)", num: "B9", bloc: "B", role: "questions déjà posées 10 fois + réponse rodée en 1 ligne. À ne pas reposer telles quelles" },
  // Refonte conversation (27/07, décision Matthieu) : le déroulé minuté est
  // SUPPRIMÉ. Plus généré, plus rendu, plus rédigé par la passe 5. Le
  // section_id reste au catalogue pour les données historiques et les ancres.
  { id: "sequencage", titre: "Séquençage (retiré)", num: "B10", bloc: "B", role: "RETIRÉ (refonte du 27/07) : la conversation n'est plus scriptée. Données historiques conservées, section ni générée ni affichée" },
  { id: "dix_questions", titre: "Les questions", num: "B11", bloc: "B", role: "des PROPOSITIONS à plat, jamais un script : courtes, directes, tutoiement, sans guillemets, majorité en 'comment'. Refonte du 30/07 : chaque comment va au fond, il exige le mode opératoire (critère, seuil, arbitrage, cas précis, chiffre demandé), jamais une réponse d'article. AUCUNE question ne double un clip, une récurrente ou une question de playbook. Rayées d'un tap avec timecode pendant le REC" },
  { id: "zone_grise", titre: "Zone grise", num: "B12", bloc: "B", role: "bandeau alerte : notes internes non vérifiées et données non sourçables, à faire confirmer par l'invité" },
  // Refonte du 30/07 (décision Matthieu) : les polémiques ont leur section,
  // vers le bas de la console, avec la question frontale prête à poser.
  { id: "polemiques", titre: "Polémiques", num: "B13", bloc: "B", role: "controverses et critiques PUBLIQUES documentées (procès, échecs contestés, prises de position clivantes), 4 items max : le fait sourcé et daté, puis la QUESTION QUI FÂCHE, frontale mais adossée au fait, jamais une insinuation. Une rumeur non sourçable va en zone grise, pas ici" },

  // ── annexe : la recherche de la veille ────────────────────────────────────
  { id: "a_lire", titre: "À lire la veille", num: "B14", bloc: "B", role: "ANNEXE de préparation : 3 sources curées (indispensable / utile / optionnel) avec titre, date, temps de lecture, apport en une phrase. URLs vérifiées à la génération, jamais reconstruites" },
  { id: "sources", titre: "Sources", num: "B15", bloc: "B", role: "liste exhaustive, liens datés avec l'apport de chacun, URLs vérifiées" },

  // ── chrome ────────────────────────────────────────────────────────────────
  { id: "footer", titre: "Pied de page", role: "mono, rappel post-rec : photos + mémo vocal (ressenti, accroche LinkedIn, titre, potentiel)" },
];

export const FICHE_SECTION_IDS = FICHE_SECTIONS.map((s) => s.id);

/** Sections OBLIGATOIRES du contrat v2 : une fiche dont l'une d'elles est vide
 *  n'est pas présentable (gate au rendu, badge à l'index, refus en_challenge). */
export const SECTIONS_OBLIGATOIRES = ["mecanique_succes", "univers", "chiffres"] as const;

/** Renommages du contrat v2 (§5) : les fiches existantes conservent leur
 *  contenu, mappé sur les nouvelles clés (lecture ET écriture). */
export const LEGACY_SECTION_ALIASES: Record<string, string> = {
  presentation: "recit_canonique",
  entreprise: "univers",
  sources_rapides: "a_lire",
};

/** Résout un section_id en tenant compte des alias hérités. */
export function canonicalSectionId(id: string): string {
  return LEGACY_SECTION_ALIASES[id] ?? id;
}

/** Ordre (position) d'une section par son id ; -1 si inconnue. */
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
