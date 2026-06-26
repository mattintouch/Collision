// Gabarit d'invitation GDIY (objet + corps FR/EN), équipe par défaut, et date
// d'enregistrement par défaut (mardi/jeudi matin 9h30). Le corps reste éditable
// dans la modale de validation ; ces valeurs ne sont que des pré-remplissages.

export const STUDIO_71 = "Studio 71, 71 rue de Saussure, 75017 Paris";

// Destinataires fixes de l'équipe gdiy. À terme éditables via les réglages
// (cf. page d'admin Magellan) ; pour l'instant pré-remplis et modifiables à
// chaque validation dans la modale.
export const GDIY_TEAM_EMAILS = [
  "mateo@collision.studio",
  "clemence@stefani.fr",
  "axel@collision.studio",
  "clement@collision.studio",
  "manon@collision.studio",
];

export type InviteLang = "fr" | "en";

export function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}

export function invitationSubject(nom: string): string {
  return `GDIY x ${nom} - Enregistrement`;
}

export function invitationBody(nom: string, lang: InviteLang): string {
  const prenom = firstName(nom) || nom;
  if (lang === "en") {
    return `Hello ${prenom},

Thank you for agreeing to take part in GDIY.

Our goal is to get to know you and learn as much as possible about your zone of genius.

Please plan for 2 to 3 hours at Studio 71 — nothing to prepare, except:
- how you would introduce yourself
- which book you would give to all of humanity if you had the chance (no self-promotion :)
- what you would say to your younger self if you had the chance to meet them

For any question, the Génération Do It Yourself team is at your disposal: contact@gdiy.fr, as well as our AI assistant vadim@stefani.fr.

No editing tricks, no traps — Matthieu and the whole team can't wait to welcome you.

Could you also confirm your contact details (last name, first name, email, mobile phone) in reply to this email, so we can finalize the organization?

See you soon,
Team GDIY`;
  }
  return `Bonjour ${prenom},

Merci de bien vouloir participer à GDIY.

Notre objectif est de pouvoir vous découvrir, et d'apprendre un maximum de choses sur votre zone de génie.

Prévoir 2 à 3 heures au Studio 71, rien à préparer, si ce n'est :
- comment vous présenter vous même
- quel livre offririez vous à l'ensemble de l'humanité si vous en aviez l'opportunité (pas d'auto promo :)
- que diriez vous à votre jeune « moi » si vous aviez l'opportunité de le rencontrer ?

Pour toute question, l'équipe de Génération Do It Yourself se tient à votre disposition : contact@gdiy.fr , ainsi que notre assistant IA vadim@stefani.fr .

Pas de montage, pas de piège, Matthieu et toute l'équipe sont impatient de vous recevoir.

Pour finaliser l'organisation, pourriez-vous nous confirmer vos coordonnées (nom, prénom, email, téléphone mobile) en réponse à cet email ?

À très bientôt,
Team GDIY`;
}

/**
 * Prochaine date d'enregistrement par défaut : le prochain mardi ou jeudi,
 * à 9h30. Renvoie { date: "YYYY-MM-DD", heure: "HH:MM" }.
 */
export function defaultRecordingDate(from: Date = new Date()): { date: string; heure: string } {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  // On part de demain pour ne pas proposer aujourd'hui.
  for (let i = 1; i <= 14; i++) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay(); // 2 = mardi, 4 = jeudi
    if (day === 2 || day === 4) break;
  }
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { date: ymd, heure: "09:30" };
}
