// Outils exposés au connecteur MCP (lecture + écriture), via le client service.
// Mêmes capacités que le copilote intégré, pour l'app Claude.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CibleEnrichie } from "../types";
import { createServiceClient } from "../supabase/service";
import { folkAddAlly, folkAddPhone, folkLogTouche } from "../folk/write";
import { syncShowContacts } from "../google/sync";
import { enrichCibleProfile, applyProfileProposal } from "../enrichment/profile";
import { computeCibleScore, estivalActif, type ScoreInput } from "../domain";
import { computeShowStats } from "../stats";
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

const PERSONNE_ONLY = ["role", "organisation", "archetype"] as const;
// raison_de_selection / etat_recherche restent réservés aux entreprises (workflow recherche) ;
// secteur / pays / envergure sont désormais partagés (cf. migration 0020).
const ENTREPRISE_ONLY = ["raison_de_selection", "etat_recherche"] as const;
const SHARED_FIELDS = ["nom", "priorite", "voie", "sujets", "note", "note_priorite", "canal_reel", "via_qui", "ville", "photo_url", "secteur", "pays", "envergure"] as const;

/**
 * Construit un patch de cible selon le kind (personne/entreprise) et signale les
 * champs refusés (illégaux pour ce kind) — pour une erreur lisible plutôt qu'une
 * violation de contrainte Postgres brute.
 */
function kindAwarePatch(kind: string, a: Record<string, unknown>): { patch: Record<string, unknown>; rejected: string[]; allowed: string[] } {
  const allowed = [...SHARED_FIELDS, ...(kind === "personne" ? PERSONNE_ONLY : ENTREPRISE_ONLY)];
  const forbidden = (kind === "personne" ? ENTREPRISE_ONLY : PERSONNE_ONLY) as readonly string[];
  const patch: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const f of forbidden) if (a[f] !== undefined) rejected.push(f);
  for (const f of allowed) if (a[f] !== undefined) patch[f] = a[f];
  return { patch, rejected, allowed: [...allowed] };
}

/** Course une promesse contre un délai ; renvoie null si le délai est dépassé. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

/** Exécute fn sur items avec une concurrence bornée (évite le timeout 60s). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function registerMagellanTools(server: McpServer) {
  server.tool("list_shows", "Liste les shows (podcasts) et leurs étapes.", {}, { readOnlyHint: true }, async () => {
    const sb = createServiceClient();
    const { data } = await sb.from("shows").select("*, stages(key, label, position, is_final)").order("nom");
    return text(data);
  });

  server.tool(
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

  server.tool(
    "find_cible",
    "Cherche une cible par nom dans un show et renvoie id + résumé. À utiliser pour vérifier l'existence d'une personne sans tirer toute la liste.",
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

  server.tool(
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
      return text({ cible: c.data, appuis: appuisWithContacts, touches: touches.data, signals: signals.data, contacts: contacts.data });
    }
  );

  server.tool(
    "create_cible",
    "Crée et qualifie une cible (si absente). Le kind (personne/entreprise) découle du show ; les champs sont validés selon le kind.",
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
      envergure: z.enum(["fr", "international"]).optional(),
      priorite: z.enum(["haute", "moyenne", "basse"]).optional(),
      voie: z.enum(["froid", "chaud"]).optional(),
      sujets: z.array(z.string()).optional(),
      raison_de_selection: z.string().optional(),
      etat_recherche: z.string().optional(),
      note: z.string().optional().describe("contexte de fond durable"),
      note_priorite: z.number().int().min(1).max(5).optional().describe("priorité manuelle 1-5"),
      watchlist: z.array(z.string()).optional().describe("clés/libellés (ex. ['cac40'])"),
    },
    { destructiveHint: false, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const show = await showRow(sb, a.show);
      if (!show) return text({ error: "Show introuvable" });
      const kind = show.type_pipe === "invites" ? "personne" : "entreprise";
      const { patch, rejected, allowed } = kindAwarePatch(kind, a as Record<string, unknown>);
      if (rejected.length) {
        return text({ error: `Champs non autorisés pour une ${kind} : ${rejected.join(", ")}. Champs autorisés : ${allowed.join(", ")}.` });
      }
      const c = await ensureCible(sb, show, a.nom);
      if (!c) return text({ error: "Création échouée" });
      delete patch.nom; // déjà posé par ensureCible
      if (Object.keys(patch).length) await sb.from("cibles").update(patch).eq("id", c.id);
      if (a.watchlist) {
        const err = await setCibleWatchlists(sb, c.id, a.watchlist);
        if (err) return text({ error: err });
      }
      return text({ ok: true, cible: c, applique: Object.keys(patch), watchlist: a.watchlist });
    }
  );

  server.tool(
    "add_appui",
    "Ajoute un allié/appui à une cible (relié à sa fiche si l'allié est une cible). Crée la cible visée si besoin. MAJ Folk.",
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
    { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const show = await showRow(sb, a.show);
      if (!show) return text({ error: "Show introuvable" });
      const target = await ensureCible(sb, show, a.cible);
      if (!target) return text({ error: "Cible introuvable" });
      let ally = await resolveCible(sb, show.id, a.allie);
      if (!ally && a.creer_allie_comme_cible) ally = await ensureCible(sb, show, a.allie);
      const est_relais = a.est_relais ?? false;
      const { data: appui, error } = await sb
        .from("appuis")
        .insert({
          cible_id: target.id,
          nom: a.allie,
          nature: a.nature ?? a.type ?? "ancien_invite",
          est_relais,
          note: a.note ?? null,
          ally_cible_id: ally?.id ?? null,
        })
        .select("id")
        .single();
      if (error || !appui) return text({ error: error?.message ?? "Échec création appui" });
      // Règle transverse : un relais qui ouvre la porte → voie chaud par défaut.
      if (est_relais) await sb.from("cibles").update({ voie: "chaud" }).eq("id", target.id);
      // Coordonnées portées par l'appui (le relais est joint en premier).
      const coords = [
        a.telephone ? { appui_id: appui.id, kind: "telephone", valeur: a.telephone, source: "Claude", confiance: 4 } : null,
        a.email ? { appui_id: appui.id, kind: "email", valeur: a.email, source: "Claude", confiance: 4 } : null,
      ].filter(Boolean) as { appui_id: string; kind: string; valeur: string; source: string; confiance: number }[];
      if (coords.length) await sb.from("contacts").insert(coords);
      const folk = await folkAddAlly(target.nom, a.allie, a.note);
      return text({ ok: true, cible: target.nom, allie: a.allie, relais: est_relais, voie: est_relais ? "chaud" : undefined, coordonnees: coords.length, lie: !!ally, folk: folk.detail });
    }
  );

  server.tool(
    "add_contact",
    "Ajoute un contact à une cible (email/téléphone/réseau…). MAJ Folk pour un téléphone.",
    {
      show: z.string(),
      cible: z.string(),
      kind: z.enum(["email", "telephone", "reseau", "agence", "site", "autre"]),
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
      if (a.kind === "telephone") folk = (await folkAddPhone(target.nom, a.valeur)).detail;
      return text({ ok: true, cible: target.nom, folk });
    }
  );

  server.tool(
    "log_touche",
    "Logge une touche sur une cible (remet le compteur à zéro). `date` optionnelle pour antidater une touche réelle (ISO, ex. 2026-01-07).",
    { show: z.string(), cible: z.string(), contenu: z.string(), canal: z.string().optional(), date: z.string().optional().describe("date ISO de la touche (défaut : maintenant)") },
    { destructiveHint: false, idempotentHint: false, openWorldHint: true },
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
      });
      if (error) return text({ error: error.message });
      const folk = await folkLogTouche(target.nom, a.contenu, a.canal);
      return text({ ok: true, cible: target.nom, folk: folk.detail });
    }
  );

  server.tool(
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
          patch.role = null;
          patch.archetype = null;
        } else {
          // secteur/pays/envergure restent valides sur une personne (0020) ;
          // seuls les champs de workflow recherche sont incompatibles.
          patch.raison_de_selection = null;
          patch.etat_recherche = null;
        }
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
      return text({ ok: true, cible: target.nom, modifie });
    }
  );

  server.tool(
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

  server.tool(
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

  server.tool(
    "validate_cible",
    "Valide une cible : bascule en épisode avec son contexte.",
    { show: z.string(), cible: z.string() },
    { destructiveHint: false, idempotentHint: false },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: "Show introuvable" });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      const { data, error } = await sb.rpc("validate_cible", { target_cible: target.id });
      return error ? text({ error: error.message }) : text({ ok: true, cible: target.nom, episode_id: data });
    }
  );

  server.tool(
    "show_stats",
    "Statistiques d'un show, SÉPARÉES closing (étapes jusqu'à l'étape finale incluse) et production (étapes après). Renvoie la distribution par étape, le nombre gagné/en cours, le taux de closing, le pipeline de production et le nombre d'archivées.",
    { show: z.string() },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const [{ data: stages }, { data: rows }] = await Promise.all([
        sb.from("stages").select("*").eq("show_id", sid).order("position"),
        sb.from("cibles_enrichies").select("stage_key, stage_position, archive").eq("show_id", sid),
      ]);
      const stats = computeShowStats(
        (stages ?? []) as Stage[],
        (rows ?? []) as { stage_key: string | null; stage_position: number | null; archive: boolean }[]
      );
      return text(stats);
    }
  );

  server.tool(
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
      const res = await syncShowContacts(
        sb,
        { id: show.id, nom: show.nom },
        Math.min(a.limit ?? 150, 200),
        a.dry_run ?? true,
        a.inclure_non_verifies ?? false
      );
      return text(res);
    }
  );

  server.tool(
    "enrich_cible",
    "Enrichit une fiche par recherche web sourcée (rôle, organisation, secteur, réseaux sociaux, sujets, angle d'épisode). apply=true pour écrire la proposition ; sinon propose seulement (à valider).",
    { show: z.string(), cible: z.string(), apply: z.boolean().optional() },
    { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      const { data: row } = await sb.from("cibles_enrichies").select("*").eq("id", target.id).single();
      if (!row) return text({ error: "Cible introuvable" });
      try {
        const proposal = await withTimeout(enrichCibleProfile(row as CibleEnrichie), 45_000);
        if (!proposal) return text({ error: "Enrichissement indisponible (clé IA absente, délai dépassé, ou rien trouvé)." });
        let applied: string[] | undefined;
        if (a.apply) applied = await applyProfileProposal(sb, row as CibleEnrichie, proposal);
        return text({ ok: true, cible: target.nom, proposition: proposal, applied });
      } catch (e) {
        // Surface la vraie cause (ex. violation de contrainte) au lieu d'un crash opaque.
        return text({ error: `Échec enrichissement : ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  );

  server.tool(
    "enrich_colonne",
    "Enrichit plusieurs cibles d'un show (filtrées par archétype / watchlist / étape) par recherche web sourcée. Borné par `limit` (défaut 4, max 6) pour tenir dans le délai serveur. Robuste : chaque cible a son propre délai (un échec/timeout n'interrompt pas le lot). apply=true écrit de façon NON DESTRUCTIVE (préserve la saisie manuelle, fusionne les sujets).",
    {
      show: z.string(),
      archetype: z.enum(["big_fish", "quick_win", "pepite"]).optional(),
      watchlist: z.string().optional(),
      stage_key: z.string().optional(),
      limit: z.number().optional(),
      apply: z.boolean().optional(),
    },
    { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const cap = Math.min(a.limit ?? 4, 6);
      let q = sb.from("cibles_enrichies").select("*").eq("show_id", sid).eq("archive", false);
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
      const rows = (data ?? []) as CibleEnrichie[];

      // Chaque cible : délai par cible (22 s) + try/catch isolé ; concurrence
      // bornée à 3. Un échec/timeout ne fait pas tomber tout le lot.
      const PER_CIBLE_MS = 22_000;
      const resultats = await mapLimit(rows, 3, async (row) => {
        try {
          const proposal = await withTimeout(enrichCibleProfile(row), PER_CIBLE_MS);
          if (!proposal) return { cible: row.nom, ok: false, erreur: "délai dépassé ou rien trouvé" };
          let applied: string[] | undefined;
          if (a.apply) applied = await applyProfileProposal(sb, row, proposal);
          return { cible: row.nom, ok: true, applied, proposition: a.apply ? undefined : proposal };
        } catch (e) {
          return { cible: row.nom, ok: false, erreur: e instanceof Error ? e.message : String(e) };
        }
      });
      const reussies = resultats.filter((r) => r.ok).length;
      return text({
        ok: true,
        traitees: rows.length,
        reussies,
        echecs: rows.length - reussies,
        plafond: cap,
        note: rows.length === cap ? "Plafond atteint — relance pour la suite." : undefined,
        resultats,
      });
    }
  );
}
