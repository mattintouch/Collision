// Endpoint MCP RESTREINT pour le client de boucle Vadim (contrat VADIM-CONTRAT.md,
// Option B). Il n'enregistre QUE les outils de LOOP_TOOLS, réduits le 04/08 aux
// six utiles : find_cible et get_dossier en lecture, add_appui,
// add_appui_contact, log_touche et feedback en écriture additive. Les outils
// destructifs, admin, de parcours de masse et update_cible sont PHYSIQUEMENT
// absents de cet endpoint, frontière dure pour un client machine.
// Même auth OAuth que l'endpoint principal.
import { createMcpHandler, experimental_withMcpAuth } from "mcp-handler";
import { verifyToken } from "@/lib/mcp/oauth";
import { registerMagellanTools, LOOP_TOOLS } from "@/lib/mcp/tools";

export const runtime = "nodejs";
// 300 : la fonction survit à la réponse pour drainer la file (Fluid compute).
export const maxDuration = 300;

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
    // Vadim écrit les 4 outils autorisés (tous additifs) : scope write.
    // L'endpoint n'enregistre de toute façon aucun outil destructif (LOOP_TOOLS).
    return {
      token: bearer,
      clientId: "vadim",
      scopes: ["read", "write"],
      extra: { userId: String(claims.sub ?? ""), email: String(claims.email ?? ""), role: (claims.role as string) ?? null },
    };
  },
  { required: true }
);

export { authed as GET, authed as POST, authed as DELETE };
