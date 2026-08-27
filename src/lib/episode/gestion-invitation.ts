// Cycle de vie des invitations d'enregistrement (backlog 62b38c35, 25/08) :
// la logique PURE des outils update_invitation et delete_invitation.
// Tout ce qui se teste sans réseau vit ici : interprétation des dates en
// Europe/Paris (contrainte 5), fusion des participants avec RSVP préservés
// (contrainte 3), fenêtre de réservation studio -1h/+1h et détection de
// conflit (contrainte 6).

export const TZ_PARIS = "Europe/Paris";

/** Préfixe des réservations studio posées par validate_cible : c'est la
 *  signature qui distingue une réservation d'un simple rendez-vous dans
 *  l'agenda de l'organisateur. */
export const STUDIO_RESA_PREFIXE = "Studio 71 réservé";

/** Marge studio de validate_cible : une heure avant, une heure après. */
export const MARGE_STUDIO_MIN = 60;

const OFFSET_EXPLICITE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

/** Décalage Paris/UTC (ms) à un instant UTC donné, DST compris (Intl). */
function offsetParisMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ_PARIS, timeZoneName: "longOffset" }).formatToParts(new Date(utcMs));
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT(?:([+-])(\d{2}):(\d{2}))?/.exec(tz);
  if (!m || !m[1]) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
}

/**
 * Interprète une date ISO en Europe/Paris (contrainte 5) et renvoie l'instant
 * UTC. Une chaîne AVEC décalage explicite (Z ou ±hh:mm) est respectée telle
 * quelle ; une chaîne NUE (« 2026-10-22T10:00 ») est lue comme heure murale
 * de Paris, jamais comme heure du serveur.
 */
export function parisVersUtcIso(iso: string): string {
  const s = iso.trim();
  if (OFFSET_EXPLICITE.test(s)) return new Date(s).toISOString();
  const nue = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? `${s}:00` : s;
  const commeUtc = Date.parse(`${nue}Z`);
  if (isNaN(commeUtc)) return new Date(NaN).toISOString();
  // Double itération : stabilise le décalage autour d'un changement d'heure.
  let off = offsetParisMs(commeUtc);
  off = offsetParisMs(commeUtc - off);
  return new Date(commeUtc - off).toISOString();
}

/** Heure murale Paris (« 2026-10-22T10:00:00 ») d'un instant UTC : le format
 *  envoyé à Google en dateTime, TOUJOURS accompagné de timeZone Europe/Paris. */
export function heureMuraleParis(utcIso: string): string {
  const d = new Date(utcIso);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ_PARIS,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(d).replace(" ", "T");
}

/** Durée en minutes entre deux instants ISO. */
export function dureeMinutes(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
}

/** Fenêtre de réservation studio pour un créneau : -1h avant, +1h après. */
export function fenetreStudio(startUtcIso: string, dureeMin: number): { startISO: string; endISO: string } {
  const start = new Date(startUtcIso).getTime();
  return {
    startISO: new Date(start - MARGE_STUDIO_MIN * 60_000).toISOString(),
    endISO: new Date(start + (dureeMin + MARGE_STUDIO_MIN) * 60_000).toISOString(),
  };
}

export function chevauchent(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(bStart).getTime() < new Date(aEnd).getTime();
}

export interface EvenementLeger {
  id?: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

/** Réservations studio en conflit avec une fenêtre (contrainte 6) : mêmes
 *  réservations « Studio 71 réservé » uniquement (l'agenda de l'organisateur
 *  porte aussi ses rendez-vous ordinaires, qui ne bloquent pas le studio),
 *  hors événements annulés et hors événements de l'épisode lui-même. */
export function conflitsStudio(
  evenements: EvenementLeger[],
  fenetre: { startISO: string; endISO: string },
  exclure: (string | null | undefined)[]
): EvenementLeger[] {
  const ex = new Set(exclure.filter(Boolean) as string[]);
  return evenements.filter((ev) =>
    ev.status !== "cancelled" &&
    !!ev.id && !ex.has(ev.id) &&
    (ev.summary ?? "").startsWith(STUDIO_RESA_PREFIXE) &&
    !!ev.start?.dateTime && !!ev.end?.dateTime &&
    chevauchent(fenetre.startISO, fenetre.endISO, ev.start.dateTime, ev.end.dateTime)
  );
}

export interface ParticipantCalendar {
  email: string;
  responseStatus?: string;
  optional?: boolean;
  organizer?: boolean;
  self?: boolean;
  resource?: boolean;
  displayName?: string;
}

/**
 * Fusion des participants (contrainte 3) : events.patch écrase la liste
 * attendees quand elle est passée entière, donc chaque participant CONSERVÉ
 * est réinjecté avec son objet d'origine, responseStatus compris. Un invité
 * qui avait accepté ne repasse jamais en sans réponse. Les retraits sont
 * appliqués avant les ajouts, les emails sont normalisés et dédupliqués.
 */
export function fusionneParticipants(
  existants: ParticipantCalendar[],
  ajouter: string[] = [],
  retirer: string[] = []
): { attendees: ParticipantCalendar[]; ajoutes: string[]; retires: string[] } {
  const norm = (e: string) => e.trim().toLowerCase();
  const aRetirer = new Set(retirer.map(norm).filter((e) => e.includes("@")));
  const gardes = existants.filter((p) => !aRetirer.has(norm(p.email)));
  const retires = existants.filter((p) => aRetirer.has(norm(p.email))).map((p) => norm(p.email));
  const presents = new Set(gardes.map((p) => norm(p.email)));
  const ajoutes: string[] = [];
  for (const brut of ajouter) {
    const e = norm(brut);
    if (!e.includes("@") || presents.has(e)) continue;
    presents.add(e);
    ajoutes.push(e);
  }
  return { attendees: [...gardes, ...ajoutes.map((email) => ({ email }))], ajoutes, retires };
}
