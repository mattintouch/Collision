import { createMcpHandler, experimental_withMcpAuth } from "mcp-handler";
import { verifyToken } from "@/lib/mcp/oauth";
import { registerMagellanTools } from "@/lib/mcp/tools";

export const runtime = "nodejs";
// Le client MCP coupe un appel d'outil à ~60 s : inutile de monter au-delà.
// Les outils lents (enrich) doivent tenir sous 60 s end-to-end ; leur timeout
// interne renvoie une erreur propre avant la coupure client.
export const maxDuration = 60;

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
