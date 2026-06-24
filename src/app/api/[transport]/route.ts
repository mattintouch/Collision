import { createMcpHandler, experimental_withMcpAuth } from "mcp-handler";
import { verifyToken } from "@/lib/mcp/oauth";
import { registerMagellanTools } from "@/lib/mcp/tools";

export const runtime = "nodejs";
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
