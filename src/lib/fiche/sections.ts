// Catalogue des sections de la fiche prépa GDIY (brief §4). Ordre et section_id
// STABLES : ils pilotent get_fiche / update_section (édition fine) et le rendu.
// Ajouter/retirer une section = ici, en un seul endroit.

export interface FicheSectionDef {
  id: string;         // clé stable (section_id) pour l'édition MCP
  titre: string;      // libellé affiché
  num?: string;       // numéro affiché (sections éditoriales), absent pour le chrome
  role?: string;      // note de cadrage (usage interne / génération)
}

export const FICHE_SECTIONS: FicheSectionDef[] = [
  { id: "sticky_header", titre: "Bandeau", role: "nom invité + société à gauche, GDIY à droite, collant au scroll" },
  { id: "entete", titre: "En-tête", num: "00", role: "nom (liens LinkedIn/Wikipedia), sous-titre qui/pourquoi maintenant, pilules logistiques" },
  { id: "checklist_prerec", titre: "Checklist pré-rec", role: "cases à cocher persistées (localStorage) : avion x2, café+eau, son+cams, brief invité, photos" },
  { id: "enjeu", titre: "Enjeu de l'épisode", num: "01", role: "5 lignes : pourquoi lui, pourquoi maintenant, promesse auditeur, clip social visé, risque principal" },
  { id: "sources_rapides", titre: "Sources rapides", role: "les 3 liens les plus utiles, en haut" },
  { id: "trente_secondes", titre: "30 secondes avant d'entrer", num: "02", role: "qui, fait d'armes, pourquoi maintenant, état d'esprit probable de l'invité" },
  { id: "presentation", titre: "Présentation de l'invité", num: "03", role: "portrait exhaustif en haut de fiche : qui il est, d'où il vient, ce qu'il a construit, sa réputation, son style en interview" },
  { id: "chiffres", titre: "En chiffres", num: "04", role: "cartes KPI vérifiées et DATÉES (invité, société, marché), chaque carte avec sa source" },
  { id: "parcours", titre: "Parcours", num: "05", role: "dates en gras, sans point final, chaque ligne peut déclencher une question" },
  { id: "entreprise", titre: "La société / l'activité", num: "06", role: "présentation SIMPLIFIÉE de la société ou de l'activité + visuels adaptatifs (barres, comparaison, rentabilité, timeline)" },
  { id: "playbook", titre: "Playbook", num: "07", role: "5-8 méthodes : ce qu'on sait, ce qui manque, la question qui l'extrait. OBLIGATOIRE" },
  { id: "entourage", titre: "Entourage", num: "08", role: "mentors, associés, rencontres pivots, ennemis utiles. Au moins une question dessus" },
  { id: "anecdotes", titre: "Anecdotes sur l'invité", num: "09", role: "anecdotes sourcées, les bien cachées marquées en bonus (cachee=true) : matériau narratif exclusif" },
  { id: "tensions", titre: "Tensions", num: "10", role: "2-4 cartes opposant deux faits vérifiés (contradictions, zones d'ombre)" },
  { id: "questions_recurrentes", titre: "Questions récurrentes (à dépasser)", num: "11", role: "questions déjà posées 10 fois + réponse rodée en 1 ligne. À ne pas reposer telles quelles" },
  { id: "questions_reseaux", titre: "Questions clips", num: "12", role: "questions clickbait à dégainer en tournage pour fabriquer un clip (moment de mou, relance). Proposées par Vadim, challengées par l'équipe. Chaque item : question (tutoiement), ressort (argent, échec, contre-pied, confession), clip (réaction visée)" },
  { id: "sequencage", titre: "Séquençage", num: "13", role: "6-8 blocs sur 2h30, alterner récit et extraction, monter en intimité, timings mono" },
  { id: "dix_questions", titre: "Les 10 questions", num: "14", role: "10 questions + relances. Courtes, directes, tutoiement, sans guillemets, majorité en 'comment'" },
  { id: "zone_grise", titre: "Zone grise", num: "15", role: "bandeau ambre : notes internes non vérifiées, à faire confirmer par l'invité" },
  { id: "sources", titre: "Sources", num: "16", role: "liens datés avec l'apport de chacun" },
  { id: "footer", titre: "Pied de page", role: "mono, rappel post-rec : photos + mémo vocal (ressenti, accroche LinkedIn, titre, potentiel)" },
];

export const FICHE_SECTION_IDS = FICHE_SECTIONS.map((s) => s.id);

/** Ordre (position) d'une section par son id ; -1 si inconnue. */
export function sectionPosition(id: string): number {
  return FICHE_SECTION_IDS.indexOf(id);
}
