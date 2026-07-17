import { createMcpHandler, experimental_withMcpAuth } from "mcp-handler";
import { verifyToken, scopesForRole } from "@/lib/mcp/oauth";
import { registerMagellanTools } from "@/lib/mcp/tools";

export const runtime = "nodejs";
// Le client MCP coupe un appel d'outil à ~60 s, mais la FONCTION doit vivre
// plus longtemps : le drainage de la file (kickQueue, waitUntil) continue
// APRÈS la réponse, et les jobs de génération de fiche durent 1 à 3 minutes.
// maxDuration 300 : plafond Hobby avec Fluid compute. C'est ce plafond qui
// tuait le groupe « angles » à 60 s (jobs requalifiés timeout > 10 min).
export const maxDuration = 300;

const handler = createMcpHandler(
  (server) => {
    registerMagellanTools(server);
  },
  {},
  { basePath: "/api" }
);

// Vérifie le jeton d'accès OAuth (JWT) sur chaque requête MCP.
const authed = experimental_withMcpAuth(
  handler,
  async (_req, bearer) => {
    if (!bearer) return undefined;
    const claims = (await verifyToken(bearer)) as Record<string, unknown> | null;
    if (!claims || claims.typ !== "access") return undefined;
    // Scopes dérivés du rôle (profiles.type) posé dans le jeton. Jeton legacy
    // sans `role` → scopesForRole renvoie le jeu admin (fail-open, pas de lockout).
    return {
      token: bearer,
      clientId: "claude",
      scopes: scopesForRole(claims.role as string | undefined),
      extra: { userId: String(claims.sub ?? ""), email: String(claims.email ?? ""), role: (claims.role as string) ?? null },
    };
  },
  { required: true }
);

export { authed as GET, authed as POST, authed as DELETE };
