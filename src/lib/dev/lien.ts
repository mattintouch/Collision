// Chantier « lancement dev en un clic » (21/09), livrable A : le lien signé.
//
// L'email du lundi est lu sur mobile, hors session applicative : le lien de
// lancement porte donc son autorisation dans l'URL, sous forme d'un jeton HMAC
// (HS256) signé avec un secret DÉDIÉ, DEV_LINK_SECRET. Le secret du connecteur
// MCP n'est jamais réutilisé ici : un lien d'email qui fuite ne doit pas ouvrir
// la surface MCP. Sans DEV_LINK_SECRET configuré, aucun lien n'est émis (le
// récap retombe sur la page /backlog) plutôt que de signer avec un secret
// d'emprunt.
//
// Portée d'un jeton : UN item, pendant 30 jours. Il n'autorise que la lecture
// de cet item et l'affichage de son prompt. Aucune écriture ne passe par là.

import { SignJWT, jwtVerify } from "jose";

const TRENTE_JOURS = 60 * 60 * 24 * 30;

function secretBrut(): string {
  return process.env.DEV_LINK_SECRET ?? "";
}

/** Le lien de lancement n'existe que si le secret dédié est configuré. */
export function hasDevLinkSecret(): boolean {
  return secretBrut().length >= 16;
}

function cle(): Uint8Array {
  return new TextEncoder().encode(secretBrut());
}

/** Jeton de lancement d'un item (30 jours). Lance si le secret manque :
 *  l'appelant teste hasDevLinkSecret() avant, le récap le fait. */
export async function signDevToken(itemId: string): Promise<string> {
  if (!hasDevLinkSecret()) throw new Error("DEV_LINK_SECRET absent : aucun lien de lancement ne peut être signé.");
  return new SignJWT({ typ: "dev", iid: itemId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TRENTE_JOURS}s`)
    .sign(cle());
}

/** Vérifie un jeton et confirme qu'il vise bien cet item. Expiration et
 *  signature sont contrôlées par jose ; le type et l'item le sont ici. */
export async function verifyDevToken(token: string | null | undefined, itemId: string): Promise<boolean> {
  if (!token || !hasDevLinkSecret()) return false;
  try {
    const { payload } = await jwtVerify(token, cle());
    return payload.typ === "dev" && payload.iid === itemId;
  } catch {
    return false;
  }
}

/** Base absolue des liens (même ordre que les liens de fiche : domaine de
 *  production stable, jamais VERCEL_URL qui pourrit à chaque déploiement). */
export function baseUrlDev(): string {
  const raw =
    process.env.PUBLIC_BASE_URL ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://magellan.collision.studio");
  return raw.replace(/\/+$/, "");
}

/** URL de lancement d'un item, à poser dans l'email. */
export function devUrl(itemId: string, token: string): string {
  return `${baseUrlDev()}/dev/${itemId}?t=${encodeURIComponent(token)}`;
}

/** Raccourci : signe et compose, ou null si le secret manque. */
export async function lienLancement(itemId: string): Promise<string | null> {
  if (!hasDevLinkSecret()) return null;
  try {
    return devUrl(itemId, await signDevToken(itemId));
  } catch {
    return null;
  }
}

/* ───────────────────────── cible du lancement ───────────────────────── */

const CLAUDE_CODE = "https://claude.ai/code";

/** Seuil de bascule. Le lien web accepte le prompt en query string
 *  (paramètres `prompt` et `repositories`, documentés), mais une URL trop
 *  longue casse selon le client de messagerie. Au-delà, la route sert une page
 *  intermédiaire portant le prompt complet, copiable en un geste : le prompt
 *  n'est JAMAIS tronqué pour entrer dans l'URL. */
export const LONGUEUR_URL_MAX = 7000;

/** URL Claude Code avec prompt et dépôt pré-remplis (PURE, testée). Le prompt
 *  est pré-rempli, jamais envoyé : la relecture humaine reste obligatoire
 *  (décision du 01/09). */
export function urlClaudeCode(prompt: string, depot: string): string {
  const q = new URLSearchParams({ prompt, repositories: depot });
  return `${CLAUDE_CODE}?${q.toString()}`;
}

/** URL Claude Code sans prompt (dépôt seul), pour la page intermédiaire :
 *  la personne colle le prompt qu'elle vient de copier. */
export function urlClaudeCodeSansPrompt(depot: string): string {
  return `${CLAUDE_CODE}?${new URLSearchParams({ repositories: depot }).toString()}`;
}

/** Décide de la cible du lancement (PURE, testée) : redirection directe quand
 *  l'URL tient, page intermédiaire sinon. */
export function cibleLancement(prompt: string, depot: string): { mode: "redirection"; url: string } | { mode: "page"; url: string } {
  const url = urlClaudeCode(prompt, depot);
  if (url.length <= LONGUEUR_URL_MAX) return { mode: "redirection", url };
  return { mode: "page", url: urlClaudeCodeSansPrompt(depot) };
}
