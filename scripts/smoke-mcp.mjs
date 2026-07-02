#!/usr/bin/env node
// Smoke test MCP en HTTP direct — indépendant du client claude.ai (dont le
// transport tombe). Vérifie que l'endpoint répond et que le CONTRAT de clés de
// la projection compacte `list_cibles` (dont dépend Vadim) est respecté.
//
// Usage : MCP_URL=... MCP_TOKEN=... [MCP_SHOW=gdiy] node scripts/smoke-mcp.mjs
//   MCP_URL   : ex. https://magellan.collision.studio/api/mcp
//   MCP_TOKEN : Bearer d'accès (OAuth) — jamais commité, passé en env/secret.

const URL = process.env.MCP_URL ?? "https://magellan.collision.studio/api/mcp";
const TOKEN = process.env.MCP_TOKEN;
const SHOW = process.env.MCP_SHOW ?? "gdiy";

// Clés que la boucle Vadim et le tri du board exigent (contrat serveur).
const CONTRACT_KEYS = [
  "id", "nom", "voie", "jours_depuis_touche", "stage_key",
  "nb_relais_actionnables", "signal_frais", "score", "badges",
];

let idc = 0;
const nextId = () => ++idc;

async function rpc(method, params) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId(), method, params }),
  });
  const ctype = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${raw.slice(0, 300)}`);
  // mcp-handler peut répondre en SSE : on extrait la ligne `data:`.
  const jsonText = ctype.includes("text/event-stream")
    ? (raw.split("\n").find((l) => l.startsWith("data:")) ?? "").slice(5).trim()
    : raw;
  return JSON.parse(jsonText);
}

function toolResultJson(rpcResp) {
  const txt = rpcResp?.result?.content?.[0]?.text;
  return txt ? JSON.parse(txt) : rpcResp?.result;
}

async function main() {
  if (!TOKEN) {
    console.error("⚠️  MCP_TOKEN absent — smoke test sauté (fournir le secret en CI).");
    process.exit(0); // ne casse pas la CI tant que le secret n'est pas posé
  }
  const fails = [];

  // 1) initialize
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke-mcp", version: "1" } });

  // 2) tools/list répond
  const list = await rpc("tools/list", {});
  const tools = (list?.result?.tools ?? []).map((t) => t.name);
  if (!tools.includes("list_cibles")) fails.push("list_cibles absent de tools/list");

  // 3) list_cibles renvoie les clés du contrat
  const lc = await rpc("tools/call", { name: "list_cibles", arguments: { show: SHOW, limit: 3 } });
  const rows = toolResultJson(lc);
  if (!Array.isArray(rows) || rows.length === 0) {
    fails.push(`list_cibles(show="${SHOW}") n'a rien renvoyé (slug cassé ?)`);
  } else {
    const missing = CONTRACT_KEYS.filter((k) => !(k in rows[0]));
    if (missing.length) fails.push(`clés de contrat manquantes : ${missing.join(", ")}`);
  }

  if (fails.length) {
    console.error("❌ SMOKE MCP ÉCHOUÉ :\n - " + fails.join("\n - "));
    process.exit(1);
  }
  console.log(`✅ SMOKE MCP OK — ${tools.length} outils ; contrat list_cibles respecté (${SHOW}).`);
}

main().catch((e) => {
  console.error("❌ SMOKE MCP — erreur :", e.message);
  process.exit(1);
});
