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

/** Concatène plusieurs cartes en un seul fichier .vcf. */
export function buildVcf(people: VcfPerson[]): string {
  return people.filter((p) => p.nom?.trim()).map(buildVcard).join("\r\n") + "\r\n";
}
