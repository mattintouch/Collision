// validate_cible idempotent (brief du 12/09, chantier 5) : relancé sur une
// cible déjà validée, l'outil réutilise l'épisode existant et ne crée que ce
// qui manque. La décision est pure et testée ; l'outil MCP l'applique.

export interface EtatValidation {
  /** Un épisode existait déjà pour la cible AVANT l'appel. */
  deja: boolean;
  /** L'épisode existant porte déjà une invitation Google Calendar. */
  invitation_existante: boolean;
  /** L'appelant fournit une date (start_iso) : il veut une invitation. */
  avec_date: boolean;
}

export interface DecisionValidation {
  /** Appeler la RPC validate_cible (création de l'épisode + étape finale). */
  creer_episode: boolean;
  /** Créer l'invitation Calendar (et la réservation studio). */
  creer_invitation: boolean;
  /** Mettre la génération de fiche en file (première validation seulement). */
  lancer_generation: boolean;
  /** Ce que l'appelant doit savoir, en une ligne. */
  note?: string;
}

export function decisionValidation(e: EtatValidation): DecisionValidation {
  if (!e.deja) {
    return { creer_episode: true, creer_invitation: e.avec_date, lancer_generation: true };
  }
  if (e.avec_date && e.invitation_existante) {
    return {
      creer_episode: false,
      creer_invitation: false,
      lancer_generation: false,
      note: "Cible déjà validée : épisode et invitation déjà en place, rien de recréé. Pour déplacer l'enregistrement, utiliser update_episode.",
    };
  }
  if (e.avec_date) {
    return {
      creer_episode: false,
      creer_invitation: true,
      lancer_generation: false,
      note: "Cible déjà validée : épisode réutilisé, seule l'invitation manquante est créée.",
    };
  }
  return {
    creer_episode: false,
    creer_invitation: false,
    lancer_generation: false,
    note: "Cible déjà validée : épisode réutilisé, rien de recréé.",
  };
}
