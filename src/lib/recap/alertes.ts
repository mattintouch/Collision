// Chantier 2 — alertes push par email (identité Vadim). Personne ne recharge
// une page pour vérifier : un échec définitif de génération ou l'ouverture du
// disjoncteur API déclenchent un email immédiat. Best-effort : une alerte qui
// échoue ne bloque jamais le traitement des jobs.

import { sendGmail, hasGmailSend } from "../gmail";
import { recapRecipients } from "./hebdo";
import { sanitizeError } from "../ai/sante";
import type { createServiceClient } from "../supabase/service";

type SB = ReturnType<typeof createServiceClient>;

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shell(body: string): string {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1B1D1E;line-height:1.55;max-width:560px;margin:0 auto;padding:8px 4px">${body}<p style="color:#8a8d88;font-size:12px;margin-top:24px">Alerte automatique Magellan. Collision Productions.</p></body></html>`;
}

async function envoyer(sb: SB, subject: string, html: string): Promise<void> {
  try {
    if (!hasGmailSend()) return;
    const to = (process.env.ALERT_EMAILS ?? "").split(/[,\s]+/).filter((e) => e.includes("@"));
    const dest = to.length ? to : await recapRecipients(sb);
    if (!dest.length) return;
    await sendGmail({ to: dest, subject, html });
  } catch {
    /* best-effort */
  }
}

/** Échec DÉFINITIF d'un groupe de génération (après retries) : alerte immédiate. */
export async function alerteEchecGeneration(
  sb: SB,
  info: { fiche_slug?: string | null; cible_nom?: string | null; groupe: string; erreur: string }
): Promise<void> {
  const qui = info.cible_nom ?? info.fiche_slug ?? "cible inconnue";
  const subject = `Magellan, génération en échec : ${qui} (${info.groupe})`;
  const html = shell([
    `<p>Le groupe <b>${esc(info.groupe)}</b> de la fiche <b>${esc(qui)}</b> a échoué après ses tentatives.</p>`,
    `<p style="font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#F6F4EF;padding:10px 12px">${esc(sanitizeError(info.erreur))}</p>`,
    info.fiche_slug ? `<p>La fiche est marquée incomplète : <a href="https://magellan.collision.studio/fiches/${esc(info.fiche_slug)}">ouvrir la fiche</a>.</p>` : "",
    `<p>Relancer : dans Claude, « regénère le groupe ${esc(info.groupe)} de la fiche ${esc(qui)} ».</p>`,
  ].join(""));
  await envoyer(sb, subject, html);
}

/** Ouverture du disjoncteur API : une seule alerte au moment de l'ouverture. */
export async function alerteDisjoncteur(sb: SB, info: { cause: string; jusqu_a: string }): Promise<void> {
  const heure = new Date(info.jusqu_a).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const subject = "Magellan, API Anthropic indisponible : générations en pause";
  const html = shell([
    `<p>L'API Anthropic échoue de façon répétée. Le disjoncteur est ouvert : les générations et enrichissements sont en pause jusqu'à <b>${esc(heure)}</b> (les jobs restent en file, aucun token n'est consommé).</p>`,
    `<p style="font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#F6F4EF;padding:10px 12px">${esc(sanitizeError(info.cause))}</p>`,
    `<p>Si la cause est un crédit épuisé : console.anthropic.com, Plans &amp; Billing. Le circuit se referme seul au premier succès après la pause.</p>`,
  ].join(""));
  await envoyer(sb, subject, html);
}
