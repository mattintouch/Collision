// Intégration Google Calendar pour le copilote (§8 : branché sur Google Calendar).
//
// Deux modes, comme le reste de l'app :
//  - Avec un token d'accès Google (provider_token de la session Supabase, scope
//    calendar.readonly) : interroge l'API freeBusy et calcule les créneaux libres.
//  - Sans token (mode démo) : génère des créneaux fictifs en heures ouvrées,
//    pour un aperçu complet hors-ligne.

import { SignJWT, importPKCS8 } from "jose";

const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const GTOKEN_URL = "https://oauth2.googleapis.com/token";
let calCache: { token: string; exp: number } | null = null;

/**
 * Jeton Calendar via le COMPTE DE SERVICE (délégation domaine), en impersonant
 * un organisateur fixe (GOOGLE_CALENDAR_ORGANIZER, défaut GOOGLE_IMPERSONATE_EMAIL —
 * idéalement contact@gdiy.fr). Bénéfices : zéro token qui expire, et l'invitation
 * part de la boîte du show, pas du compte de qui clique. Renvoie null si non
 * configuré OU si le scope calendar n'est pas (encore) délégué → on retombe alors
 * sur le provider_token utilisateur (aucune régression avant l'octroi du scope).
 */
async function calendarServiceToken(): Promise<string | null> {
  // Flag de délégation (décision #7) : tant que Matt n'a pas fait la délégation
  // Workspace, on ne tente même pas le compte de service → repli provider_token,
  // zéro régression. Bascule GOOGLE_DELEGATION_READY=true après la délégation.
  if (process.env.GOOGLE_DELEGATION_READY !== "true") return null;
  const key = process.env.GOOGLE_SA_KEY ?? "";
  // Organisateur impersoné : EPISODE_SENDER (canonique, ex. matt@collision.studio),
  // avec repli sur les anciennes variables.
  const subject = process.env.EPISODE_SENDER ?? process.env.GOOGLE_CALENDAR_ORGANIZER ?? process.env.GOOGLE_IMPERSONATE_EMAIL ?? "";
  if (key.length < 20 || !subject) return null;
  const now = Math.floor(Date.now() / 1000);
  if (calCache && calCache.exp - 60 > now) return calCache.token;
  try {
    const sa = JSON.parse(key) as { client_email: string; private_key: string };
    const pk = await importPKCS8(sa.private_key, "RS256");
    const assertion = await new SignJWT({ scope: CAL_SCOPE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(sa.client_email)
      .setSubject(subject)
      .setAudience(GTOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(pk);
    const res = await fetch(GTOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!res.ok) return null; // scope non délégué → repli provider_token
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    calCache = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
    return j.access_token;
  } catch {
    return null;
  }
}

/** Meilleur porteur : compte de service (durable) sinon provider_token utilisateur. */
async function calendarBearer(providerToken?: string | null): Promise<string | null> {
  return (await calendarServiceToken()) ?? providerToken ?? null;
}

export interface FreeSlot {
  start: string; // ISO
  end: string; // ISO
  label: string; // ex: "mar. 24 juin, 14:30–15:30"
}

const TZ = "Europe/Paris";
const WORK_START = 9; // 9h
const WORK_END = 18; // 18h
const SLOT_MIN_MINUTES = 45;

function frLabel(start: Date, end: Date): string {
  const day = start.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: TZ,
  });
  const t = (d: Date) =>
    d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: TZ,
    });
  return `${day}, ${t(start)}–${t(end)}`;
}

/** Bornes [9h, 18h[ d'un jour donné (heure locale Paris approximée en UTC+ décalage). */
function workWindow(day: Date): { start: Date; end: Date } {
  const start = new Date(day);
  start.setHours(WORK_START, 0, 0, 0);
  const end = new Date(day);
  end.setHours(WORK_END, 0, 0, 0);
  return { start, end };
}

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/** Créneaux fictifs (mode démo) : 2 fenêtres par jour ouvré sur ~5 jours. */
function demoSlots(days = 5): FreeSlot[] {
  const out: FreeSlot[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  let added = 0;
  while (added < days) {
    cursor.setDate(cursor.getDate() + 1);
    if (!isWeekday(cursor)) continue;
    for (const [h, m] of [
      [10, 0],
      [14, 30],
    ] as const) {
      const start = new Date(cursor);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + 60 * 60000);
      out.push({ start: start.toISOString(), end: end.toISOString(), label: frLabel(start, end) });
    }
    added++;
  }
  return out;
}

interface BusyInterval {
  start: string;
  end: string;
}

/** Soustrait les plages occupées des fenêtres ouvrées pour produire des créneaux libres. */
function freeFromBusy(busy: BusyInterval[], days = 7): FreeSlot[] {
  const intervals = busy
    .map((b) => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const out: FreeSlot[] = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (let d = 0; d < days; d++) {
    cursor.setDate(cursor.getDate() + 1);
    if (!isWeekday(cursor)) continue;
    const { start: ws, end: we } = workWindow(cursor);

    // Plages occupées qui chevauchent la fenêtre ouvrée du jour.
    const dayBusy = intervals.filter((i) => i.end > ws && i.start < we);

    let pointer = new Date(Math.max(ws.getTime(), Date.now()));
    for (const b of dayBusy) {
      if (b.start > pointer) {
        pushIfLongEnough(out, pointer, b.start);
      }
      if (b.end > pointer) pointer = new Date(b.end);
    }
    if (pointer < we) pushIfLongEnough(out, pointer, we);
  }
  return out;
}

function pushIfLongEnough(out: FreeSlot[], start: Date, end: Date) {
  if (end.getTime() - start.getTime() >= SLOT_MIN_MINUTES * 60000) {
    out.push({ start: start.toISOString(), end: end.toISOString(), label: frLabel(start, end) });
  }
}

export interface FreeSlotsResult {
  slots: FreeSlot[];
  demo: boolean;
}

export interface CreateEventInput {
  summary: string;
  startISO: string;
  endISO: string;
  location?: string;
  attendees?: string[]; // emails
  description?: string;
  sendInvites?: boolean;
}

export interface CreateEventResult {
  ok: boolean;
  detail: string;
  htmlLink?: string;
  eventId?: string;
}

/** Crée un événement (l'invitation d'enregistrement) dans Google Calendar. */
export async function createCalendarEvent(
  providerToken: string | null | undefined,
  input: CreateEventInput
): Promise<CreateEventResult> {
  const token = await calendarBearer(providerToken);
  if (!token)
    return { ok: false, detail: "Pas de connexion Google (ni compte de service, ni token utilisateur)." };
  try {
    const send = input.sendInvites === false ? "none" : "all";
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=${send}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: input.summary,
          location: input.location,
          description: input.description,
          start: { dateTime: input.startISO, timeZone: TZ },
          end: { dateTime: input.endISO, timeZone: TZ },
          attendees: (input.attendees ?? []).map((email) => ({ email })),
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, detail: `Échec création événement (${res.status}). ${body.slice(0, 150)}` };
    }
    const data = (await res.json()) as { htmlLink?: string; id?: string };
    return { ok: true, detail: "Invitation créée dans Google Calendar.", htmlLink: data.htmlLink, eventId: data.id };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Erreur calendrier" };
  }
}

/** Supprime un événement (annulation). notify=true prévient les invités. */
export async function deleteCalendarEvent(
  providerToken: string | null | undefined,
  eventId: string,
  notify = true
): Promise<{ ok: boolean; detail: string }> {
  const token = await calendarBearer(providerToken);
  if (!token) return { ok: false, detail: "Pas de connexion Google active." };
  try {
    const send = notify ? "all" : "none";
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=${send}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    // 410/404 : déjà supprimé côté Google — on considère que c'est fait.
    if (res.ok || res.status === 410 || res.status === 404) return { ok: true, detail: "Événement supprimé." };
    const body = await res.text().catch(() => "");
    return { ok: false, detail: `Échec suppression (${res.status}). ${body.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Erreur calendrier" };
  }
}

/** Déplace un événement (report) : nouveaux start/end. */
export async function updateCalendarEventTimes(
  providerToken: string | null | undefined,
  eventId: string,
  startISO: string,
  endISO: string,
  notify = true
): Promise<{ ok: boolean; detail: string }> {
  const token = await calendarBearer(providerToken);
  if (!token) return { ok: false, detail: "Pas de connexion Google active." };
  try {
    const send = notify ? "all" : "none";
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=${send}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          start: { dateTime: startISO, timeZone: TZ },
          end: { dateTime: endISO, timeZone: TZ },
        }),
      }
    );
    if (res.ok) return { ok: true, detail: "Événement déplacé." };
    const body = await res.text().catch(() => "");
    return { ok: false, detail: `Échec mise à jour (${res.status}). ${body.slice(0, 120)}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Erreur calendrier" };
  }
}

export async function getFreeSlots(
  providerToken?: string | null
): Promise<FreeSlotsResult> {
  if (!providerToken) return { slots: demoSlots(), demo: true };

  try {
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 7 * 86400000).toISOString();

    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${providerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: TZ,
        items: [{ id: "primary" }],
      }),
    });

    if (!res.ok) return { slots: demoSlots(), demo: true };
    const data = (await res.json()) as {
      calendars?: { primary?: { busy?: BusyInterval[] } };
    };
    const busy = data.calendars?.primary?.busy ?? [];
    return { slots: freeFromBusy(busy).slice(0, 12), demo: false };
  } catch {
    // En cas d'échec (token expiré, scope manquant), on retombe sur la démo.
    return { slots: demoSlots(), demo: true };
  }
}
