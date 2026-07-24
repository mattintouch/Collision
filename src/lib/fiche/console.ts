// Lot A (session Yaël Braun-Pivet, 20/07) — console de fiche partagée.
//
// La console est ÉVÉNEMENTIELLE : chaque saisie (clip, note, message régie,
// coche de checklist, question posée) est une ligne fiche_console_events,
// écrite avec l'identité du compte connecté (résolue côté serveur, migration
// 0041). L'état affiché (checklist, questions posées) se RÉDUIT depuis le flux
// d'événements : le dernier événement gagne. Fonctions pures, testables à sec.

export type ConsoleKind = "clip" | "note" | "chat" | "check" | "question" | "lu";

export interface ConsoleEvent {
  id: string;
  session_id: string | null;
  created_at: string;
  author_email: string;
  kind: ConsoleKind;
  timecode: string | null; // relatif au début du REC ; null = hors enregistrement
  payload: Record<string, unknown>;
}

export interface RecSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  started_by: string;
  ended_by: string | null;
  email_envoye_at?: string | null;
}

/** Libellé d'un opérateur depuis son email : la partie avant l'arobase, en
 *  capitales. Aucun prénom en dur nulle part (principe non négociable). */
export function labelFromEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  if (!e) return "ÉQUIPE";
  return (e.split("@")[0] || "ÉQUIPE").toUpperCase();
}

/** État de la checklist réduit du flux (dernier événement par index gagne). */
export function reduceChecked(events: ConsoleEvent[]): Record<number, boolean> {
  const out: Record<number, boolean> = {};
  for (const e of events) {
    if (e.kind !== "check") continue;
    const index = e.payload.index;
    if (typeof index === "number") out[index] = e.payload.checked === true;
  }
  return out;
}

/** Questions posées, réduites du flux : num → timecode de pose (ou ""). */
export function reduceAsked(events: ConsoleEvent[]): { asked: Record<string, boolean>; askedAt: Record<string, string> } {
  const asked: Record<string, boolean> = {};
  const askedAt: Record<string, string> = {};
  for (const e of events) {
    if (e.kind !== "question") continue;
    const num = e.payload.num;
    if (typeof num !== "string") continue;
    const on = e.payload.asked === true;
    asked[num] = on;
    askedAt[num] = on ? (e.timecode ?? "") : "";
  }
  return { asked, askedAt };
}

/** Entrées du carnet (clips et notes), dans l'ordre chronologique. */
export function carnetOf(events: ConsoleEvent[]): ConsoleEvent[] {
  return events.filter((e) => e.kind === "clip" || e.kind === "note");
}

/** Messages régie, dans l'ordre chronologique. */
export function chatOf(events: ConsoleEvent[]): ConsoleEvent[] {
  return events.filter((e) => e.kind === "chat");
}

/** Texte d'un événement carnet/régie. */
export function textOf(e: ConsoleEvent): string {
  return typeof e.payload.text === "string" ? e.payload.text : "";
}

/** Timecode relatif (hh:mm:ss ou mm:ss) depuis le début d'une session. */
export function timecodeAt(session: Pick<RecSession, "started_at">, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - new Date(session.started_at).getTime()) / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${p(h)}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** Étiquette temporelle affichée pour un événement : timecode pendant le REC,
 *  APRÈS REC une fois la session close (A2.3), heure murale sinon. */
export function timeLabel(e: ConsoleEvent, sessions: RecSession[]): string {
  if (e.timecode) return e.timecode;
  const t = new Date(e.created_at).getTime();
  const apres = sessions.some((s) => s.ended_at && t >= new Date(s.ended_at).getTime());
  if (apres) return "APRÈS REC";
  return new Date(e.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
}

/** Fusionne un événement entrant (realtime ou polling) sans doublon. */
export function mergeEvent(list: ConsoleEvent[], e: ConsoleEvent): ConsoleEvent[] {
  if (list.some((x) => x.id === e.id)) return list;
  return [...list, e].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Tâche 8 (handoff 24/07) — dernier-lu PAR OPÉRATEUR : borne ISO du dernier
 *  message de régie lu par ce compte (événements kind='lu', payload jusqu_a).
 *  Chaîne vide = jamais rien lu. */
export function dernierLu(events: ConsoleEvent[], email: string): string {
  let borne = "";
  for (const e of events) {
    if (e.kind !== "lu" || e.author_email !== email) continue;
    const jusquA = typeof e.payload.jusqu_a === "string" ? e.payload.jusqu_a : "";
    if (jusquA > borne) borne = jusquA;
  }
  return borne;
}

/** Messages de régie NON LUS par cet opérateur : écrits par un autre compte
 *  après sa borne de lecture. Alimente le clignotement et la ligne de
 *  flottaison. */
export function chatNonLus(events: ConsoleEvent[], email: string): ConsoleEvent[] {
  const borne = dernierLu(events, email);
  return chatOf(events).filter((e) => e.author_email !== email && e.created_at > borne);
}
