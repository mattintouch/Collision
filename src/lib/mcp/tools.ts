// Outils exposés au connecteur MCP (lecture + écriture), via le client service.
// Mêmes capacités que le copilote intégré, pour l'app Claude.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CibleEnrichie } from "../types";
import { createServiceClient } from "../supabase/service";
import { folkAddAlly, folkAddPhone, folkLogTouche } from "../folk/write";
import { syncShowContacts } from "../google/sync";
import { enrichCibleProfile, applyProfileProposal } from "../enrichment/profile";

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
const ENTREPRISE_ONLY = ["secteur", "pays", "envergure", "raison_de_selection", "etat_recherche"] as const;
const SHARED_FIELDS = ["nom", "priorite", "voie", "sujets", "note", "note_priorite", "canal_reel", "via_qui"] as const;

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

export function registerMagellanTools(server: McpServer) {
  server.tool("list_shows", "Liste les shows (podcasts) et leurs étapes.", {}, { readOnlyHint: true }, async () => {
    const sb = createServiceClient();
    const { data } = await sb.from("shows").select("*, stages(key, label, position, is_final)").order("nom");
    return text(data);
  });

  server.tool(
    "list_cibles",
    "Liste les cibles d'un show, enrichies (résurgence, jours depuis touche, signal, appuis).",
    {
      show: z.string().describe("slug (gdiy, ccg, fleurons) ou id"),
      voie: z.enum(["froid", "chaud"]).optional(),
      archetype: z.enum(["big_fish", "quick_win", "pepite"]).optional(),
      stage_key: z.string().optional(),
      kind: z.enum(["personne", "entreprise"]).optional(),
      secteur: z.string().optional(),
      pays: z.string().optional(),
      envergure: z.enum(["fr", "international"]).optional(),
      sujet: z.string().optional().describe("cibles dont les sujets contiennent cette valeur"),
      watchlist: z.string().optional().describe("clé ou libellé (ex. cac40) — cibles appartenant à cette watchlist"),
      q: z.string().optional().describe("filtre par nom (recherche partielle)"),
      limit: z.number().optional().describe("nombre max de cibles (défaut 50)"),
      full: z.boolean().optional().describe("true = toutes les colonnes ; défaut = projection compacte"),
    },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      // Projection compacte par défaut (éviter de tirer des centaines de lignes complètes).
      const COMPACT =
        "id, nom, kind, role, organisation, secteur, pays, voie, priorite, archetype, stage_key, jours_depuis_touche, signal_frais, nb_appuis, watchlist_keys";
      let q = sb.from("cibles_enrichies").select(a.full ? "*" : COMPACT).eq("show_id", sid);
      if (a.voie) q = q.eq("voie", a.voie);
      if (a.archetype) q = q.eq("archetype", a.archetype);
      if (a.stage_key) q = q.eq("stage_key", a.stage_key);
      if (a.kind) q = q.eq("kind", a.kind);
      if (a.secteur) q = q.eq("secteur", a.secteur);
      if (a.pays) q = q.eq("pays", a.pays);
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
      q = q.limit(Math.min(a.limit ?? 50, 200));
      const { data, error } = await q;
      return error ? text({ error: error.message }) : text(data);
    }
  );

  server.tool(
    "find_cible",
    "Cherche une cible par nom dans un show et renvoie id + résumé. À utiliser pour vérifier l'existence d'une personne sans tirer toute la liste.",
    { show: z.string(), query: z.string().describe("nom ou fragment de nom") },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const { data, error } = await sb
        .from("cibles_enrichies")
        .select("id, nom, kind, role, organisation, secteur, pays, stage_key, archetype")
        .eq("show_id", sid)
        .ilike("nom", `%${a.query}%`)
        .limit(15);
      if (error) return text({ error: error.message });
      return text({ count: (data ?? []).length, cibles: data });
    }
  );

  server.tool(
    "get_dossier",
    "Dossier complet d'une cible : champs, appuis, journal, signaux, contacts.",
    { cible_id: z.string() },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      const [c, appuisRes, touches, signals, contacts] = await Promise.all([
        sb.from("cibles_enrichies").select("*").eq("id", a.cible_id).maybeSingle(),
        sb.from("appuis").select("*").eq("cible_id", a.cible_id),
        sb.from("touches").select("*").eq("cible_id", a.cible_id).order("date", { ascending: false }),
        sb.from("signals").select("*").eq("cible_id", a.cible_id).order("date", { ascending: false }),
        sb.from("contacts").select("*").eq("cible_id", a.cible_id),
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
      nom: z.string().optional().describe("renommer la cible"),
      role: z.string().optional(),
      organisation: z.string().optional(),
      secteur: z.string().optional(),
      pays: z.string().optional(),
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
      const kind = ((row as { kind?: string } | null)?.kind ?? "personne") as string;

      // Validation lisible et sensible au kind (pas de violation Postgres brute).
      const { patch, rejected, allowed } = kindAwarePatch(kind, a as Record<string, unknown>);
      if (rejected.length) {
        return text({ error: `Champs non autorisés pour une ${kind} : ${rejected.join(", ")}. Champs autorisés : ${allowed.join(", ")}.` });
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
    "sync_google_contacts",
    "Synchronise les cibles (non archivées) et les relais d'un show vers Google Contacts, par lots (les non synchronisées d'abord). Relancer tant que `restants > 0`. Magellan reste la source de vérité ; sans doublon, groupés par show et par watchlist.",
    {
      show: z.string(),
      limit: z.number().optional().describe("taille de lot (défaut 150)"),
      dry_run: z.boolean().optional().describe("simulation : compte sans rien écrire dans Google"),
    },
    { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const { data: show } = await sb.from("shows").select("id, nom").eq("id", sid).single();
      if (!show) return text({ error: "Show introuvable" });
      const res = await syncShowContacts(sb, { id: show.id, nom: show.nom }, Math.min(a.limit ?? 150, 200), a.dry_run ?? false);
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
      const proposal = await enrichCibleProfile(row as CibleEnrichie);
      if (!proposal) return text({ error: "Enrichissement indisponible (clé IA absente ou rien trouvé)." });
      let applied: string[] | undefined;
      if (a.apply) {
        const r = row as { kind: string; note: string | null };
        applied = await applyProfileProposal(sb, { id: target.id, kind: r.kind, note: r.note }, proposal);
      }
      return text({ ok: true, cible: target.nom, proposition: proposal, applied });
    }
  );

  server.tool(
    "enrich_colonne",
    "Enrichit plusieurs cibles d'un show (filtrées par archétype / watchlist / étape) par recherche web sourcée. Borné par `limit` (défaut 5, max 8). apply=true pour écrire.",
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
      const cap = Math.min(a.limit ?? 5, 8);
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
      const resultats = await Promise.all(
        rows.map(async (row) => {
          const proposal = await enrichCibleProfile(row);
          if (!proposal) return { cible: row.nom, ok: false };
          let applied: string[] | undefined;
          if (a.apply) applied = await applyProfileProposal(sb, { id: row.id, kind: row.kind, note: row.note }, proposal);
          return { cible: row.nom, ok: true, applied, proposition: a.apply ? undefined : proposal };
        })
      );
      return text({ ok: true, traitees: rows.length, plafond: cap, note: rows.length === cap ? "Plafond atteint — relance pour la suite." : undefined, resultats });
    }
  );
}
