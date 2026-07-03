// Outils exposés au connecteur MCP (lecture + écriture), via le client service.
// Mêmes capacités que le copilote intégré, pour l'app Claude.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CibleEnrichie } from "../types";
import { createServiceClient } from "../supabase/service";
import { folkAddAlly, folkAddEmail, folkAddPhone, folkLogTouche } from "../folk/write";
import { hasFolkKey, fetchFolkGroups } from "../folk/client";
import { checkGmail } from "../gmail";
import { resolveContact, normName, type ResolvedContact } from "../contacts/resolve";
import { hasGoogleSync } from "../google/contacts";
import { syncShowContacts } from "../google/sync";
import { hasAnthropicKey } from "../copilot/config";
import { computeCibleScore, computeResurgence, estivalActif, type ScoreInput } from "../domain";
import { computeShowStats } from "../stats";
import { kindAwarePatch } from "./kind";
import { kickQueue } from "../enrichment/jobs";
import { buildFicheData } from "../fiche/build";
import { generateFicheHtml } from "../fiche/generate";
import { signFicheToken, ficheUrl } from "../fiche/token";
import { createCalendarEvent, injectFicheLink, checkCalendar } from "../calendar";
import { buildEventDescription, participants, staffEmails, DEFAULT_LIEU } from "../episode/invitation";
import { buildInviteMail, buildStaffMail } from "../episode/prep-mail";
import { sendGmail, hasGmailSend } from "../gmail";
import { buildVcf, type VcfPerson } from "../vcf";
import type { Stage } from "../types";

type SB = ReturnType<typeof createServiceClient>;

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function showRow(sb: SB, ref: string) {
  // `id` est un uuid : comparer id.eq à un slug ("gdiy") fait échouer toute la
  // requête côté PostgREST. On cible donc la bonne colonne selon le format.
  const isId = UUID_RE.test(ref);
  // Slug saisi librement ("GDIY", "gdiy") : on compare sans tenir compte de la
  // casse. L'id reste une égalité stricte (uuid).
  let q = sb.from("shows").select("id, slug, type_pipe");
  q = isId ? q.eq("id", ref) : q.ilike("slug", ref);
  const { data } = await q.maybeSingle();
  return data as { id: string; slug: string; type_pipe: "invites" | "thematique" } | null;
}

async function showId(sb: SB, ref: string): Promise<string | null> {
  return (await showRow(sb, ref))?.id ?? null;
}

async function resolveCible(sb: SB, sid: string, ref: string) {
  if (UUID_RE.test(ref)) {
    const { data } = await sb.from("cibles").select("id, nom").eq("id", ref).maybeSingle();
    if (data) return data as { id: string; nom: string };
  }
  const { data } = await sb
    .from("cibles")
    .select("id, nom")
    .eq("show_id", sid)
    .ilike("nom", `%${ref}%`)
    .limit(2);
  const rows = (data ?? []) as { id: string; nom: string }[];
  return rows.length === 1 ? rows[0] : null;
}

async function ensureCible(sb: SB, show: { id: string; type_pipe: string }, nom: string) {
  const found = await resolveCible(sb, show.id, nom);
  if (found) return found;
  const { data: stage } = await sb
    .from("stages").select("id").eq("show_id", show.id).order("position").limit(1).maybeSingle();
  const { data } = await sb
    .from("cibles")
    .insert({
      show_id: show.id,
      kind: show.type_pipe === "invites" ? "personne" : "entreprise",
      nom,
      stage_id: stage?.id ?? null,
      priorite: "moyenne",
      voie: "froid",
    })
    .select("id, nom")
    .single();
  return (data as { id: string; nom: string }) ?? null;
}

/** Résout des clés/libellés de watchlist en ids ; signale les inconnus. */
async function resolveWatchlistIds(sb: SB, refs: string[]): Promise<{ ids: string[]; unknown: string[] }> {
  const wanted = refs.map((r) => r.trim()).filter(Boolean);
  if (wanted.length === 0) return { ids: [], unknown: [] };
  const { data } = await sb.from("watchlists").select("id, key, label");
  const rows = (data ?? []) as { id: string; key: string; label: string }[];
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const ref of wanted) {
    const low = ref.toLowerCase();
    const hit = rows.find((w) => w.key.toLowerCase() === low || w.label.toLowerCase() === low);
    if (hit) ids.push(hit.id);
    else unknown.push(ref);
  }
  return { ids: Array.from(new Set(ids)), unknown };
}

/** Remplace les watchlists d'une cible. Renvoie un message d'erreur si clé inconnue. */
async function setCibleWatchlists(sb: SB, cibleId: string, refs: string[]): Promise<string | null> {
  const { ids, unknown } = await resolveWatchlistIds(sb, refs);
  if (unknown.length) return `Watchlist inconnue : ${unknown.join(", ")}. Crée-la d'abord (pas de création implicite).`;
  await sb.from("cible_watchlists").delete().eq("cible_id", cibleId);
  if (ids.length) {
    await sb.from("cible_watchlists").insert(ids.map((watchlist_id) => ({ cible_id: cibleId, watchlist_id })));
  }
  return null;
}

/** Course une promesse contre un délai ; renvoie null si le délai est dépassé. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Rattache à une cible les coordonnées résolues (Folk/Google) sur match HAUTE
 *  confiance, sans doublon. Renvoie ce qui a été ajouté (vide sinon). */
async function autoAttachCibleContacts(
  sb: SB,
  cibleId: string,
  nom: string
): Promise<{ attaches: string[]; resolution: ResolvedContact }> {
  const r: ResolvedContact =
    (await withTimeout(resolveContact(nom), 30_000)) ?? { source: null, match_confidence: "aucun", email: [], telephone: [] };
  if (r.source === "folk" && r.folk_id) await persistFolkId(sb, cibleId, r.folk_id);
  if (r.match_confidence !== "haute" || !r.source) return { attaches: [], resolution: r };
  const { data: existing } = await sb.from("contacts").select("valeur").eq("cible_id", cibleId);
  const known = new Set(((existing ?? []) as { valeur: string }[]).map((c) => c.valeur.trim().toLowerCase()));
  const verifie = r.source === "folk"; // Folk = source de vérité → vérifié
  const rows: Record<string, unknown>[] = [];
  for (const valeur of r.email)
    if (!known.has(valeur.trim().toLowerCase())) rows.push({ cible_id: cibleId, kind: "email", valeur, source: r.source, confiance: verifie ? 5 : 3, verifie });
  for (const valeur of r.telephone)
    if (!known.has(valeur.trim().toLowerCase())) rows.push({ cible_id: cibleId, kind: "telephone", valeur, source: r.source, confiance: verifie ? 5 : 3, verifie });
  if (rows.length) await sb.from("contacts").insert(rows);
  return { attaches: rows.map((x) => `${x.kind}: ${x.valeur}`), resolution: r };
}

/** Persiste le lien Folk sur la cible (seulement s'il n'est pas déjà posé). */
async function persistFolkId(sb: SB, cibleId: string, folkId?: string | null): Promise<void> {
  if (!folkId) return;
  await sb.from("cibles").update({ folk_id: folkId }).eq("id", cibleId).is("folk_id", null);
}

/** Persiste le lien Folk sur un appui (seulement s'il n'est pas déjà posé). */
async function persistAppuiFolkId(sb: SB, appuiId: string, folkId?: string | null): Promise<void> {
  if (!folkId) return;
  await sb.from("appuis").update({ folk_id: folkId }).eq("id", appuiId).is("folk_id", null);
}

/** Rattache à un APPUI les coordonnées résolues (Folk/Google) sur match HAUTE
 *  confiance, sans doublon, et lie sa fiche Folk (folk_id). Mêmes règles que
 *  autoAttachCibleContacts. Renvoie ce qui a été ajouté + la résolution brute
 *  (dont candidats en cas d'ambiguïté, pour arbitrage sans choix silencieux). */
async function autoAttachAppuiContacts(
  sb: SB,
  appuiId: string,
  nom: string
): Promise<{ attaches: string[]; resolution: ResolvedContact }> {
  const r: ResolvedContact =
    (await withTimeout(resolveContact(nom), 30_000)) ?? { source: null, match_confidence: "aucun", email: [], telephone: [] };
  // Lier la fiche Folk dès qu'on a un match confiant (haute/moyenne), même si les
  // coordonnées ne sont pas rattachées automatiquement (moyenne).
  if (r.source === "folk" && r.folk_id) await persistAppuiFolkId(sb, appuiId, r.folk_id);
  if (r.match_confidence !== "haute" || !r.source) return { attaches: [], resolution: r };
  const { data: existing } = await sb.from("contacts").select("valeur").eq("appui_id", appuiId);
  const known = new Set(((existing ?? []) as { valeur: string }[]).map((c) => c.valeur.trim().toLowerCase()));
  const verifie = r.source === "folk"; // Folk = source de vérité → vérifié
  const rows: Record<string, unknown>[] = [];
  for (const valeur of r.email)
    if (!known.has(valeur.trim().toLowerCase())) rows.push({ appui_id: appuiId, kind: "email", valeur, source: r.source, confiance: verifie ? 5 : 3, verifie });
  for (const valeur of r.telephone)
    if (!known.has(valeur.trim().toLowerCase())) rows.push({ appui_id: appuiId, kind: "telephone", valeur, source: r.source, confiance: verifie ? 5 : 3, verifie });
  if (rows.length) await sb.from("contacts").insert(rows);
  return { attaches: rows.map((x) => `${x.kind}: ${x.valeur}`), resolution: r };
}

/** Outils destructifs : exigent le scope admin (décision #6). */
const DESTRUCTIVE_TOOLS = new Set(["delete_appui", "delete_touche", "archive_cible", "sync_google_contacts"]);

/** Scope requis pour un outil d'écriture donné, selon l'appel. */
export function requiredScope(name: string, args: unknown): "write" | "admin" {
  if (DESTRUCTIVE_TOOLS.has(name)) return "admin";
  // enrich_* avec apply=true écrit la fiche → admin ; en simple recherche → write.
  if ((name === "enrich_cible" || name === "enrich_colonne") && (args as { apply?: boolean } | null)?.apply === true) return "admin";
  return "write";
}

/** Écrit une ligne d'audit (best-effort, jamais bloquant). actor jamais nul. */
async function auditWrite(tool: string, actor: string, payload: unknown, ok: boolean, detail: string | null): Promise<void> {
  try {
    const sb = createServiceClient();
    await sb.from("mcp_audit").insert({ tool, actor, payload: payload ?? {}, ok, detail });
  } catch {
    /* audit best-effort */
  }
}

/** Sous-ensemble d'outils exposé au client de boucle Vadim (endpoint /api/loop/mcp).
 *  Lecture + les 3 écritures du contrat, AUCUN outil destructif/admin. */
export const LOOP_TOOLS = [
  "list_shows", "list_cibles", "find_cible", "get_dossier", "daily_five",
  "log_touche", "update_cible", "add_appui",
] as const;

export function registerMagellanTools(server: McpServer, opts: { allow?: readonly string[] } = {}) {
  // Allowlist optionnelle : si fournie, seuls ces outils sont enregistrés
  // (endpoint restreint Vadim). Sinon, tout est exposé (endpoint principal).
  const allow = opts.allow ? new Set(opts.allow) : null;
  const gated = (name: string) => !allow || allow.has(name);

  // Journal d'audit (Chantier A) : `W(...)` enregistre un outil d'écriture, mais
  // trace chaque appel dans mcp_audit (best-effort, jamais bloquant). `RT(...)`
  // fait pareil pour les lectures (sans audit). Les deux respectent l'allowlist.
  //
  // LOT H — hygiène API : on passe par `registerTool` avec un schéma zod STRICT
  // (z.object(shape).strict()) au lieu du `tool()` positionnel. Effet : tout
  // paramètre inconnu est REJETÉ par une erreur de validation explicite (fini le
  // strip silencieux qui masquait les fautes de frappe côté appelant).
  const reg = server.registerTool.bind(server) as (name: string, config: unknown, cb: unknown) => unknown;
  const strictSchema = (schema: unknown) => z.object((schema ?? {}) as z.ZodRawShape).strict();
  const RT = (name: string, desc: string, schema: unknown, ann: unknown, cb: (a: any, extra?: any) => Promise<{ content: { type: "text"; text: string }[] }>) => {
    if (!gated(name)) return;
    reg(name, { description: desc, inputSchema: strictSchema(schema), annotations: ann }, cb);
  };
  const W = (name: string, desc: string, schema: unknown, ann: unknown, cb: (a: any, extra?: any) => Promise<{ content: { type: "text"; text: string }[] }>) => {
    if (!gated(name)) return;
    return reg(name, { description: desc, inputSchema: strictSchema(schema), annotations: ann }, async (a: any, extra: any) => {
      const actor = extra?.authInfo?.extra?.email ?? extra?.authInfo?.extra?.userId ?? "inconnu";
      const scopes: string[] = extra?.authInfo?.scopes ?? [];
      const need = requiredScope(name, a);
      // Gating (décision #6). Fail-open uniquement si aucun scope présent (jeton
      // legacy) : sinon on exige le scope. destructif → admin, écriture → write.
      if (scopes.length && !scopes.includes(need)) {
        const denial = text({ error: `Accès refusé : rôle « ${need} » requis pour ${name}.` });
        await auditWrite(name, actor, a, false, `accès refusé (scope ${need} manquant)`);
        return denial;
      }
      const res = await cb(a, extra);
      const parsed = (() => { try { return JSON.parse(res?.content?.[0]?.text ?? "{}") as { error?: string; detail?: string }; } catch { return {}; } })();
      await auditWrite(name, actor, a, !parsed.error, parsed.error ?? parsed.detail ?? null);
      return res;
    });
  };

  RT("list_shows", "Liste les shows (podcasts) et leurs étapes.", {}, { readOnlyHint: true }, async () => {
    const sb = createServiceClient();
    const { data } = await sb.from("shows").select("*, stages(key, label, position, is_final)").order("nom");
    return text(data);
  });

  RT(
    "list_cibles",
    "Liste les cibles d'un show, triées par score d'actionnabilité décroissant (les cibles qui bougent en tête). Enrichies : score, badges, résurgence, jours depuis touche, signal, appuis. Les archivées sont exclues par défaut ; les noms factices (placeholder) sont relégués en bas et signalés.",
    {
      show: z.string().describe("slug (gdiy, ccg, fleurons) ou id"),
      voie: z.enum(["froid", "chaud"]).optional(),
      archetype: z.enum(["big_fish", "quick_win", "pepite"]).optional(),
      stage_key: z.string().optional(),
      kind: z.enum(["personne", "entreprise"]).optional(),
      secteur: z.string().optional(),
      pays: z.string().optional(),
      ville: z.string().optional().describe("ville / zone de tournage (recherche partielle)"),
      envergure: z.enum(["fr", "international"]).optional(),
      sujet: z.string().optional().describe("cibles dont les sujets contiennent cette valeur"),
      watchlist: z.string().optional().describe("clé ou libellé (ex. cac40) — cibles appartenant à cette watchlist"),
      q: z.string().optional().describe("filtre par nom (recherche partielle)"),
      limit: z.number().optional().describe("nombre max de cibles renvoyées après tri (défaut 50, max 200)"),
      full: z.boolean().optional().describe("true = toutes les colonnes ; défaut = projection compacte"),
      include_archived: z.boolean().optional().describe("inclure les cibles archivées (défaut false)"),
      score_min: z.number().optional().describe("ne garder que les cibles dont le score ≥ ce seuil"),
      saison: z.enum(["auto", "ete", "off"]).optional().describe("modificateur estival : auto (actif juin-juillet), ete (forcer), off (ignorer). Défaut auto."),
    },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      // Colonnes nécessaires au score (superset de la projection compacte). On
      // tire l'ensemble filtré (borné à 1000), on score en mémoire, puis on
      // trie et on coupe à `limit` — sinon un cap SQL enterrerait les cibles
      // qui bougent (défaut n°1 de l'audit).
      const SCORE_COLS =
        "id, nom, kind, role, organisation, secteur, pays, ville, photo_url, envergure, voie, priorite, archetype, note_priorite, stage_key, stage_label, jours_depuis_touche, dernier_signal_date, dernier_signal_pertinence, signal_frais, nb_appuis, nb_relais_actionnables, watchlist_keys, archive, sujets";
      const sel: string = a.full ? "*" : SCORE_COLS;
      let q = sb.from("cibles_enrichies").select(sel).eq("show_id", sid);
      if (!a.include_archived) q = q.eq("archive", false); // [C3]
      if (a.voie) q = q.eq("voie", a.voie);
      if (a.archetype) q = q.eq("archetype", a.archetype);
      if (a.stage_key) q = q.eq("stage_key", a.stage_key);
      if (a.kind) q = q.eq("kind", a.kind);
      if (a.secteur) q = q.eq("secteur", a.secteur);
      if (a.pays) q = q.eq("pays", a.pays);
      if (a.ville) q = q.ilike("ville", `%${a.ville}%`);
      if (a.envergure) q = q.eq("envergure", a.envergure);
      if (a.sujet) q = q.contains("sujets", [a.sujet]);
      if (a.q) q = q.ilike("nom", `%${a.q}%`);
      if (a.watchlist) {
        const { ids, unknown } = await resolveWatchlistIds(sb, [a.watchlist]);
        if (unknown.length) return text({ error: `Watchlist inconnue : ${a.watchlist}` });
        const { data: links } = await sb.from("cible_watchlists").select("cible_id").eq("watchlist_id", ids[0]);
        const cibleIds = (links ?? []).map((l) => l.cible_id as string);
        q = q.in("id", cibleIds.length ? cibleIds : ["00000000-0000-0000-0000-000000000000"]);
      }
      const { data, error } = await q.limit(1000);
      if (error) return text({ error: error.message });

      type Row = Record<string, unknown>;
      const rows = (data ?? []) as unknown as Row[];
      const estival = estivalActif(a.saison);
      const scored = rows.map((r) => {
        const s = computeCibleScore(r as unknown as ScoreInput, estival);
        return { r, ...s };
      });
      // Tri : cibles travaillables d'abord (placeholder en bas), puis score
      // décroissant, puis ancienneté de touche, puis nom.
      scored.sort((x, y) => {
        if (x.placeholder !== y.placeholder) return x.placeholder ? 1 : -1;
        if (y.score !== x.score) return y.score - x.score;
        const jx = (x.r.jours_depuis_touche as number) ?? -1;
        const jy = (y.r.jours_depuis_touche as number) ?? -1;
        if (jy !== jx) return jy - jx;
        return String(x.r.nom ?? "").localeCompare(String(y.r.nom ?? ""));
      });
      let out = scored;
      if (typeof a.score_min === "number") out = out.filter((s) => s.score >= (a.score_min as number));
      out = out.slice(0, Math.min(a.limit ?? 50, 200));

      const COMPACT_KEYS = [
        "id", "nom", "kind", "role", "organisation", "secteur", "pays", "ville", "photo_url", "voie", "priorite",
        "archetype", "note_priorite", "stage_key", "jours_depuis_touche", "signal_frais",
        "nb_appuis", "nb_relais_actionnables", "watchlist_keys", "archive",
      ];
      const payload = out.map(({ r, score, placeholder, badges }) => {
        const proj$ = a.full
          ? { ...r }
          : Object.fromEntries(COMPACT_KEYS.filter((k) => k in r).map((k) => [k, r[k]]));
        return { ...proj$, score, placeholder, badges };
      });
      return text(payload);
    }
  );

  RT(
    "daily_five",
    "Les cibles à travailler MAINTENANT : top N par score (défaut 5, max 10), hors archivées, gagnées (≥confirme), placeholders et cibles reportées. Intentions : que faire aujourd'hui, quelles sont mes priorités / prochaines actions, qui relancer, par où commencer. Pour chaque : score, badges, pourquoi maintenant (résurgence), playbook, dernière touche. Pilote la session du matin (app « Aujourd'hui » / Vadim).",
    { show: z.string(), limit: z.number().optional() },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const { data } = await sb.from("cibles_enrichies").select("*").eq("show_id", sid).eq("archive", false).limit(1000);
      const rows = (data ?? []) as unknown as CibleEnrichie[];
      const estival = estivalActif();
      const WON = new Set(["confirme", "programme", "enregistre", "publie", "produit"]);
      // Cibles reportées (snooze S5) : exclues du jour. Défensif si table absente.
      let snoozed = new Set<string>();
      try {
        const { data: sn } = await sb.from("cible_snooze").select("cible_id").gt("snoozed_until", new Date().toISOString());
        snoozed = new Set(((sn ?? []) as { cible_id: string }[]).map((r) => r.cible_id));
      } catch { /* table absente → aucun report */ }
      const scored = rows
        .map((r) => ({ r, s: computeCibleScore(r as unknown as ScoreInput, estival) }))
        .filter((x) => !x.s.placeholder && !(x.r.stage_key && WON.has(x.r.stage_key)) && !snoozed.has(x.r.id))
        .sort((x, y) => y.s.score - x.s.score)
        .slice(0, Math.min(a.limit ?? 5, 10));
      const cibles = scored.map(({ r, s }) => {
        const res = computeResurgence(r);
        return {
          id: r.id,
          nom: r.nom,
          score: s.score,
          badges: s.badges,
          role: r.role,
          organisation: r.organisation,
          voie: r.voie,
          pourquoi_maintenant: res.raison,
          conseil: res.conseil,
          playbook: (r as { playbook?: unknown }).playbook ?? null,
          jours_depuis_touche: r.jours_depuis_touche,
          canal_reel: r.canal_reel,
          via_qui: r.via_qui,
        };
      });
      kickQueue(); // draine la file d'enrichissement en tâche de fond (plan Hobby)
      return text({ ok: true, show: a.show, cibles });
    }
  );

  RT(
    "find_cible",
    "Cherche une cible par nom dans un show et renvoie id + résumé. Intentions : vérifier si une personne / entreprise existe déjà, éviter un doublon avant create_cible, retrouver l'id d'une fiche. Sans tirer toute la liste.",
    {
      show: z.string(),
      cible: z.string().optional().describe("nom ou fragment de nom"),
      query: z.string().optional().describe("alias de `cible` (déprécié)"),
    },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      const needle = a.cible ?? a.query;
      if (!needle) return text({ error: "Préciser `cible` (nom ou fragment)." });
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const { data, error } = await sb
        .from("cibles_enrichies")
        .select("id, nom, kind, role, organisation, secteur, pays, stage_key, archetype")
        .eq("show_id", sid)
        .ilike("nom", `%${needle}%`)
        .limit(15);
      if (error) return text({ error: error.message });
      return text({ count: (data ?? []).length, cibles: data });
    }
  );

  RT(
    "get_dossier",
    "Dossier complet d'une cible : champs, appuis, journal, signaux, contacts. Passer `cible_id` (UUID) ou bien `cible` (nom) + `show`.",
    {
      cible_id: z.string().optional().describe("UUID de la cible"),
      cible: z.string().optional().describe("nom (nécessite `show`)"),
      show: z.string().optional().describe("slug/id du show (avec `cible`)"),
    },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      let cid = a.cible_id ?? null;
      if (!cid && a.cible && a.show) {
        const sid = await showId(sb, a.show);
        if (!sid) return text({ error: `Show introuvable: ${a.show}` });
        const target = await resolveCible(sb, sid, a.cible);
        if (!target) return text({ error: `Cible « ${a.cible} » introuvable (ou ambiguë).` });
        cid = target.id;
      }
      if (!cid) return text({ error: "Préciser `cible_id`, ou `cible` + `show`." });
      const [c, appuisRes, touches, signals, contacts] = await Promise.all([
        sb.from("cibles_enrichies").select("*").eq("id", cid).maybeSingle(),
        sb.from("appuis").select("*").eq("cible_id", cid),
        sb.from("touches").select("*").eq("cible_id", cid).order("date", { ascending: false }),
        sb.from("signals").select("*").eq("cible_id", cid).order("date", { ascending: false }),
        sb.from("contacts").select("*").eq("cible_id", cid),
      ]);
      if (!c.data) return text({ error: "Cible introuvable" });
      // Rattache à chaque appui ses propres coordonnées (Lot 5).
      const appuis = (appuisRes.data ?? []) as { id: string }[];
      const appuiIds = appuis.map((x) => x.id);
      const appuiContacts = appuiIds.length
        ? (((await sb.from("contacts").select("*").in("appui_id", appuiIds)).data ?? []) as { appui_id: string | null }[])
        : [];
      const appuisWithContacts = appuis.map((x) => ({ ...x, contacts: appuiContacts.filter((ct) => ct.appui_id === x.id) }));

      // Bloc contacts_externes : si le dossier local n'a aucune coordonnée, on
      // résout via Folk/Google (borné par un délai pour ne jamais bloquer).
      const localCoords = ((contacts.data ?? []) as { kind?: string }[]).filter(
        (ct) => ct.kind === "email" || ct.kind === "telephone"
      );
      const nom = (c.data as { nom?: string }).nom;
      let contacts_externes: Awaited<ReturnType<typeof resolveContact>> | undefined;
      if (localCoords.length === 0 && nom) {
        const resolved = await withTimeout(resolveContact(nom), 30_000);
        if (resolved && resolved.source) contacts_externes = resolved;
      }

      // Dernier job d'enrichissement (S3) : statut + sources, pour le suivi async.
      const { data: enr } = await sb
        .from("enrichment_jobs")
        .select("id, objectif, statut, sources, applied, error, created_at, updated_at")
        .eq("cible_id", cid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return text({
        cible: c.data,
        appuis: appuisWithContacts,
        touches: touches.data,
        signals: signals.data,
        contacts: contacts.data,
        contacts_externes,
        dernier_enrichissement: enr ?? null,
      });
    }
  );

  RT(
    "resolve_contact",
    "Trouve les coordonnées d'une personne (email, téléphone, comment la joindre) : Folk d'abord (source de vérité), Google Contacts en repli. Intentions : quel est l'email / le numéro de X, comment contacter X. LECTURE SEULE — ne rattache rien (utiliser attach_resolved_contacts pour écrire). En cas d'ambiguïté, renvoie les candidats sans choisir. Passer `nom` ou `cible_id`.",
    {
      nom: z.string().optional(),
      cible_id: z.string().optional().describe("UUID — résout le nom de la cible puis cherche"),
      show: z.string().optional(),
    },
    { readOnlyHint: true, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      let nom = a.nom ?? null;
      if (!nom && a.cible_id) {
        const { data } = await sb.from("cibles").select("nom").eq("id", a.cible_id).maybeSingle();
        nom = (data as { nom?: string } | null)?.nom ?? null;
      }
      if (!nom) return text({ error: "Préciser `nom` ou `cible_id`.", cause: "parametre_manquant", action: "Fournir `nom` (ou `cible_id` pour résoudre le nom de la cible)." });
      const r = await resolveContact(nom);
      // Erreur structurée : distinguer « aucune source configurée » (vrai
      // problème de setup) de « sources présentes mais aucune correspondance ».
      if (r.match_confidence === "aucun") {
        const noSources = !hasFolkKey() && !hasGoogleSync();
        return text({
          ok: !noSources, // pas de correspondance = résultat valide vide ; pas de source = erreur
          query: nom,
          ...r,
          error: noSources ? "Aucune source de contacts configurée (Folk ni Google)." : undefined,
          cause: noSources ? "sources_absentes" : "aucune_correspondance",
          action: noSources
            ? "Configurer FOLK_API_KEY et/ou la synchronisation Google Contacts, puis réessayer."
            : "Vérifier l'orthographe du nom, ou lancer enrich_cible (objectif=contact) pour chercher les coordonnées en ligne.",
        });
      }
      return text({ ok: true, query: nom, ...r });
    }
  );

  W(
    "attach_resolved_contacts",
    "Résout les coordonnées d'une cible EXISTANTE (Folk d'abord, Google en repli) ET les rattache à sa fiche, sur match HAUTE confiance, dédoublonné. En cas d'ambiguïté ou de match faible, ne rattache RIEN et renvoie les candidats (à arbitrer). Pour combler une fiche sans coordonnées (ex. un ancien ajout sans lien Folk).",
    { show: z.string(), cible: z.string().describe("nom ou id de la cible") },
    { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      const { attaches, resolution } = await autoAttachCibleContacts(sb, target.id, target.nom);
      return text({
        ok: true,
        cible: target.nom,
        source: resolution.source,
        match_confidence: resolution.match_confidence,
        rattaches: attaches,
        candidats: resolution.candidats,
        detail: attaches.length
          ? `${attaches.length} coordonnée(s) rattachée(s) depuis ${resolution.source}.`
          : resolution.match_confidence === "ambigu"
            ? "Plusieurs correspondances — rien rattaché, voir candidats."
            : `Aucune coordonnée fiable à rattacher pour « ${target.nom} ».`,
      });
    }
  );

  W(
    "create_cible",
    "Crée et qualifie une cible en UN appel (créer une fiche, ajouter un prospect, un invité potentiel). ATOMIQUE : accepte l'étape initiale (`stage`), les coordonnées (`contacts[]`) et une première touche (`premiere_touche`) dans le même appel, plus de multi-aller-retour. Le kind (personne/entreprise) découle du show ; les champs sont validés selon le kind.",
    {
      show: z.string(),
      nom: z.string(),
      role: z.string().optional(),
      organisation: z.string().optional(),
      archetype: z.enum(["big_fish", "quick_win", "pepite"]).optional(),
      secteur: z.string().optional(),
      pays: z.string().optional(),
      ville: z.string().optional().describe("ville / zone de tournage (distincte du pays)"),
      photo_url: z.string().optional().describe("URL d'une photo publique"),
      playbook: z.object({ canal: z.string().optional(), langue: z.string().optional(), angle: z.string().optional(), fenetre: z.string().optional(), personne_entree: z.string().optional() }).optional().describe("comment engager : canal, langue, angle, fenêtre, personne d'entrée"),
      envergure: z.enum(["fr", "international"]).optional(),
      priorite: z.enum(["haute", "moyenne", "basse"]).optional(),
      voie: z.enum(["froid", "chaud"]).optional(),
      sujets: z.array(z.string()).optional(),
      raison_de_selection: z.string().optional(),
      etat_recherche: z.string().optional(),
      note: z.string().optional().describe("contexte de fond durable"),
      note_priorite: z.number().int().min(1).max(5).optional().describe("priorité manuelle 1-5"),
      watchlist: z.array(z.string()).optional().describe("clés/libellés (ex. ['cac40'])"),
      stage: z.string().optional().describe("clé d'étape initiale (ex. identifie, qualifie, contacte)"),
      contacts: z.array(z.object({
        kind: z.enum(["email", "telephone", "reseau", "agence", "portier", "site", "autre"]),
        valeur: z.string(),
        label: z.string().optional(),
      })).optional().describe("coordonnées à créer avec la fiche"),
      premiere_touche: z.object({
        contenu: z.string(),
        canal: z.string().optional(),
        date: z.string().optional().describe("date ISO (défaut : maintenant)"),
      }).optional().describe("première touche à journaliser avec la fiche"),
    },
    { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const show = await showRow(sb, a.show);
      if (!show) return text({ error: "Show introuvable" });
      const kind = show.type_pipe === "invites" ? "personne" : "entreprise";
      const { patch, rejected, allowed } = kindAwarePatch(kind, a as Record<string, unknown>);
      if (rejected.length) {
        return text({ error: `Champs non autorisés pour une ${kind} : ${rejected.join(", ")}. Champs autorisés : ${allowed.join(", ")}.` });
      }
      // Étape initiale : résolue avant l'ensureCible pour l'écrire en une passe.
      if (a.stage) {
        const { data: st } = await sb.from("stages").select("id").eq("show_id", show.id).eq("key", a.stage).maybeSingle();
        if (!st) return text({ error: `Étape inconnue : ${a.stage}` });
        patch.stage_id = (st as { id: string }).id;
      }
      const c = await ensureCible(sb, show, a.nom);
      if (!c) return text({ error: "Création échouée" });
      delete patch.nom; // déjà posé par ensureCible
      if (Object.keys(patch).length) await sb.from("cibles").update(patch).eq("id", c.id);
      if (a.watchlist) {
        const err = await setCibleWatchlists(sb, c.id, a.watchlist);
        if (err) return text({ error: err });
      }
      // Coordonnées fournies (atomique), dédoublonnées.
      let contacts_crees = 0;
      if (a.contacts?.length) {
        const rows = (a.contacts as { kind: string; valeur: string; label?: string }[])
          .filter((ct) => ct.valeur?.trim())
          .map((ct) => ({ cible_id: c.id, kind: ct.kind, valeur: ct.valeur.trim(), label: ct.label ?? null, source: "Claude", confiance: 4 }));
        if (rows.length) {
          const { error } = await sb.from("contacts").insert(rows);
          if (!error) contacts_crees = rows.length;
        }
      }
      // Première touche (atomique) : journal + remise à zéro du compteur.
      let touche_creee = false;
      if (a.premiere_touche?.contenu?.trim()) {
        const date = a.premiere_touche.date ?? new Date().toISOString();
        const { error } = await sb.from("touches").insert({
          cible_id: c.id,
          contenu: a.premiere_touche.contenu.trim(),
          canal: a.premiere_touche.canal ?? null,
          source: "saisie",
          date,
        });
        if (!error) {
          touche_creee = true;
          await sb.from("cibles").update({ date_derniere_touche: date }).eq("id", c.id);
        }
      }
      // Auto-rattachement des coordonnées (Folk/Google) sur match haute confiance.
      const { attaches } = await autoAttachCibleContacts(sb, c.id, c.nom);
      return text({
        ok: true,
        cible: c,
        applique: Object.keys(patch),
        watchlist: a.watchlist,
        stage: a.stage,
        contacts_crees,
        touche_creee,
        contacts_auto: attaches,
      });
    }
  );

  W(
    "add_appui",
    "Ajoute un allié/appui à une cible (relais, introduction, mise en relation, qui peut ouvrir la porte, entremise). Relié à sa fiche si l'allié est une cible ; résout et lie sa fiche Folk, rattache ses coordonnées sur match sûr. Crée la cible visée si besoin. MAJ Folk.",
    {
      show: z.string(),
      cible: z.string(),
      allie: z.string(),
      nature: z.enum(["ancien_invite", "conseiller", "entourage", "contact_interne"]).optional().describe("ce qu'est l'appui"),
      type: z.enum(["ancien_invite", "conseiller", "entourage", "contact_interne"]).optional().describe("DÉPRÉCIÉ : alias de nature"),
      est_relais: z.boolean().optional().describe("true si l'appui ouvre la porte (relais d'introduction)"),
      telephone: z.string().optional().describe("téléphone du relais (stocké comme coordonnée de l'appui)"),
      email: z.string().optional().describe("email du relais"),
      note: z.string().optional(),
      creer_allie_comme_cible: z.boolean().optional(),
    },
    { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const show = await showRow(sb, a.show);
      if (!show) return text({ error: "Show introuvable" });
      const target = await ensureCible(sb, show, a.cible);
      if (!target) return text({ error: "Cible introuvable" });
      let ally = await resolveCible(sb, show.id, a.allie);
      if (!ally && a.creer_allie_comme_cible) ally = await ensureCible(sb, show, a.allie);
      const est_relais = a.est_relais ?? false;
      const nature = a.nature ?? a.type ?? "ancien_invite";

      // Idempotence : si un appui du même nom (normalisé) existe déjà sur la
      // cible, on l'enrichit au lieu de créer un doublon.
      const { data: existingAppuis } = await sb
        .from("appuis").select("id, nom, note, est_relais, ally_cible_id, nature").eq("cible_id", target.id);
      const match = ((existingAppuis ?? []) as { id: string; nom: string; note: string | null; est_relais: boolean; ally_cible_id: string | null; nature: string }[])
        .find((x) => normName(x.nom) === normName(a.allie));

      let appuiId: string;
      let cree: boolean;
      if (match) {
        const up: Record<string, unknown> = {};
        if (a.note && !match.note) up.note = a.note;
        if (est_relais && !match.est_relais) up.est_relais = true;
        if (ally?.id && !match.ally_cible_id) up.ally_cible_id = ally.id;
        if (a.nature && match.nature !== a.nature) up.nature = a.nature;
        if (Object.keys(up).length) await sb.from("appuis").update(up).eq("id", match.id);
        appuiId = match.id;
        cree = false;
      } else {
        const { data: appui, error } = await sb
          .from("appuis")
          .insert({ cible_id: target.id, nom: a.allie, nature, est_relais, note: a.note ?? null, ally_cible_id: ally?.id ?? null })
          .select("id")
          .single();
        if (error || !appui) return text({ error: error?.message ?? "Échec création appui" });
        appuiId = appui.id;
        cree = true;
      }

      // Règle transverse : un relais qui ouvre la porte → voie chaud par défaut.
      if (est_relais) await sb.from("cibles").update({ voie: "chaud" }).eq("id", target.id);

      // Coordonnées portées par l'appui, dédoublonnées contre celles déjà présentes.
      const { data: appuiCoords } = await sb.from("contacts").select("valeur").eq("appui_id", appuiId);
      const known = new Set(((appuiCoords ?? []) as { valeur: string }[]).map((c) => c.valeur.trim().toLowerCase()));
      const coords = (
        [
          a.telephone ? { appui_id: appuiId, kind: "telephone", valeur: a.telephone, source: "Claude", confiance: 4 } : null,
          a.email ? { appui_id: appuiId, kind: "email", valeur: a.email, source: "Claude", confiance: 4 } : null,
        ].filter((x): x is { appui_id: string; kind: string; valeur: string; source: string; confiance: number } => x !== null)
      ).filter((c) => !known.has(c.valeur.trim().toLowerCase()));
      if (coords.length) await sb.from("contacts").insert(coords);

      // Auto-rattachement : on résout l'allié (Folk d'abord, Google en repli),
      // on lie sa fiche Folk (folk_id sur l'appui) et on attache les coordonnées
      // manquantes sur match HAUTE confiance (mêmes règles qu'attach_resolved_contacts).
      // En cas d'ambiguïté, rien n'est choisi : on renvoie les candidats à arbitrer.
      const { attaches: coords_auto, resolution } = await autoAttachAppuiContacts(sb, appuiId, a.allie);
      const lie_folk = resolution.source === "folk" && !!resolution.folk_id;

      const folk = await folkAddAlly(target.nom, a.allie, a.note);
      await persistFolkId(sb, target.id, folk.folk_id);
      return text({
        ok: true,
        cible: target.nom,
        allie: a.allie,
        appui_id: appuiId,
        cree,
        relais: est_relais,
        voie: est_relais ? "chaud" : undefined,
        coordonnees: coords.length,
        coords_auto,
        lie: !!ally,
        lie_folk,
        match_confidence: resolution.match_confidence,
        candidats: resolution.match_confidence === "ambigu" ? resolution.candidats : undefined,
        folk: folk.detail,
        detail:
          resolution.match_confidence === "ambigu"
            ? "Plusieurs fiches Folk correspondent — aucune liée ni rattachée automatiquement. Choisir un candidat puis ajouter les coordonnées via add_appui_contact."
            : undefined,
      });
    }
  );

  W(
    "update_appui",
    "Met à jour un appui existant (nom, nature, relais, note). Récupérer l'id via get_dossier.",
    {
      appui_id: z.string(),
      nom: z.string().optional(),
      nature: z.enum(["ancien_invite", "conseiller", "entourage", "contact_interne"]).optional(),
      est_relais: z.boolean().optional(),
      note: z.string().optional(),
    },
    { destructiveHint: false, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const patch: Record<string, unknown> = {};
      if (a.nom !== undefined) patch.nom = a.nom;
      if (a.nature !== undefined) patch.nature = a.nature;
      if (a.est_relais !== undefined) patch.est_relais = a.est_relais;
      if (a.note !== undefined) patch.note = a.note;
      if (Object.keys(patch).length === 0) return text({ error: "Aucun champ à mettre à jour." });
      const { error } = await sb.from("appuis").update(patch).eq("id", a.appui_id);
      if (error) return text({ error: error.message });
      return text({ ok: true, appui_id: a.appui_id, modifie: Object.keys(patch) });
    }
  );

  W(
    "delete_appui",
    "Supprime un appui et ses coordonnées (cascade). À utiliser pour retirer un doublon. Récupérer l'id via get_dossier.",
    { appui_id: z.string() },
    { destructiveHint: true, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const { data: appui } = await sb.from("appuis").select("id, nom").eq("id", a.appui_id).maybeSingle();
      if (!appui) return text({ error: "Appui introuvable." });
      const { error } = await sb.from("appuis").delete().eq("id", a.appui_id);
      if (error) return text({ error: error.message });
      return text({ ok: true, supprime: (appui as { nom: string }).nom });
    }
  );

  W(
    "add_contact",
    "Ajoute un contact à une cible (email/téléphone/réseau…). MAJ Folk pour un téléphone.",
    {
      show: z.string(),
      cible: z.string(),
      kind: z.enum(["email", "telephone", "reseau", "agence", "portier", "site", "autre"]).describe("portier = assistant / gardien d'agenda joignable"),
      valeur: z.string(),
      label: z.string().optional(),
    },
    { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: "Show introuvable" });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      const { error } = await sb.from("contacts").insert({
        cible_id: target.id, kind: a.kind, valeur: a.valeur, label: a.label ?? null, source: "Claude", confiance: 4,
      });
      if (error) return text({ error: error.message });
      let folk: string | undefined;
      if (a.kind === "telephone") {
        const r = await folkAddPhone(target.nom, a.valeur);
        folk = r.detail;
        await persistFolkId(sb, target.id, r.folk_id);
      } else if (a.kind === "email") {
        const r = await folkAddEmail(target.nom, a.valeur);
        folk = r.detail;
        await persistFolkId(sb, target.id, r.folk_id);
      }
      return text({ ok: true, cible: target.nom, folk });
    }
  );

  W(
    "add_appui_contact",
    "Ajoute une coordonnée STRUCTURÉE à un appui (relais) : email/téléphone/réseau direct, ou `portier` (assistant / gardien d'agenda, ex. l'assistante d'un dirigeant). Miroir d'add_contact ciblant un appui_id. Récupérer l'appui_id via get_dossier. Utiliser plutôt que de laisser un numéro en note libre — une coordonnée directe OU un portier rend le relais actionnable (scoring).",
    {
      appui_id: z.string(),
      kind: z.enum(["email", "telephone", "reseau", "agence", "portier", "site", "autre"]).describe("portier = assistant / gardien d'agenda joignable"),
      valeur: z.string(),
      label: z.string().optional().describe("ex. « Assistante », « Attachée de presse » — nom du portier ou rôle"),
    },
    { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const { data: appui } = await sb.from("appuis").select("id, nom").eq("id", a.appui_id).maybeSingle();
      if (!appui) return text({ error: "Appui introuvable (vérifier appui_id via get_dossier)." });
      // Dédoublonnage contre les coordonnées déjà portées par l'appui.
      const { data: existing } = await sb.from("contacts").select("valeur").eq("appui_id", a.appui_id);
      const known = new Set(((existing ?? []) as { valeur: string }[]).map((c) => c.valeur.trim().toLowerCase()));
      if (known.has(a.valeur.trim().toLowerCase())) {
        return text({ ok: true, appui: (appui as { nom: string }).nom, kind: a.kind, idempotent: true, detail: "Coordonnée déjà présente sur cet appui." });
      }
      const { error } = await sb.from("contacts").insert({
        appui_id: a.appui_id, kind: a.kind, valeur: a.valeur, label: a.label ?? null, source: "Claude", confiance: 4,
      });
      if (error) return text({ error: error.message });
      return text({ ok: true, appui: (appui as { nom: string }).nom, appui_id: a.appui_id, kind: a.kind, valeur: a.valeur, label: a.label ?? null });
    }
  );

  W(
    "log_touche",
    "Logge une touche sur une cible (remet le compteur à zéro). `date` optionnelle pour antidater (ISO). `idempotency_key` optionnelle : un même appel réémis (retry) n'insère qu'une fois. `resultat` optionnel : issue de la touche (reponse_positive|reponse_negative|silence|avance_stage) — alimente la boucle de feedback du score.",
    { show: z.string(), cible: z.string(), contenu: z.string(), canal: z.string().optional(), date: z.string().optional().describe("date ISO de la touche (défaut : maintenant)"), idempotency_key: z.string().optional().describe("clé anti-doublon pour les retries"), resultat: z.enum(["reponse_positive", "reponse_negative", "silence", "avance_stage"]).optional().describe("issue de la touche (feedback score)") },
    { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: "Show introuvable" });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      const { error } = await sb.from("touches").insert({
        cible_id: target.id,
        contenu: a.contenu,
        canal: a.canal ?? null,
        source: "saisie",
        ...(a.date ? { date: a.date } : {}),
        ...(a.idempotency_key ? { idempotency_key: a.idempotency_key } : {}),
        ...(a.resultat ? { resultat: a.resultat } : {}),
      });
      // 23505 = violation d'unicité → l'appel a déjà été traité (retry) : succès idempotent.
      if (error && (error as { code?: string }).code === "23505") {
        return text({ ok: true, cible: target.nom, cible_id: target.id, idempotent: true, detail: "Touche déjà enregistrée (idempotence)." });
      }
      if (error) return text({ error: error.message });
      const folk = await folkLogTouche(target.nom, a.contenu, a.canal);
      return text({ ok: true, cible: target.nom, cible_id: target.id, folk: folk.detail });
    }
  );

  W(
    "update_cible",
    "Met à jour les champs d'une cible (rôle, organisation, secteur, priorité, voie, archétype, sujets…). Ne touche que les champs fournis.",
    {
      show: z.string(),
      cible: z.string().describe("nom ou id de la cible"),
      kind: z.enum(["personne", "entreprise"]).optional().describe("corrige le type de la cible (ex. une entreprise mal classée en personne) ; nettoie les champs incompatibles"),
      nom: z.string().optional().describe("renommer la cible"),
      role: z.string().optional(),
      organisation: z.string().optional(),
      secteur: z.string().optional(),
      pays: z.string().optional(),
      ville: z.string().optional().describe("ville / zone de tournage (distincte du pays)"),
      photo_url: z.string().optional().describe("URL d'une photo publique"),
      playbook: z.object({ canal: z.string().optional(), langue: z.string().optional(), angle: z.string().optional(), fenetre: z.string().optional(), personne_entree: z.string().optional() }).optional().describe("comment engager : canal, langue, angle, fenêtre, personne d'entrée"),
      envergure: z.enum(["fr", "international"]).optional(),
      priorite: z.enum(["haute", "moyenne", "basse"]).optional(),
      voie: z.enum(["froid", "chaud"]).optional(),
      archetype: z.enum(["big_fish", "quick_win", "pepite"]).optional(),
      sujets: z.array(z.string()).optional(),
      raison_de_selection: z.string().optional(),
      etat_recherche: z.string().optional(),
      note: z.string().optional().describe("contexte de fond durable (distinct du journal)"),
      note_priorite: z.number().int().min(1).max(5).optional().describe("priorité manuelle 1-5"),
      stage: z.string().optional().describe("clé d'étape (ex. identifie, qualifie, contacte, confirme, programme, enregistre, publie) — publie = déjà invité"),
      watchlist: z.array(z.string()).optional().describe("remplace les watchlists (clés/libellés)"),
    },
    { destructiveHint: false, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      const { data: row } = await sb.from("cibles").select("kind").eq("id", target.id).single();
      const currentKind = ((row as { kind?: string } | null)?.kind ?? "personne") as string;
      const kind = a.kind ?? currentKind; // type visé après MAJ → sert à la validation

      // Validation lisible et sensible au kind (pas de violation Postgres brute).
      const { patch, rejected, allowed } = kindAwarePatch(kind, a as Record<string, unknown>);
      if (rejected.length) {
        return text({ error: `Champs non autorisés pour une ${kind} : ${rejected.join(", ")}. Champs autorisés : ${allowed.join(", ")}.` });
      }
      // Changement de type : poser kind + nettoyer les champs incompatibles
      // (sinon violation des contraintes CHECK cible_personne/entreprise_fields).
      if (a.kind && a.kind !== currentKind) {
        patch.kind = a.kind;
        if (a.kind === "entreprise") {
          // Une entreprise ne peut pas porter d'archétype ni de rôle perso.
          patch.role = null;
          patch.archetype = null;
        }
        // Vers une personne : aucun champ à nettoyer (tous les descriptifs sont permis, 0020/0021).
      }
      // Étape (Lot 7) : pose le stage_id depuis la clé d'étape du show.
      if (a.stage) {
        const { data: st } = await sb.from("stages").select("id").eq("show_id", sid).eq("key", a.stage).maybeSingle();
        if (!st) return text({ error: `Étape inconnue : ${a.stage}` });
        patch.stage_id = (st as { id: string }).id;
      }
      if (Object.keys(patch).length === 0 && a.watchlist === undefined) {
        return text({ error: "Aucun champ à mettre à jour." });
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await sb.from("cibles").update(patch).eq("id", target.id);
        if (error) return text({ error: error.message });
      }
      const modifie = Object.keys(patch);
      if (a.watchlist !== undefined) {
        const err = await setCibleWatchlists(sb, target.id, a.watchlist);
        if (err) return text({ error: err });
        modifie.push("watchlist");
      }
      return text({ ok: true, cible: target.nom, cible_id: target.id, modifie });
    }
  );

  W(
    "archive_cible",
    "Archive (ou désarchive) une cible : la sort du board prospect sans la détruire. `archive:false` pour la réactiver. À utiliser pour ranger les noms factices/placeholders ou une piste abandonnée.",
    { show: z.string(), cible: z.string().describe("nom ou id"), archive: z.boolean().optional().describe("true = archiver (défaut), false = désarchiver") },
    { destructiveHint: false, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      const archive = a.archive ?? true;
      const { error } = await sb.from("cibles").update({ archive }).eq("id", target.id);
      if (error) return text({ error: error.message });
      return text({ ok: true, cible: target.nom, archive });
    }
  );

  W(
    "delete_touche",
    "Supprime une touche du journal (ex. purger une touche de test). Recalcule la date de dernière touche de la cible. Récupérer l'id de touche via get_dossier.",
    { touche_id: z.string().describe("id de la touche à supprimer (cf. get_dossier)") },
    { destructiveHint: true, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const { data: touche } = await sb.from("touches").select("id, cible_id, contenu").eq("id", a.touche_id).maybeSingle();
      if (!touche) return text({ error: "Touche introuvable." });
      const cibleId = (touche as { cible_id: string }).cible_id;
      const { error } = await sb.from("touches").delete().eq("id", a.touche_id);
      if (error) return text({ error: error.message });
      // Le trigger ne maintient le compteur qu'à l'insertion : on recalcule la
      // dernière touche à partir des touches restantes (max date, sinon null).
      const { data: rest } = await sb
        .from("touches").select("date").eq("cible_id", cibleId)
        .order("date", { ascending: false }).limit(1);
      const last = (rest ?? [])[0] as { date: string } | undefined;
      await sb.from("cibles").update({ date_derniere_touche: last?.date ?? null }).eq("id", cibleId);
      return text({ ok: true, supprime: (touche as { contenu: string | null }).contenu, date_derniere_touche: last?.date ?? null });
    }
  );

  W(
    "validate_cible",
    "Valide une cible : bascule en épisode. Si `start_iso` est fourni, crée AUSSI l'invitation d'enregistrement complète (corps détaillé : accès Studio 71, parking, durée, contact jour J, lien fiche si générée) via le compte de service, avec les participants systématiques (staff + invité), et réserve le studio (-1h/+1h). Intentions : valider, programmer l'enregistrement, inviter l'équipe.",
    {
      show: z.string(),
      cible: z.string(),
      start_iso: z.string().optional().describe("date+heure ISO de l'enregistrement (déclenche l'invitation)"),
      duree_min: z.number().optional().describe("durée en minutes (défaut 120)"),
      lieu: z.string().optional().describe("lieu (défaut Studio 71)"),
      invite_email: z.string().optional().describe("email de l'invité à ajouter aux participants"),
      participants: z.array(z.string()).optional().describe("emails supplémentaires à inviter"),
      contact_jour_j: z.string().optional().describe("téléphone/nom du contact le jour J"),
    },
    { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: "Show introuvable" });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      const { data: episodeId, error } = await sb.rpc("validate_cible", { target_cible: target.id });
      if (error) return text({ error: error.message });

      // Sans date : simple bascule (comportement historique).
      if (!a.start_iso) return text({ ok: true, cible: target.nom, episode_id: episodeId });

      // Avec date : invitation complète via le compte de service (calendarBearer
      // prend le SA quand GOOGLE_DELEGATION_READY=true ; sinon repli provider_token
      // indisponible côté MCP → l'événement échoue proprement, la bascule reste faite).
      const start = new Date(a.start_iso);
      if (isNaN(start.getTime())) return text({ ok: true, cible: target.nom, episode_id: episodeId, invitation: "start_iso invalide, invitation ignorée." });
      // A5 — avertissement soft (non bloquant) : convention GDIY = mardi/jeudi 9h30.
      // On lit l'heure murale de la chaîne ISO (robuste au décalage horaire).
      const dow = new Date(`${a.start_iso.slice(0, 10)}T12:00:00Z`).getUTCDay(); // 0=dim..6=sam
      const hm = a.start_iso.slice(11, 16);
      const warns: string[] = [];
      if (dow !== 2 && dow !== 4) warns.push("créneau hors convention (mardi/jeudi)");
      if (hm && hm !== "09:30") warns.push("heure hors convention (9h30)");
      const avertissement = warns.length ? warns.join(" ; ") + " — vérifier le créneau." : undefined;
      const dureeMin = a.duree_min ?? 120;
      const end = new Date(start.getTime() + dureeMin * 60_000);
      const lieu = a.lieu?.trim() || DEFAULT_LIEU;

      // Lien fiche si déjà générée.
      let ficheLink: string | null = null;
      const { data: epRow } = await sb.from("episodes").select("fiche_token").eq("id", episodeId).maybeSingle();
      const ficheTok = (epRow as { fiche_token?: string | null } | null)?.fiche_token;
      if (ficheTok) ficheLink = ficheUrl(String(episodeId), ficheTok);

      const description = buildEventDescription({
        show_nom: a.show.toUpperCase(),
        invite_nom: target.nom,
        duree_min: dureeMin,
        lieu,
        contact_jour_j: a.contact_jour_j,
        fiche_url: ficheLink,
      });
      const invites = participants(a.invite_email ? [a.invite_email] : [], a.participants ?? []);

      const ev = await createCalendarEvent(null, {
        summary: `Enregistrement ${a.show.toUpperCase()} — ${target.nom}`,
        startISO: start.toISOString(),
        endISO: end.toISOString(),
        location: lieu,
        attendees: invites,
        description,
        sendInvites: true,
      });
      const patch: Record<string, unknown> = { date_enregistrement: start.toISOString() };
      if (ev.eventId) patch.gcal_event_id = ev.eventId;

      // Réservation studio (-1h/+1h) si Studio 71.
      let studioNote = "";
      if (lieu === DEFAULT_LIEU) {
        const studio = await createCalendarEvent(null, {
          summary: `Studio 71 réservé — ${target.nom}`,
          startISO: new Date(start.getTime() - 60 * 60_000).toISOString(),
          endISO: new Date(end.getTime() + 60 * 60_000).toISOString(),
          location: lieu,
          attendees: [],
          description: `Réservation studio (installation/débrief) pour ${a.show.toUpperCase()} avec ${target.nom}.`,
          sendInvites: false,
        });
        if (studio.eventId) patch.gcal_studio_event_id = studio.eventId;
        studioNote = studio.ok ? " Studio réservé (-1h/+1h)." : ` Studio : ${studio.detail}`;
      }
      await sb.from("episodes").update(patch).eq("id", episodeId);

      return text({
        ok: true,
        cible: target.nom,
        episode_id: episodeId,
        invitation: ev.ok ? `Invitation créée${studioNote}` : `Invitation non créée : ${ev.detail}`,
        event_link: ev.htmlLink,
        participants: invites,
        fiche_url: ficheLink,
        avertissement,
      });
    }
  );

  W(
    "generate_fiche",
    "Génère (ou régénère) la fiche de prep d'un épisode au format Onesta, depuis le dossier enrichi, et renvoie son lien signé. Intentions : préparer l'interview, produire la fiche invité, brief de prépa. La cible doit avoir été validée (épisode existant). Sections sans matière affichées « à alimenter ».",
    { show: z.string(), cible: z.string() },
    { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: "Show introuvable" });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });

      // Épisode le plus récent de la cible (la cible doit être validée).
      const { data: ep } = await sb
        .from("episodes")
        .select("id, date_enregistrement, gcal_event_id")
        .eq("cible_id", target.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!ep) return text({ error: "Aucun épisode pour cette cible : valider d'abord (validate_cible).", cause: "episode_absent", action: "Appeler validate_cible avant de générer la fiche." });
      const episode = ep as { id: string; date_enregistrement: string | null; gcal_event_id: string | null };

      // Dossier + dernier enrichissement abouti (pour résumé / raison / sources).
      const { data: cibleRow } = await sb.from("cibles_enrichies").select("*").eq("id", target.id).single();
      const { data: enrRow } = await sb
        .from("enrichment_jobs")
        .select("resultat")
        .eq("cible_id", target.id)
        .eq("statut", "done")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const enr = (enrRow as { resultat?: { resume?: string | null; raison_de_selection?: string | null; sources?: string[] } } | null)?.resultat ?? null;

      const data = buildFicheData({
        cible: cibleRow as unknown as CibleEnrichie,
        show_nom: a.show,
        date_enregistrement: episode.date_enregistrement,
        enrichissement: enr,
      });
      const html = generateFicheHtml(data);
      const token = await signFicheToken(episode.id);
      const { error } = await sb
        .from("episodes")
        .update({ fiche_html: html, fiche_token: token, fiche_generated_at: new Date().toISOString() })
        .eq("id", episode.id);
      if (error) return text({ error: error.message });

      // A3 — si l'invitation existe déjà, y injecter le lien fiche (sans écraser).
      const url = ficheUrl(episode.id, token);
      let event_maj: string | undefined;
      if (episode.gcal_event_id) {
        const r = await injectFicheLink(episode.gcal_event_id, url);
        event_maj = r.ok ? "lien fiche ajouté à l'invitation" : `invitation non mise à jour : ${r.detail}`;
      }

      return text({ ok: true, cible: target.nom, episode_id: episode.id, url, event_maj, detail: "Fiche générée. Sections sans matière marquées « à alimenter »." });
    }
  );

  W(
    "send_prep_email",
    "Envoie les mails de préparation d'un épisode (envoyer le brief, prévenir l'invité et le staff) depuis la boîte du show, avec les coordonnées des participants en pièce jointe (VCF) et le lien de la fiche. Deux gabarits : invité + staff. La cible doit être validée. Exige le compte de service Gmail (délégation).",
    { show: z.string(), cible: z.string(), invite_email: z.string().optional(), contact_jour_j: z.string().optional() },
    { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (a) => {
      if (!hasGmailSend()) {
        return text({ ok: false, error: "Envoi Gmail indisponible.", cause: "gmail_absent", action: "Poser GOOGLE_DELEGATION_READY=true, déléguer le scope gmail.send et définir EPISODE_SENDER (ou GOOGLE_IMPERSONATE_EMAIL)." });
      }
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: "Show introuvable" });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      const { data: showRowData } = await sb.from("shows").select("nom").eq("id", sid).maybeSingle();
      const showNom = (showRowData as { nom?: string } | null)?.nom ?? a.show;

      const { data: ep } = await sb.from("episodes").select("id, date_enregistrement, fiche_token").eq("cible_id", target.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!ep) return text({ error: "Aucun épisode : valider d'abord.", cause: "episode_absent", action: "validate_cible avant l'envoi." });
      const episode = ep as { id: string; date_enregistrement: string | null; fiche_token: string | null };
      const ficheLink = episode.fiche_token ? ficheUrl(episode.id, episode.fiche_token) : null;

      // Coordonnées de l'invité (contacts de la cible) pour le VCF et l'adresse.
      const { data: contacts } = await sb.from("contacts").select("kind, valeur").eq("cible_id", target.id);
      const rows = (contacts ?? []) as { kind: string; valeur: string }[];
      const inviteEmails = rows.filter((c) => c.kind === "email").map((c) => c.valeur);
      const invitePhones = rows.filter((c) => c.kind === "telephone").map((c) => c.valeur);
      const toInvite = (a.invite_email ?? inviteEmails[0] ?? "").trim();

      // Roster VCF : invité + staff (chacun reçoit les autres).
      const roster: VcfPerson[] = [
        { nom: target.nom, emails: inviteEmails, phones: invitePhones },
        ...staffEmails().map((e) => ({ nom: e.split("@")[0], emails: [e] } as VcfPerson)),
      ];
      const vcf = { filename: "participants.vcf", mimeType: "text/vcard", content: buildVcf(roster) };

      const dateLabel = episode.date_enregistrement ? new Date(episode.date_enregistrement).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" }) : null;
      const common = { invite_nom: target.nom, show_nom: showNom, date_label: dateLabel, lieu: DEFAULT_LIEU, fiche_url: ficheLink, contact_jour_j: a.contact_jour_j ?? null };

      // A4 — statut typé par destinataire : sent | skipped(raison) | failed(erreur).
      // Le `ok` global reflète RÉELLEMENT l'état : un envoi raté → ok:false, jamais
      // un « ok » trompeur (sinon un agent conclurait à tort que tout est parti).
      type MailStatus = { status: "sent" | "skipped" | "failed"; detail: string };
      const resultats: Record<string, MailStatus> = {};

      if (toInvite) {
        const m = buildInviteMail(common);
        const r = await sendGmail({ to: [toInvite], subject: m.subject, html: m.html, attachments: [vcf] });
        resultats.invite = r.ok ? { status: "sent", detail: `envoyé à ${toInvite}` } : { status: "failed", detail: r.detail };
      } else {
        resultats.invite = { status: "skipped", detail: "email de l'invité inconnu (préciser invite_email ou ajouter un contact email)." };
      }

      const staff = staffEmails();
      if (staff.length) {
        const m = buildStaffMail(common);
        const r = await sendGmail({ to: staff, subject: m.subject, html: m.html, attachments: [vcf] });
        resultats.staff = r.ok ? { status: "sent", detail: `envoyé à ${staff.length} destinataire(s)` } : { status: "failed", detail: r.detail };
      } else {
        resultats.staff = { status: "skipped", detail: "aucun staff (définir EPISODE_STAFF_EMAILS)." };
      }

      const anyFailed = Object.values(resultats).some((r) => r.status === "failed");
      const anySent = Object.values(resultats).some((r) => r.status === "sent");
      // On ne marque l'épisode « prep envoyée » que si au moins un envoi a réussi.
      if (anySent) await sb.from("episodes").update({ prep_sent_at: new Date().toISOString() }).eq("id", episode.id);

      return text({
        ok: !anyFailed,
        cible: target.nom,
        episode_id: episode.id,
        fiche_url: ficheLink,
        resultats,
        ...(anyFailed ? { error: "Au moins un envoi a échoué (voir resultats).", cause: "envoi_partiel" } : {}),
      });
    }
  );

  RT(
    "check_integrations",
    "Vérifie l'état des intégrations (santé) : base Postgres, Google Calendar, Gmail (envoi), Folk. Retour par intégration : ok / degraded / down + cause. À lancer avant un workflow épisode pour détecter un scope manquant ou une API désactivée sans attendre l'échec en plein envoi.",
    {},
    { readOnlyHint: true, openWorldHint: true },
    async () => {
      const sb = createServiceClient();
      // Postgres
      let postgres: { status: string; detail: string };
      try {
        const { error } = await sb.from("shows").select("id").limit(1);
        postgres = error ? { status: "down", detail: error.message } : { status: "ok", detail: "Base accessible." };
      } catch (e) {
        postgres = { status: "down", detail: e instanceof Error ? e.message : "Erreur base" };
      }
      // Folk (appel léger : groupes)
      let folk: { status: string; detail: string };
      if (!hasFolkKey()) {
        folk = { status: "degraded", detail: "FOLK_API_KEY absente." };
      } else {
        try {
          await fetchFolkGroups();
          folk = { status: "ok", detail: "Folk accessible." };
        } catch (e) {
          folk = { status: "down", detail: e instanceof Error ? e.message : "Folk injoignable" };
        }
      }
      const [calendar, gmail] = await Promise.all([checkCalendar(), checkGmail()]);
      const parts = { postgres, calendar, gmail, folk };
      const global = Object.values(parts).every((p) => p.status === "ok")
        ? "ok"
        : Object.values(parts).some((p) => p.status === "down")
          ? "down"
          : "degraded";
      return text({ ok: global !== "down", global, integrations: parts });
    }
  );

  RT(
    "show_stats",
    "Statistiques d'un show, SÉPARÉES closing (étapes jusqu'à l'étape finale incluse) et production (étapes après). Renvoie la distribution par étape, gagné/en cours, taux de closing, pipeline de production, archivées, et un résumé des issues de touches (feedback score).",
    { show: z.string() },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const [{ data: stages }, { data: rows }, { data: cibleIdsRows }] = await Promise.all([
        sb.from("stages").select("*").eq("show_id", sid).order("position"),
        sb.from("cibles_enrichies").select("stage_key, stage_position, archive").eq("show_id", sid),
        sb.from("cibles").select("id").eq("show_id", sid),
      ]);
      const stats = computeShowStats(
        (stages ?? []) as Stage[],
        (rows ?? []) as { stage_key: string | null; stage_position: number | null; archive: boolean }[]
      );

      // Feedback (S7) : issues des touches renseignées. Base du tuning de septembre.
      const ids = ((cibleIdsRows ?? []) as { id: string }[]).map((c) => c.id);
      const feedback = { reponse_positive: 0, reponse_negative: 0, silence: 0, avance_stage: 0, taux_reponse: null as number | null };
      if (ids.length) {
        const { data: touches } = await sb.from("touches").select("resultat").in("cible_id", ids).not("resultat", "is", null);
        for (const t of (touches ?? []) as { resultat: keyof typeof feedback }[]) {
          if (t.resultat in feedback) (feedback[t.resultat] as number)++;
        }
        const renseignees = feedback.reponse_positive + feedback.reponse_negative + feedback.silence + feedback.avance_stage;
        if (renseignees > 0) feedback.taux_reponse = Math.round(((feedback.reponse_positive + feedback.avance_stage) / renseignees) * 100);
      }

      return text({ ...stats, feedback_touches: feedback });
    }
  );

  W(
    "sync_google_contacts",
    "Synchronise les cibles (non archivées, non factices) et les relais d'un show vers Google Contacts, par lots (les non synchronisées d'abord). Relancer tant que `restants > 0`. ⚠️ `dry_run` vaut TRUE par défaut (simulation, aucune écriture) : passer `dry_run:false` pour écrire réellement. Seules les coordonnées vérifiées sont poussées (sauf `inclure_non_verifies:true`). Magellan reste la source de vérité ; sans doublon, groupés par show et par watchlist.",
    {
      show: z.string(),
      limit: z.number().optional().describe("taille de lot (défaut 150)"),
      dry_run: z.boolean().optional().describe("simulation sans écriture — défaut TRUE ; passer false pour écrire"),
      inclure_non_verifies: z.boolean().optional().describe("pousser aussi les coordonnées non vérifiées (défaut false)"),
    },
    { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const { data: show } = await sb.from("shows").select("id, nom").eq("id", sid).single();
      if (!show) return text({ error: "Show introuvable" });
      if (!hasGoogleSync()) {
        return text({
          ok: false,
          error: "Synchronisation Google Contacts non configurée.",
          cause: "google_absent",
          action: "Poser le compte de service (GOOGLE_SA_KEY) et déléguer le scope contacts sur le domaine, puis réessayer.",
        });
      }
      try {
        const res = await syncShowContacts(
          sb,
          { id: show.id, nom: show.nom },
          Math.min(a.limit ?? 150, 200),
          a.dry_run ?? true,
          a.inclure_non_verifies ?? false
        );
        return text(res);
      } catch (e) {
        return text({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          cause: "google_echec",
          action: "Vérifier la délégation de domaine et le scope People/contacts du compte de service (impersonation valide).",
        });
      }
    }
  );

  W(
    "enrich_cible",
    "Lance un enrichissement ASYNCHRONE (rechercher des infos en ligne, sourcer un profil, actualité récente, trouver des coordonnées) : insère un job et rend la main en < 1 s (aucun timeout). Traité en tâche de fond en ~1-2 min. Suivre via get_dossier (bloc dernier_enrichissement). `objectif` : profil (défaut) ou contact (coordonnées). apply=true écrit le résultat (NON destructif) à l'aboutissement (exige le rôle admin).",
    { show: z.string(), cible: z.string(), apply: z.boolean().optional(), objectif: z.enum(["profil", "contact"]).optional().describe("profil (défaut) ou contact (coordonnées)") },
    { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      if (!hasAnthropicKey())
        return text({ error: "Clé IA absente : ajouter ANTHROPIC_API_KEY sur Vercel pour activer l'enrichissement." });
      const { data: job, error } = await sb
        .from("enrichment_jobs")
        .insert({ cible_id: target.id, objectif: a.objectif ?? "profil", apply: a.apply ?? false })
        .select("id")
        .single();
      if (error || !job) return text({ error: error?.message ?? "Échec de mise en file." });
      kickQueue(); // draine en tâche de fond (plan Hobby : pas de cron par minute)
      return text({ ok: true, cible: target.nom, job_id: (job as { id: string }).id, statut: "pending", detail: "Enrichissement lancé — résultat dans ~1-2 min (get_dossier → dernier_enrichissement)." });
    }
  );

  W(
    "enrich_colonne",
    "Met en file un enrichissement ASYNCHRONE pour plusieurs cibles d'un show (filtrées par archétype / watchlist / étape). Insère les jobs et rend la main immédiatement ; le cron les traite. `limit` (défaut 25, max 50). apply=true écrit (NON destructif) à l'aboutissement.",
    {
      show: z.string(),
      archetype: z.enum(["big_fish", "quick_win", "pepite"]).optional(),
      watchlist: z.string().optional(),
      stage_key: z.string().optional(),
      limit: z.number().optional(),
      apply: z.boolean().optional(),
    },
    { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const cap = Math.min(a.limit ?? 25, 50);
      let q = sb.from("cibles_enrichies").select("id").eq("show_id", sid).eq("archive", false);
      if (a.archetype) q = q.eq("archetype", a.archetype);
      if (a.stage_key) q = q.eq("stage_key", a.stage_key);
      if (a.watchlist) {
        const { ids, unknown } = await resolveWatchlistIds(sb, [a.watchlist]);
        if (unknown.length) return text({ error: `Watchlist inconnue : ${a.watchlist}` });
        const { data: links } = await sb.from("cible_watchlists").select("cible_id").eq("watchlist_id", ids[0]);
        const cibleIds = (links ?? []).map((l) => l.cible_id as string);
        q = q.in("id", cibleIds.length ? cibleIds : ["00000000-0000-0000-0000-000000000000"]);
      }
      const { data } = await q.limit(cap);
      const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
      if (!ids.length) return text({ ok: true, en_file: 0, detail: "Aucune cible ne correspond." });
      const { error } = await sb.from("enrichment_jobs").insert(ids.map((cible_id) => ({ cible_id, objectif: "profil", apply: a.apply ?? false })));
      if (error) return text({ error: error.message });
      kickQueue(); // draine en tâche de fond ; le reste part au fil des appels/lectures
      return text({ ok: true, en_file: ids.length, detail: "Jobs d'enrichissement en file — traités en tâche de fond (quelques-uns par appel). Suivre via get_dossier." });
    }
  );
}
