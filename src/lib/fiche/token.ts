// S10 — lien signé de la fiche. On réutilise la signature HS256 du connecteur MCP
// (même secret), avec un type dédié `fiche` lié à l'id d'épisode. Le lien est
// long (1 an) ; « Régénérer » émet un nouveau jeton.

import { signToken, verifyToken } from "../mcp/oauth";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function signFicheToken(episodeId: string): Promise<string> {
  return signToken({ typ: "fiche", eid: episodeId }, ONE_YEAR);
}

/** Vérifie un jeton de fiche et confirme qu'il vise bien cet épisode. */
export async function verifyFicheToken(token: string, episodeId: string): Promise<boolean> {
  const claims = (await verifyToken(token)) as { typ?: string; eid?: string } | null;
  return !!claims && claims.typ === "fiche" && claims.eid === episodeId;
}

/** URL absolue de la fiche, si une base publique est configurée. */
export function ficheUrl(episodeId: string, token: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const path = `/fiche/${episodeId}?t=${token}`;
  return base ? `${base}${path}` : path;
}
