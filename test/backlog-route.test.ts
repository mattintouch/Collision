import { describe, it, expect, afterEach } from "vitest";
import { GET, POST } from "../src/app/api/backlog/afaire/route";

const URL_ = "https://magellan.collision.studio/api/backlog/afaire";
const ANCIEN = process.env.CRON_SECRET;

afterEach(() => {
  if (ANCIEN === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ANCIEN;
});

describe("endpoint Routine hebdo /api/backlog/afaire (auth)", () => {
  it("refuse en 503 quand CRON_SECRET n'est pas configuré (pas de repli ouvert)", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(new Request(URL_))).status).toBe(503);
    expect((await POST(new Request(URL_, { method: "POST", body: "{}" }))).status).toBe(503);
  });

  it("refuse en 401 sans le bon Bearer", async () => {
    process.env.CRON_SECRET = "s3cret-test";
    expect((await GET(new Request(URL_))).status).toBe(401);
    const mauvais = new Request(URL_, { headers: { authorization: "Bearer autre" } });
    expect((await GET(mauvais)).status).toBe(401);
  });

  it("POST valide le contrat id + pr_url GitHub avant toute écriture", async () => {
    process.env.CRON_SECRET = "s3cret-test";
    const req = new Request(URL_, {
      method: "POST",
      headers: { authorization: "Bearer s3cret-test" },
      body: JSON.stringify({ id: "x", pr_url: "https://exemple.com/pas-github" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
