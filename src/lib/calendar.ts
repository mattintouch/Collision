// Intégration Google Calendar pour le copilote (§8 : branché sur Google Calendar).
//
// Deux modes, comme le reste de l'app :
//  - Avec un token d'accès Google (provider_token de la session Supabase, scope
//    calendar.readonly) : interroge l'API freeBusy et calcule les créneaux libres.
//  - Sans token (mode démo) : génère des créneaux fictifs en heures ouvrées,
//    pour un aperçu complet hors-ligne.

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
