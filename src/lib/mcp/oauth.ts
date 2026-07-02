// OAuth 2.1 minimal pour le connecteur MCP (jetons signés HS256 + PKCE S256).
// Secret de signature : MCP_OAUTH_SECRET, sinon SUPABASE_SERVICE_ROLE_KEY.

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

function secret(): Uint8Array {
  const s = process.env.MCP_OAUTH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return new TextEncoder().encode(s);
}

export async function signToken(
  payload: JWTPayload,
  expSeconds: number
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expSeconds}s`)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload;
  } catch {
    return null;
  }
}

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PKCE : code_challenge attendu = base64url(sha256(code_verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// S2 / décision #6 — portées (scopes) dérivées de profiles.type à l'émission du
// jeton. read < write < admin. Gating dans W() : écriture exige write, destructif
// exige admin. FAIL-OPEN : un jeton sans claim `role` (émis avant S2) obtient le
// jeu admin, pour ne verrouiller personne pendant la transition.
export type MagellanScope = "read" | "write" | "admin";

export function scopesForRole(role?: string | null): MagellanScope[] {
  switch (role) {
    case "admin":
      return ["read", "write", "admin"];
    case "interne":
      return ["read", "write"];
    case "externe":
      return ["read"];
    default:
      return ["read", "write", "admin"]; // legacy / claim absent → pas de lockout
  }
}

const CLAUDE_HOSTS = ["claude.ai", "claude.com"];

/** Redirections autorisées : Claude (web/mobile) + localhost (Claude Desktop). */
export function isAllowedRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    return u.protocol === "https:" && CLAUDE_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
