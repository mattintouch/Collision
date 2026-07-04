// S10 — gabarits des mails de préparation. Deux tons : invité (chaleureux,
// sobre) et staff (interne, opérationnel). Signés « Vadim, assistant IA de
// l'équipe Collision ». Version anglaise pour les invités anglophones (`lang`).
// Style maison : phrases nettes, pas d'emoji, pas de tiret cadratin. Contenu
// interpolé échappé (HTML).

export type MailLang = "fr" | "en";

export interface PrepMailInput {
  invite_nom: string;
  show_nom: string;
  date_label?: string | null;
  lieu?: string | null;
  fiche_url?: string | null;
  contact_jour_j?: string | null;
}

const SIGN_FR = "Vadim, assistant IA de l'équipe Collision";
const SIGN_EN = "Vadim, AI assistant to the Collision team";

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shell(body: string): string {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1D1E;line-height:1.55;max-width:560px;margin:0 auto;padding:8px 4px">${body}<p style="color:#8a8d88;font-size:12px;margin-top:28px">Collision Productions</p></body></html>`;
}

function ficheBlock(url: string | null | undefined, lang: MailLang): string {
  if (!url) return "";
  const label = lang === "en" ? "The preparation sheet is here" : "La fiche de préparation est ici";
  return `<p>${label} : <a href="${esc(url)}" style="color:#1B3FBF">${esc(url)}</a></p>`;
}

/** Lien Google Maps construit depuis l'adresse (F2). Pas d'adresse en dur :
 *  fonctionne pour tout lieu passé à validate_cible. */
function mapsUrl(lieu: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lieu)}`;
}

function logistique(i: PrepMailInput, lang: MailLang): string {
  const L = lang === "en"
    ? { date: "Date", lieu: "Location", contact: "Day-of contact" }
    : { date: "Date", lieu: "Lieu", contact: "Contact jour J" };
  const lieuHtml = i.lieu
    ? `<a href="${esc(mapsUrl(i.lieu))}" style="color:#1B3FBF">${esc(i.lieu)}</a>`
    : "";
  const lignes = [
    i.date_label ? `<li>${L.date} : <b>${esc(i.date_label)}</b></li>` : "",
    i.lieu ? `<li>${L.lieu} : ${lieuHtml}</li>` : "",
    i.contact_jour_j ? `<li>${L.contact} : ${esc(i.contact_jour_j)}</li>` : "",
  ].filter(Boolean).join("");
  return lignes ? `<ul>${lignes}</ul>` : "";
}

/** Mail à l'invité (FR ou EN selon la langue de l'invité). */
export function buildInviteMail(i: PrepMailInput, lang: MailLang = "fr"): { subject: string; html: string } {
  const prenom = i.invite_nom.split(/\s+/)[0];
  if (lang === "en") {
    const subject = `Preparing your episode on ${i.show_nom}`;
    const html = shell([
      `<p>Hi ${esc(prenom)},</p>`,
      `<p>Thank you for joining us on ${esc(i.show_nom)}. Here are the practical details.</p>`,
      logistique(i, "en"),
      ficheBlock(i.fiche_url, "en"),
      `<p>The team's contact details are attached (vCard). Feel free to reach out with any question.</p>`,
      `<p>See you soon,<br>${esc(SIGN_EN)}</p>`,
    ].join(""));
    return { subject, html };
  }
  const subject = `Préparation de votre passage sur ${i.show_nom}`;
  const html = shell([
    `<p>Bonjour ${esc(prenom)},</p>`,
    `<p>Merci d'avoir accepté l'enregistrement sur ${esc(i.show_nom)}. Voici les informations pratiques.</p>`,
    logistique(i, "fr"),
    ficheBlock(i.fiche_url, "fr"),
    `<p>Les coordonnées de l'équipe sont en pièce jointe (carte de visite). N'hésitez pas à revenir vers nous pour toute question.</p>`,
    `<p>À très vite,<br>${esc(SIGN_FR)}</p>`,
  ].join(""));
  return { subject, html };
}

/** Mail au staff (interne, toujours en français). */
export function buildStaffMail(i: PrepMailInput): { subject: string; html: string } {
  const subject = `Prep enregistrement — ${i.invite_nom} (${i.show_nom})`;
  const html = shell([
    `<p>Enregistrement à préparer avec <b>${esc(i.invite_nom)}</b>.</p>`,
    logistique(i, "fr"),
    ficheBlock(i.fiche_url, "fr"),
    `<p>Coordonnées des participants en pièce jointe. Relire la fiche avant le jour J et remonter les manques.</p>`,
    `<p>${esc(SIGN_FR)}</p>`,
  ].join(""));
  return { subject, html };
}
