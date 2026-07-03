// S10 — envoi d'email via le compte de service (scope gmail.send), en imperson-
// nant la boîte du show (EPISODE_SENDER, repli GOOGLE_IMPERSONATE_EMAIL). Gated
// par GOOGLE_DELEGATION_READY : sinon on n'essaie pas (erreur structurée claire).

import { SignJWT, importPKCS8 } from "jose";
import { parseGoogleError } from "./google/errors";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GTOKEN_URL = "https://oauth2.googleapis.com/token";

let cache: { token: string; exp: number } | null = null;

function sender(): string {
  return process.env.EPISODE_SENDER ?? process.env.GOOGLE_IMPERSONATE_EMAIL ?? "";
}

export function hasGmailSend(): boolean {
  return process.env.GOOGLE_DELEGATION_READY === "true" && (process.env.GOOGLE_SA_KEY ?? "").length > 20 && !!sender();
}

async function gmailToken(): Promise<string | null> {
  if (!hasGmailSend()) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cache && cache.exp - 60 > now) return cache.token;
  try {
    const sa = JSON.parse(process.env.GOOGLE_SA_KEY as string) as { client_email: string; private_key: string };
    const pk = await importPKCS8(sa.private_key, "RS256");
    const assertion = await new SignJWT({ scope: GMAIL_SCOPE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(sa.client_email)
      .setSubject(sender())
      .setAudience(GTOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(pk);
    const res = await fetch(GTOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    cache = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
    return j.access_token;
  } catch {
    return null;
  }
}

/** A1 — sonde légère : users.getProfile sur la boîte impersonée. Coût nul,
 *  détecte à la fois l'API désactivée et un scope manquant. */
export async function checkGmail(): Promise<{ status: "ok" | "degraded" | "down"; detail: string }> {
  if (process.env.GOOGLE_DELEGATION_READY !== "true") return { status: "degraded", detail: "GOOGLE_DELEGATION_READY absent : envoi désactivé (repli)." };
  const token = await gmailToken();
  if (!token) return { status: "down", detail: "Jeton compte de service Gmail indisponible (clé/scope/EPISODE_SENDER)." };
  try {
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) return { status: "ok", detail: `Gmail OK (expéditeur ${sender()}).` };
    const g = parseGoogleError(res.status, await res.text().catch(() => ""), "Gmail");
    return { status: "down", detail: `${g.message} — ${g.action}` };
  } catch (e) {
    return { status: "down", detail: e instanceof Error ? e.message : "Erreur Gmail" };
  }
}

export interface MailAttachment {
  filename: string;
  mimeType: string;
  content: string; // texte brut (sera encodé base64)
}

export interface SendMailInput {
  to: string[];
  subject: string;
  html: string;
  attachments?: MailAttachment[];
}

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}
function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Construit le message MIME (multipart/mixed si pièces jointes). */
function buildMime(from: string, i: SendMailInput): string {
  const boundary = "mgln_boundary_0000";
  const subject = `=?UTF-8?B?${b64(i.subject)}?=`;
  const headers = [
    `From: ${from}`,
    `To: ${i.to.join(", ")}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
  ];
  if (!i.attachments?.length) {
    headers.push('Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(i.html));
    return headers.join("\r\n");
  }
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`, "");
  const parts = [
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64(i.html),
  ];
  for (const att of i.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      "",
      b64(att.content)
    );
  }
  parts.push(`--${boundary}--`);
  return headers.join("\r\n") + parts.join("\r\n");
}

export async function sendGmail(i: SendMailInput): Promise<{ ok: boolean; detail: string; cause?: string }> {
  const to = i.to.map((e) => e.trim()).filter((e) => e.includes("@"));
  if (!to.length) return { ok: false, detail: "Aucun destinataire valide." };
  const token = await gmailToken();
  if (!token) {
    return { ok: false, detail: "Gmail (compte de service) indisponible : vérifier GOOGLE_DELEGATION_READY, le scope gmail.send et EPISODE_SENDER." };
  }
  try {
    const raw = b64url(buildMime(sender(), { ...i, to }));
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const g = parseGoogleError(res.status, body, "Gmail");
      // Message COMPLET (A2) : cause + action, jamais tronqué.
      return { ok: false, detail: `${g.message} — ${g.action}`, cause: g.cause };
    }
    return { ok: true, detail: `Mail envoyé à ${to.length} destinataire(s).` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Erreur Gmail" };
  }
}
