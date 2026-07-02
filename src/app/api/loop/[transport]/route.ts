// Endpoint MCP RESTREINT pour le client de boucle Vadim (contrat VADIM-CONTRAT.md,
// Option B). Il n'enregistre QUE les outils de la boucle (LOOP_TOOLS) : lectures
// + log_touche + update_cible + add_appui. Les outils destructifs/admin sont
// PHYSIQUEMENT absents de cet endpoint — frontière dure pour un client machine.
// Même auth OAuth que l'endpoint principal.
import { createMcpHandler, experimental_withMcpAuth } from "mcp-handler";
import { verifyToken } from "@/lib/mcp/oauth";
import { registerMagellanTools, LOOP_TOOLS } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerMagellanTools(server, { allow: LOOP_TOOLS });
  },
  {},
  { basePath: "/api/loop" }
);

const authed = experimental_withMcpAuth(
  handler,
  async (_req, bearer) => {
    if (!bearer) return undefined;
    const claims = (await verifyToken(bearer)) as Record<string, unknown> | null;
    if (!claims || claims.typ !== "access") return undefined;
    return {
      token: bearer,
      clientId: "vadim",
      scopes: ["magellan:loop"],
      extra: { userId: String(claims.sub ?? ""), email: String(claims.email ?? "") },
    };
  },
  { required: true }
);

export { authed as GET, authed as POST, authed as DELETE };
