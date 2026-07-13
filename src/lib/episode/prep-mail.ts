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

/**
 * Mail à l'invité (FR ou EN). NE contient PAS la fiche de prep (interne à
 * l'équipe). Recentré sur l'esprit éditorial et les 3 questions récurrentes,
 * pour que l'invité arrive préparé. Le tutoiement porte la proximité maison.
 */
export function buildInviteMail(i: PrepMailInput, lang: MailLang = "fr"): { subject: string; html: string } {
  const prenom = i.invite_nom.split(/\s+/)[0];
  if (lang === "en") {
    const subject = `Your episode on ${i.show_nom}`;
    const html = shell([
      `<p>Hi ${esc(prenom)},</p>`,
      `<p>Thanks for joining ${esc(i.show_nom)}. A few practical details, then what to expect.</p>`,
      logistique(i, "en"),
      `<p>What drives us: understanding the <b>how</b>. We want to go beyond what has already been told and really grasp how you did things. The conversation is direct and informal.</p>`,
      `<p>Three questions come up every episode, so you can think about them beforehand:</p>`,
      `<ul><li>introduce yourself in a few words;</li><li>a book you would recommend;</li><li>the advice you would give your younger self.</li></ul>`,
      `<p>The team's contact details are attached (vCard). Reach out anytime.</p>`,
      `<p>See you soon,<br>${esc(SIGN_EN)}</p>`,
    ].join(""));
    return { subject, html };
  }
  const subject = `Ton passage sur ${i.show_nom}`;
  const html = shell([
    `<p>Bonjour ${esc(prenom)},</p>`,
    `<p>Merci d'avoir accepté l'enregistrement sur ${esc(i.show_nom)}. Quelques infos pratiques, puis l'esprit de l'échange.</p>`,
    logistique(i, "fr"),
    `<p>Ce qui nous anime : comprendre le <b>comment</b>. On cherche à aller plus loin que ce qui a déjà été raconté, à saisir vraiment ta manière de faire. L'échange est direct, et on se tutoie pour la proximité avec l'auditeur.</p>`,
    `<p>Trois questions reviennent à chaque épisode, tu peux déjà y penser :</p>`,
    `<ul><li>te présenter en quelques mots ;</li><li>une recommandation de livre ;</li><li>le conseil que tu te donnerais à toi plus jeune.</li></ul>`,
    `<p>Les coordonnées de l'équipe sont en pièce jointe (carte de visite). N'hésite pas pour toute question.</p>`,
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
