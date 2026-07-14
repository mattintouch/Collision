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
  { id: "enjeu", titre: "Enjeu de l'épisode", num: "A1", bloc: "A", role: "la promesse de DYNAMIQUE (pas le sujet de domaine), le risque principal (jargon, pitch défensif), et la leçon transférable explicitement nommée (doctrine, couche C)" },
  { id: "recit_canonique", titre: "Récit canonique", num: "A2", bloc: "A", role: "l'histoire telle que le grand public informé la connaît, 5 à 8 paragraphes maîtrisés : origines, bascules, ascension, statut actuel. INTERDITS : SIREN, toque, adresses, données d'annuaire (sauf pertinence narrative). Doit permettre de reformuler la trajectoire de mémoire" },
  { id: "mecanique_succes", titre: "Mécanique du succès", num: "A3", bloc: "A", role: "OBLIGATOIRE, cœur de la fiche : définition du « meilleur » avec métrique explicite, pairs nommés et positionnement relatif, 3 à 5 points de divergence datés (décisions structurantes), contrefactuel signalé comme raisonnement" },
  { id: "univers", titre: "Univers / marché", num: "A4", bloc: "A", role: "adapté au profil : marché (entrepreneur), discipline et hiérarchie (sportif), écosystème professionnel (avocat, médecin). Taille, économie, acteurs, tendances multi-années, tout sourcé et daté. Visuels barres/timeline réutilisables" },
  { id: "personnel", titre: "Personnel", num: "A5", bloc: "A", role: "situation familiale, histoires personnelles PUBLIQUES, épreuves, passions. Source publique obligatoire par élément (sinon zone grise). Bandeau d'usage : matière pour le rapport, diffusion à l'antenne à valider. Aucune inférence sur la vie privée" },
  { id: "a_lire", titre: "À lire", num: "A6", bloc: "A", role: "5 à 8 sources hiérarchisées (indispensable / utile / optionnel) : titre, date, temps de lecture, apport en une phrase. Wikipédia inclus sans complexe. URLs vérifiées à la génération, jamais reconstruites" },

  // ── Bloc B : console (pendant l'enregistrement, ancre « console ») ───────
  { id: "trente_secondes", titre: "30 secondes avant d'entrer", num: "B1", bloc: "B", role: "qui, fait d'armes, pourquoi maintenant, état d'esprit probable de l'invité" },
  { id: "chiffres", titre: "En chiffres", num: "B2", bloc: "B", role: "JAMAIS VIDE : 8 à 15 données clés sourcées et datées, mélange invité + univers" },
  { id: "parcours", titre: "Parcours", num: "B3", bloc: "B", role: "dates en gras, sans point final, nettoyé des données d'annuaire, chaque ligne peut déclencher une question" },
  { id: "playbook", titre: "Playbook", num: "B4", bloc: "B", role: "SECTION REINE (doctrine) : 5-8 systèmes couvrant les 3 familles de mécaniques (action, réflexion, innovation), calibrés sur l'archétype. Format : établi / opaque / la question qui force la mécanique (critère, seuil, arbitrage, cas précis). OBLIGATOIRE" },
  { id: "entourage", titre: "Entourage", num: "B5", bloc: "B", role: "mentors, associés, rencontres pivots, ennemis utiles. Au moins une question dessus" },
  { id: "anecdotes", titre: "Anecdotes sur l'invité", num: "B6", bloc: "B", role: "anecdotes sourcées, les bien cachées marquées en bonus (cachee=true) : matériau narratif exclusif" },
  { id: "tensions", titre: "Tensions", num: "B7", bloc: "B", role: "2-4 cartes opposant deux faits vérifiés (contradictions, zones d'ombre)" },
  { id: "questions_recurrentes", titre: "Questions récurrentes (à dépasser)", num: "B8", bloc: "B", role: "questions déjà posées 10 fois + réponse rodée en 1 ligne. À ne pas reposer telles quelles" },
  { id: "questions_reseaux", titre: "Questions clips", num: "B9", bloc: "B", role: "questions clickbait à dégainer en tournage pour fabriquer un short viral (moment de mou, relance). Proposées par Vadim, challengées par l'équipe. Chaque item : question (tutoiement), ressort (argent, échec, contre-pied, confession), clip (réaction visée)" },
  { id: "sequencage", titre: "Séquençage", num: "B10", bloc: "B", role: "6-8 blocs sur 2h30, alterner récit et extraction, monter en intimité, timings mono" },
  { id: "dix_questions", titre: "Les 10 questions", num: "B11", bloc: "B", role: "10 questions + relances. Courtes, directes, tutoiement, sans guillemets, majorité en 'comment'" },
  { id: "zone_grise", titre: "Zone grise", num: "B12", bloc: "B", role: "bandeau alerte : notes internes non vérifiées et données non sourçables, à faire confirmer par l'invité" },
  { id: "sources", titre: "Sources", num: "B13", bloc: "B", role: "liste exhaustive, liens datés avec l'apport de chacun, URLs vérifiées" },

  // ── chrome ────────────────────────────────────────────────────────────────
  { id: "footer", titre: "Pied de page", role: "mono, rappel post-rec : photos + mémo vocal (ressenti, accroche LinkedIn, titre, potentiel)" },
];

export const FICHE_SECTION_IDS = FICHE_SECTIONS.map((s) => s.id);

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
