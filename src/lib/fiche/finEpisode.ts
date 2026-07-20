// Lot B1 (session Yaël Braun-Pivet, 20/07) — flux de fin d'enregistrement.
//
// Au Stop confirmé : compilation du carnet de la session (moments clés, clips,
// notes, régie), chaque entrée avec timecode relatif et auteur, et envoi d'UN
// email « Notes épisode {invité} » via l'identité Gmail déléguée existante
// (aucun second circuit d'envoi). Destinataires par CONFIGURATION uniquement :
//   NOTES_EPISODE_EMAILS : équipe de production (destinataires)
//   NOTES_EPISODE_CC     : copie (Matthieu)
// Sans configuration, rien ne part : le carnet reste intégralement consultable
// sur la fiche (B2) et l'UI propose un renvoi une fois la config posée.
// Idempotence : email_envoye_at sur la session ; un double Stop ne renvoie
// pas ; le renvoi est une action explicite.

import { sendGmail, hasGmailSend } from "../gmail";
import { labelFromEmail, textOf, type ConsoleEvent, type RecSession } from "./console";
import type { FicheRow } from "./store";
import type { createServiceClient } from "../supabase/service";

type SB = ReturnType<typeof createServiceClient>;

export type EnvoiNotes = "envoye" | "non_configure" | "echec";

function liste(env: string | undefined): string[] {
  return (env ?? "").split(/[,\s]+/).map((e) => e.trim()).filter((e) => e.includes("@"));
}

/** Destinataires du mail de notes. Vides = flux inactif (adresses à confirmer
 *  par Matthieu avant activation, cf. brief « données à fournir »). */
export function notesRecipients(): { to: string[]; cc: string[] } {
  return { to: liste(process.env.NOTES_EPISODE_EMAILS), cc: liste(process.env.NOTES_EPISODE_CC) };
}

/** Événements appartenant à la session (rattachés par session_id). */
export function eventsOfSession(events: ConsoleEvent[], session: Pick<RecSession, "id">): ConsoleEvent[] {
  return events.filter((e) => e.session_id === session.id);
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Corps du mail : texte structuré simple, lisible sur mobile. */
export function buildNotesEmail(
  fiche: Pick<FicheRow, "invite_nom" | "slug">,
  session: RecSession,
  events: ConsoleEvent[]
): { subject: string; html: string } {
  const subject = `Notes épisode ${fiche.invite_nom}`;
  const duree = session.ended_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 60_000)
    : null;
  const ligne = (e: ConsoleEvent) =>
    `<li style="margin:5px 0"><b>${esc(e.timecode ?? "après rec")}</b> · ${esc(textOf(e))} · ${esc(labelFromEmail(e.author_email))}</li>`;
  const bloc = (titre: string, items: ConsoleEvent[]) =>
    items.length ? `<h2 style="font-size:15px;margin:20px 0 4px 0">${titre}</h2><ul style="padding-left:16px;margin:0">${items.map(ligne).join("")}</ul>` : "";

  const clips = events.filter((e) => e.kind === "clip");
  const notes = events.filter((e) => e.kind === "note");
  const regie = events.filter((e) => e.kind === "chat");

  const html = [
    `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1D1E;line-height:1.55;max-width:560px;margin:0 auto;padding:8px 4px">`,
    `<p><b>${esc(fiche.invite_nom)}</b> · enregistrement clos${duree !== null ? ` · ${duree} min` : ""}. Timecodes relatifs au début d'enregistrement.</p>`,
    bloc(`Moments clés et clips (${clips.length})`, clips),
    bloc(`Notes (${notes.length})`, notes),
    bloc(`Régie (${regie.length})`, regie),
    clips.length + notes.length + regie.length === 0 ? `<p>Aucune saisie pendant cette session.</p>` : "",
    `<p style="margin-top:20px"><a href="https://magellan.collision.studio/fiches/${esc(fiche.slug)}#carnet">Ouvrir le carnet sur la fiche</a></p>`,
    `<p style="color:#8a8d88;font-size:12px;margin-top:24px">Notes automatiques Magellan. Collision Productions.</p>`,
    `</body></html>`,
  ].join("");
  return { subject, html };
}

/**
 * Envoie les notes d'une session close et marque email_envoye_at. `resend`
 * force un renvoi explicite (l'idempotence bloque seulement les envois
 * implicites répétés). Ne lève jamais : le Stop reste acquis quoi qu'il arrive.
 */
export async function envoyerNotesEpisode(
  sb: SB,
  fiche: Pick<FicheRow, "id" | "invite_nom" | "slug">,
  session: RecSession,
  opts: { resend?: boolean } = {}
): Promise<{ statut: EnvoiNotes; detail?: string }> {
  try {
    if (!session.ended_at) return { statut: "echec", detail: "Session encore ouverte." };
    if (session.email_envoye_at && !opts.resend) return { statut: "envoye", detail: "Déjà envoyé (renvoi explicite possible)." };
    const { to, cc } = notesRecipients();
    if (!to.length) return { statut: "non_configure", detail: "NOTES_EPISODE_EMAILS absent : adresses à confirmer avant activation." };
    if (!hasGmailSend()) return { statut: "echec", detail: "Envoi Gmail indisponible (délégation)." };

    const { data: evs } = await sb
      .from("fiche_console_events")
      .select("id, session_id, created_at, author_email, kind, timecode, payload")
      .eq("fiche_id", fiche.id)
      .eq("session_id", session.id)
      .order("created_at")
      .limit(2000);
    const { subject, html } = buildNotesEmail(fiche, session, (evs ?? []) as ConsoleEvent[]);
    const r = await sendGmail({ to, cc, subject, html });
    if (!r.ok) return { statut: "echec", detail: r.detail };
    await sb.from("fiche_rec_sessions").update({ email_envoye_at: new Date().toISOString() }).eq("id", session.id);
    return { statut: "envoye" };
  } catch (e) {
    return { statut: "echec", detail: e instanceof Error ? e.message : String(e) };
  }
}
