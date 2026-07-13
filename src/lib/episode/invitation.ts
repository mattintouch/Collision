// S9 — corps d'invitation d'enregistrement, complet et réutilisable. Texte
// logistique validé par Matt (13/07/2026), enregistré comme défaut pour tous
// les prochains épisodes : durée 3 h, accès Studio 71 (rez-de-chaussée,
// frapper), contacts jour J (Clémence, Matéo). FR + EN (invités anglophones).
// La fiche de prep est réservée à l'équipe : lien marqué « accès team GDIY ».

export const DEFAULT_LIEU = "Studio 71, 71 rue de Saussure, 75017 Paris";

/** Durée par défaut d'un enregistrement (minutes). */
export const DEFAULT_DUREE_MIN = 180;

/** Contacts jour J par défaut (demande Matt, « pour les prochains »). */
export const DEFAULT_CONTACTS_JOUR_J = [
  "Clémence Lepic +33673575832",
  "Matéo Dos Santos : +33788264299",
];

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

/** Corps textuel complet de l'invitation d'enregistrement (texte Matt 13/07). */
export function buildEventDescription(i: InvitationBodyInput, lang: "fr" | "en" = "fr"): string {
  const dureeH = Math.round(((i.duree_min ?? DEFAULT_DUREE_MIN) / 60) * 10) / 10;
  const lieu = i.lieu ?? DEFAULT_LIEU;
  const studio = lieu === DEFAULT_LIEU;
  const contacts = i.contact_jour_j?.trim()
    ? [i.contact_jour_j.trim()]
    : DEFAULT_CONTACTS_JOUR_J;

  if (lang === "en") {
    const lignes = [
      `${i.show_nom} recording with ${i.invite_nom}.`,
      ``,
      `Duration: about ${dureeH} h (allow time for setup before and a debrief after).`,
      `Location: ${lieu}.`,
    ];
    if (studio) lignes.push(`Studio 71 access: ground floor, knock on the door.`);
    lignes.push(`Day-of contacts:`, ...contacts);
    if (i.fiche_url) lignes.push(``, `Prep sheet (GDIY team access only): ${i.fiche_url}`);
    return lignes.join("\n");
  }

  const lignes = [
    `Enregistrement ${i.show_nom} avec ${i.invite_nom}.`,
    ``,
    `Durée : environ ${dureeH} h (prévoir installation avant et débrief après).`,
    `Lieu : ${lieu}.`,
  ];
  if (studio) lignes.push(`Accès Studio 71 : Au rez de chaussée, frapper à la porte.`);
  lignes.push(`Contact jour J :`, ...contacts);
  if (i.fiche_url) lignes.push(``, `Fiche prépa (accès team GDIY uniquement) : ${i.fiche_url}`);
  return lignes.join("\n");
}
