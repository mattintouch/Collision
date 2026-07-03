// S9 — corps d'invitation d'enregistrement, complet et réutilisable. Accès
// Studio 71, parking, durée, contact jour J, et lien de la fiche de prep si elle
// existe. Participants systématiques : staff (env) + invité + éventuels ajouts.

export const DEFAULT_LIEU = "Studio 71, 71 rue de Saussure, 75017 Paris";

/** Emails staff systématiquement invités (Matt, Clémence, équipe), via env. */
export function staffEmails(): string[] {
  return (process.env.EPISODE_STAFF_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim())
    .filter((e) => e.includes("@"));
}

/** Fusionne staff + invité + ajouts, dédupliqué, emails valides seulement.
 *  `staffOverride` : liste staff par show (config DB) ; sinon repli sur l'env. */
export function participants(inviteEmails: string[] = [], extra: string[] = [], staffOverride?: string[]): string[] {
  const base = staffOverride ?? staffEmails();
  const all = [...base, ...inviteEmails, ...extra].map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
  return Array.from(new Set(all));
}

export interface InvitationBodyInput {
  show_nom: string;
  invite_nom: string;
  duree_min?: number;
  lieu?: string;
  contact_jour_j?: string | null;
  fiche_url?: string | null;
}

/** Corps textuel complet de l'invitation d'enregistrement. */
export function buildEventDescription(i: InvitationBodyInput): string {
  const dureeH = Math.round(((i.duree_min ?? 120) / 60) * 10) / 10;
  const studio = (i.lieu ?? DEFAULT_LIEU) === DEFAULT_LIEU;
  const lignes = [
    `Enregistrement ${i.show_nom} avec ${i.invite_nom}.`,
    ``,
    `Durée : environ ${dureeH} h (prévoir installation avant et débrief après).`,
    `Lieu : ${i.lieu ?? DEFAULT_LIEU}.`,
  ];
  if (studio) {
    lignes.push(
      `Accès Studio 71 : 71 rue de Saussure, 75017 Paris. Interphone au nom du studio.`,
      `Parking : stationnement payant en voirie ; parking public Batignolles à proximité.`
    );
  }
  lignes.push(`Contact jour J : ${i.contact_jour_j?.trim() || "à préciser"}.`);
  if (i.fiche_url) lignes.push(``, `Fiche de préparation : ${i.fiche_url}`);
  return lignes.join("\n");
}
