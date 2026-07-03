// S9 — génération de cartes de visite vCard 3.0. Chaque participant d'un
// enregistrement (invité, staff, Matt, Clémence) reçoit les coordonnées des
// autres. Sortie texte, jointe au mail de prep (S10) ; Google Calendar
// n'acceptant pas de PJ arbitraire, le VCF ne passe pas par l'événement.

export interface VcfPerson {
  nom: string;
  emails?: string[];
  phones?: string[];
  organisation?: string | null;
  role?: string | null;
}

/** Échappe les caractères spéciaux vCard (RFC 6350 : \ , ; et retours ligne). */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Une carte vCard 3.0 pour une personne. */
export function buildVcard(p: VcfPerson): string {
  const parts = p.nom.trim().split(/\s+/);
  const last = parts.length > 1 ? parts.slice(1).join(" ") : parts[0] ?? "";
  const first = parts.length > 1 ? parts[0] : "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${esc(last)};${esc(first)};;;`,
    `FN:${esc(p.nom.trim())}`,
  ];
  if (p.organisation) lines.push(`ORG:${esc(p.organisation)}`);
  if (p.role) lines.push(`TITLE:${esc(p.role)}`);
  for (const e of p.emails ?? []) if (e?.trim()) lines.push(`EMAIL;TYPE=INTERNET:${esc(e.trim())}`);
  for (const tel of p.phones ?? []) if (tel?.trim()) lines.push(`TEL;TYPE=CELL:${esc(tel.trim())}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

/** Une carte est utile si elle a un nom ET au moins un moyen de contact (B4).
 *  Une carte sans email ni téléphone (ex. dérivée d'un local-part d'email) est
 *  indigente et exclue. */
export function isUsefulCard(p: VcfPerson): boolean {
  const hasContact = (p.emails?.some((e) => e?.trim()) ?? false) || (p.phones?.some((t) => t?.trim()) ?? false);
  return !!p.nom?.trim() && hasContact;
}

/** Concatène les cartes utiles en un seul fichier .vcf. */
export function buildVcf(people: VcfPerson[]): string {
  const cards = people.filter(isUsefulCard).map(buildVcard);
  return cards.length ? cards.join("\r\n") + "\r\n" : "";
}
