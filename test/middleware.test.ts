import { describe, it, expect } from "vitest";
import { isPublicPath } from "../src/lib/supabase/middleware";

// Régression du 20/07 : le cron Vercel (sans cookie de session) recevait une
// 307 vers /login au lieu d'exécuter /api/cron/recap. Les routes machine
// portent leur propre authentification (CRON_SECRET, jeton MCP) : elles
// doivent passer le middleware, et les routes humaines rester protégées.

describe("middleware — routes publiques", () => {
  it("laisse passer les routes machine (auth dans le handler)", () => {
    expect(isPublicPath("/api/cron/recap")).toBe(true);
    expect(isPublicPath("/api/cron/enrich")).toBe(true);
    expect(isPublicPath("/api/backlog/afaire")).toBe(true);
    expect(isPublicPath("/api/loop/mcp")).toBe(true);
    expect(isPublicPath("/api/mcp")).toBe(true);
    expect(isPublicPath("/api/oauth/token")).toBe(true);
  });

  it("laisse passer le parcours de connexion", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
  });

  it("protège les routes humaines (redirection /login sans session)", () => {
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/fiches")).toBe(false);
    expect(isPublicPath("/fiches/yael-braun-pivet")).toBe(false);
    expect(isPublicPath("/gdiy/board")).toBe(false);
    expect(isPublicPath("/api/fiches/yael-braun-pivet/stop")).toBe(false);
    expect(isPublicPath("/api/copilot")).toBe(false);
    expect(isPublicPath("/settings")).toBe(false);
  });
});
