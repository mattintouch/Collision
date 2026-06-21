// Types du domaine Magellan (miroir du schéma Supabase §4).

export type PipeType = "invites" | "thematique";
export type CibleKind = "personne" | "entreprise";
export type Voie = "froid" | "chaud";
export type Priorite = "haute" | "moyenne" | "basse";
export type Archetype = "big_fish" | "quick_win" | "pepite";
export type Envergure = "fr" | "international";
export type AppuiType =
  | "ancien_invite"
  | "conseiller"
  | "entourage"
  | "contact_interne";
export type ToucheSource = "saisie" | "capture";
export type SignalType =
  | "levee"
  | "livre"
  | "nomination"
  | "prix"
  | "passage_media"
  | "mouvement_entreprise";
export type ContactKind =
  | "email"
  | "telephone"
  | "reseau"
  | "agence"
  | "site"
  | "autre";
export type UserType = "admin" | "interne" | "externe";
export type ShowRole = "admin" | "interne" | "externe";

export interface Show {
  id: string;
  slug: string;
  nom: string;
  type_pipe: PipeType;
  couleur: string | null;
}

export interface Stage {
  id: string;
  show_id: string;
  key: string;
  label: string;
  position: number;
  is_final: boolean;
}

export interface Cible {
  id: string;
  show_id: string;
  kind: CibleKind;
  nom: string;
  stage_id: string | null;
  priorite: Priorite;
  voie: Voie;
  sujets: string[];
  canal_reel: string | null;
  via_qui: string | null;
  date_derniere_touche: string | null;

  // personne
  role: string | null;
  organisation: string | null;
  archetype: Archetype | null;

  // entreprise
  secteur: string | null;
  pays: string | null;
  envergure: Envergure | null;
  raison_de_selection: string | null;
  etat_recherche: string | null;

  created_at: string;
  updated_at: string;
}

/** Cible enrichie par la vue `cibles_enrichies` (signaux de résurgence). */
export interface CibleEnrichie extends Cible {
  stage_key: string | null;
  stage_label: string | null;
  stage_position: number | null;
  jours_depuis_touche: number | null;
  dernier_signal_type: SignalType | null;
  dernier_signal_date: string | null;
  dernier_signal_pertinence: number | null;
  signal_frais: boolean;
  nb_appuis: number;
}

export interface Appui {
  id: string;
  cible_id: string;
  nom: string;
  organisation: string | null;
  type: AppuiType;
  note: string | null;
}

export interface Touche {
  id: string;
  cible_id: string;
  date: string;
  canal: string | null;
  contenu: string | null;
  source: ToucheSource;
}

export interface Signal {
  id: string;
  cible_id: string;
  type: SignalType;
  date: string;
  source: string | null;
  pertinence: number;
  resume: string | null;
}

export interface Contact {
  id: string;
  cible_id: string;
  kind: ContactKind;
  valeur: string;
  label: string | null;
  source: string | null;
  confiance: number;
  verifie: boolean;
}

export interface Episode {
  id: string;
  cible_id: string;
  show_id: string;
  nom: string;
  date_enregistrement: string | null;
  statut_prod: string;
  contexte: Record<string, unknown>;
}
