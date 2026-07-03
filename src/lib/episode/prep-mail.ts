// S10 — gabarits des mails de préparation. Deux tons : invité (chaleureux,
// sobre) et staff (interne, opérationnel). Style maison : phrases nettes, pas
// d'emoji, pas de tiret cadratin. Le contenu interpolé est échappé (HTML).

export interface PrepMailInput {
  invite_nom: string;
  show_nom: string;
  date_label?: string | null;
  lieu?: string | null;
  fiche_url?: string | null;
  contact_jour_j?: string | null;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function shell(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="fr"><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1D1E;line-height:1.55;max-width:560px;margin:0 auto;padding:8px 4px">${body}<p style="color:#8a8d88;font-size:12px;margin-top:28px">Collision Productions</p></body></html>`;
}

function ficheBlock(url?: string | null): string {
  if (!url) return "";
  return `<p>La fiche de préparation est ici : <a href="${esc(url)}" style="color:#1B3FBF">${esc(url)}</a></p>`;
}
function logistique(i: PrepMailInput): string {
  const lignes = [
    i.date_label ? `<li>Date : <b>${esc(i.date_label)}</b></li>` : "",
    i.lieu ? `<li>Lieu : ${esc(i.lieu)}</li>` : "",
    i.contact_jour_j ? `<li>Contact jour J : ${esc(i.contact_jour_j)}</li>` : "",
  ].filter(Boolean).join("");
  return lignes ? `<ul>${lignes}</ul>` : "";
}

/** Mail à l'invité. */
export function buildInviteMail(i: PrepMailInput): { subject: string; html: string } {
  const prenom = i.invite_nom.split(/\s+/)[0];
  const subject = `Préparation de votre passage sur ${i.show_nom}`;
  const html = shell(subject, [
    `<p>Bonjour ${esc(prenom)},</p>`,
    `<p>Merci d'avoir accepté l'enregistrement sur ${esc(i.show_nom)}. Voici les informations pratiques.</p>`,
    logistique(i),
    ficheBlock(i.fiche_url),
    `<p>Les coordonnées de l'équipe sont en pièce jointe (carte de visite). N'hésitez pas à revenir vers nous pour toute question.</p>`,
    `<p>À très vite,<br>L'équipe ${esc(i.show_nom)}</p>`,
  ].join(""));
  return { subject, html };
}

/** Mail au staff (interne). */
export function buildStaffMail(i: PrepMailInput): { subject: string; html: string } {
  const subject = `Prep enregistrement — ${i.invite_nom} (${i.show_nom})`;
  const html = shell(subject, [
    `<p>Enregistrement à préparer avec <b>${esc(i.invite_nom)}</b>.</p>`,
    logistique(i),
    ficheBlock(i.fiche_url),
    `<p>Coordonnées des participants en pièce jointe. Relire la fiche avant le jour J et remonter les manques.</p>`,
  ].join(""));
  return { subject, html };
}
