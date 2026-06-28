import { createMcpHandler, experimental_withMcpAuth } from "mcp-handler";
import { verifyToken } from "@/lib/mcp/oauth";
import { registerMagellanTools } from "@/lib/mcp/tools";

export const runtime = "nodejs";
// La recherche web d'enrichissement (modèle + outil web) a une latence variable
// qui dépassait parfois 60 s. Le projet est sur une team (plan payant) → budget
// relevé. 120 s laisse la marge ; le timeout interne d'enrich (110 s) renvoie
// une erreur propre avant cette limite.
export const maxDuration = 120;

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
    return {
      token: bearer,
      clientId: "claude",
      scopes: ["magellan"],
      extra: { userId: String(claims.sub ?? ""), email: String(claims.email ?? "") },
    };
  },
  { required: true }
);

export { authed as GET, authed as POST, authed as DELETE };
