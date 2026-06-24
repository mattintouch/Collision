// Données de démonstration calées sur supabase/seed.sql.
// Utilisées tant que Supabase n'est pas branché, pour voir l'app tourner.

import type {
  Appui,
  CibleEnrichie,
  Contact,
  Show,
  Signal,
  Stage,
  Touche,
} from "./types";

const now = Date.now();
const daysAgo = (n: number) => new Date(now - n * 86400000).toISOString();

export const demoShows: Show[] = [
  { id: "show-gdiy", slug: "gdiy", nom: "Génération Do It Yourself", type_pipe: "invites", couleur: "#1FB46A", archetype_order: null },
  { id: "show-ccg", slug: "ccg", nom: "Combien ça gagne", type_pipe: "invites", couleur: "#3B82F6", archetype_order: null },
  { id: "show-fleurons", slug: "fleurons", nom: "Fleuron(s)", type_pipe: "thematique", couleur: "#B45CFF", archetype_order: null },
];

const invitesStages = (showId: string): Stage[] =>
  [
    ["identifie", "Identifié", 1, false],
    ["qualifie", "Qualifié", 2, false],
    ["contacte", "Contacté", 3, false],
    ["confirme", "Confirmé", 4, true],
    ["programme", "Programmé", 5, false],
    ["enregistre", "Enregistré", 6, false],
    ["publie", "Publié", 7, false],
  ].map(([key, label, position, is_final]) => ({
    id: `${showId}-${key}`,
    show_id: showId,
    key: key as string,
    label: label as string,
    position: position as number,
    is_final: is_final as boolean,
  }));

const fleuronsStages: Stage[] = [
  ["identifie", "Identifié", 1, false],
  ["qualifie", "Qualifié (raison validée)", 2, false],
  ["recherche", "Recherche", 3, false],
  ["decide", "Décidé", 4, true],
  ["produit", "Produit", 5, false],
].map(([key, label, position, is_final]) => ({
  id: `show-fleurons-${key}`,
  show_id: "show-fleurons",
  key: key as string,
  label: label as string,
  position: position as number,
  is_final: is_final as boolean,
}));

export const demoStages: Record<string, Stage[]> = {
  "show-gdiy": invitesStages("show-gdiy"),
  "show-ccg": invitesStages("show-ccg"),
  "show-fleurons": fleuronsStages,
};

function stage(showId: string, key: string): Stage {
  return demoStages[showId].find((s) => s.key === key)!;
}

const base = {
  role: null,
  organisation: null,
  archetype: null,
  secteur: null,
  pays: null,
  envergure: null,
  raison_de_selection: null,
  etat_recherche: null,
  created_at: daysAgo(40),
  updated_at: daysAgo(2),
  stage_position: null as number | null,
  dernier_signal_type: null,
  dernier_signal_date: null,
  dernier_signal_pertinence: null,
  signal_frais: false,
  nb_appuis: 0,
};

export const demoCibles: CibleEnrichie[] = [
  // GDIY
  {
    ...base, id: "c-tony", show_id: "show-gdiy", kind: "personne", nom: "Tony Parker",
    stage_id: stage("show-gdiy", "qualifie").id, stage_key: "qualifie", stage_label: "Qualifié", stage_position: 2,
    priorite: "haute", voie: "froid", sujets: ["sport", "reconversion", "business"],
    canal_reel: "Instagram DM", via_qui: "Agent sportif", date_derniere_touche: daysAgo(12),
    jours_depuis_touche: 12, role: "Entrepreneur, ex-NBA", organisation: "Infinity Nine", archetype: "big_fish",
    dernier_signal_type: "mouvement_entreprise", dernier_signal_date: daysAgo(6), dernier_signal_pertinence: 5,
    signal_frais: true, nb_appuis: 1,
  },
  {
    ...base, id: "c-camille", show_id: "show-gdiy", kind: "personne", nom: "Camille Étienne",
    stage_id: stage("show-gdiy", "contacte").id, stage_key: "contacte", stage_label: "Contacté", stage_position: 3,
    priorite: "moyenne", voie: "chaud", sujets: ["écologie", "activisme"],
    canal_reel: "Email", via_qui: "Ancien invité", date_derniere_touche: daysAgo(4),
    jours_depuis_touche: 4, role: "Activiste", organisation: "Indépendante", archetype: "pepite",
  },
  {
    ...base, id: "c-chef", show_id: "show-gdiy", kind: "personne", nom: "Un chef étoilé local",
    stage_id: stage("show-gdiy", "identifie").id, stage_key: "identifie", stage_label: "Identifié", stage_position: 1,
    priorite: "basse", voie: "froid", sujets: ["cuisine", "artisanat"],
    canal_reel: null, via_qui: null, date_derniere_touche: null,
    jours_depuis_touche: null, role: "Chef", organisation: "Restaurant", archetype: "quick_win",
  },
  // CCG
  {
    ...base, id: "c-plombier", show_id: "show-ccg", kind: "personne", nom: "Plombier indépendant",
    stage_id: stage("show-ccg", "identifie").id, stage_key: "identifie", stage_label: "Identifié", stage_position: 1,
    priorite: "moyenne", voie: "froid", sujets: ["artisanat", "revenus"],
    canal_reel: null, via_qui: null, date_derniere_touche: null,
    jours_depuis_touche: null, role: "Plombier", organisation: "À son compte", archetype: "quick_win",
  },
  {
    ...base, id: "c-trader", show_id: "show-ccg", kind: "personne", nom: "Trader prop firm",
    stage_id: stage("show-ccg", "qualifie").id, stage_key: "qualifie", stage_label: "Qualifié", stage_position: 2,
    priorite: "haute", voie: "chaud", sujets: ["finance", "trajectoire"],
    canal_reel: "LinkedIn", via_qui: "Contact interne", date_derniere_touche: daysAgo(20),
    jours_depuis_touche: 20, role: "Trader", organisation: "Prop firm", archetype: "big_fish", nb_appuis: 1,
  },
  {
    ...base, id: "c-berger", show_id: "show-ccg", kind: "personne", nom: "Berger transhumant",
    stage_id: stage("show-ccg", "identifie").id, stage_key: "identifie", stage_label: "Identifié", stage_position: 1,
    priorite: "basse", voie: "froid", sujets: ["ruralité", "métier rare"],
    canal_reel: null, via_qui: null, date_derniere_touche: null,
    jours_depuis_touche: null, role: "Berger", organisation: "Indépendant", archetype: "pepite",
  },
  // Fleurons (entreprises)
  {
    ...base, id: "c-michelin", show_id: "show-fleurons", kind: "entreprise", nom: "Michelin",
    stage_id: stage("show-fleurons", "qualifie").id, stage_key: "qualifie", stage_label: "Qualifié (raison validée)", stage_position: 2,
    priorite: "haute", voie: "froid", sujets: ["industrie", "innovation"],
    canal_reel: null, via_qui: null, date_derniere_touche: null, jours_depuis_touche: null,
    secteur: "Pneumatique", pays: "France", envergure: "international",
    raison_de_selection: "Fleuron industriel mondial, virage hydrogène et matériaux",
    etat_recherche: "Sources publiques rassemblées, contacts presse à identifier",
    dernier_signal_type: "nomination", dernier_signal_date: daysAgo(6), dernier_signal_pertinence: 4, signal_frais: true,
  },
  {
    ...base, id: "c-patagonia", show_id: "show-fleurons", kind: "entreprise", nom: "Patagonia FR",
    stage_id: stage("show-fleurons", "recherche").id, stage_key: "recherche", stage_label: "Recherche", stage_position: 3,
    priorite: "moyenne", voie: "froid", sujets: ["mode", "engagement"],
    canal_reel: "Email", via_qui: "Contact RP", date_derniere_touche: daysAgo(8), jours_depuis_touche: 8,
    secteur: "Textile", pays: "France", envergure: "international",
    raison_de_selection: "Modèle de marque à mission, pertinence éditoriale forte",
    etat_recherche: "Entretien préliminaire fait, recherche terrain en cours",
  },
  {
    ...base, id: "c-champagne", show_id: "show-fleurons", kind: "entreprise", nom: "Une maison de champagne",
    stage_id: stage("show-fleurons", "identifie").id, stage_key: "identifie", stage_label: "Identifié", stage_position: 1,
    priorite: "basse", voie: "froid", sujets: ["terroir", "luxe"],
    canal_reel: null, via_qui: null, date_derniere_touche: null, jours_depuis_touche: null,
    secteur: "Vin", pays: "France", envergure: "fr",
    raison_de_selection: "Savoir-faire patrimonial, angle transmission",
    etat_recherche: "À lancer",
  },
];

export const demoAppuis: Appui[] = [
  { id: "a-1", cible_id: "c-tony", nom: "Un ancien invité commun", organisation: "GDIY", type: "ancien_invite", note: "Peut faire une intro chaleureuse", ally_cible_id: null },
  { id: "a-2", cible_id: "c-trader", nom: "Membre de l'équipe", organisation: "Collision", type: "contact_interne", note: "A déjà échangé en DM", ally_cible_id: null },
];

export const demoTouches: Touche[] = [
  { id: "t-1", cible_id: "c-camille", date: daysAgo(4), canal: "Email", contenu: "Premier message envoyé, pas encore de réponse.", source: "saisie" },
];

export const demoContacts: Contact[] = [
  { id: "ct-1", cible_id: "c-tony", kind: "agence", valeur: "Infinity Nine — relations presse", label: "Via l'agence", source: "Site officiel (démo)", confiance: 4, verifie: false },
  { id: "ct-2", cible_id: "c-michelin", kind: "telephone", valeur: "+33 4 73 XX XX XX", label: "Standard groupe", source: "Page contact (démo)", confiance: 3, verifie: false },
  { id: "ct-3", cible_id: "c-michelin", kind: "email", valeur: "presse@exemple-michelin.com", label: "Service de presse", source: "Espace presse (démo)", confiance: 4, verifie: false },
];

export const demoSignals: Signal[] = [
  { id: "s-1", cible_id: "c-tony", type: "mouvement_entreprise", date: daysAgo(6), source: "Presse éco", pertinence: 5, resume: "Nouvelle levée annoncée pour Infinity Nine" },
  { id: "s-2", cible_id: "c-michelin", type: "nomination", date: daysAgo(6), source: "Communiqué", pertinence: 4, resume: "Nouveau patron de la division innovation" },
];
