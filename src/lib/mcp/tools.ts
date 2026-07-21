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
import { etatBudgetLecture, setBudgetOverride, ventilationMois } from "../ai/cout";
import { computeEligibilite, evaluerCouverture } from "../editorial";
import { computeCibleScore, computeResurgence, estivalActif, type ScoreInput } from "../domain";
import { computeShowStats } from "../stats";
import { kindAwarePatch, mapKindConstraintError } from "./kind";
import { kickQueue } from "../enrichment/jobs";
import { ficheUrl, baseUrl } from "../fiche/token";
import { FICHE_SECTIONS, SECTIONS_OBLIGATOIRES, canonicalSectionId } from "../fiche/sections";
import { SECTION_CONTRACTS, isEmptyContent } from "../fiche/schema";
import {
  FICHE_STATUTS,
  resolveFiche,
  ensureFiche,
  ficheSections,
  fichesOverview,
  writeSection,
  type FicheRow,
} from "../fiche/store";
import { suggestQuestionsReseaux, type GuestContext } from "../fiche/questions";
import { FICHE_GROUPES, FICHE_JOB_PREFIX, enqueueFicheGeneration, type FicheGroupe } from "../fiche/generation";
import { createCalendarEvent, deleteCalendarEvent, injectFicheLink, checkCalendar } from "../calendar";
import { buildEventDescription, participants, staffEmails, DEFAULT_LIEU, DEFAULT_DUREE_MIN, DEFAULT_CONTACTS_JOUR_J } from "../episode/invitation";
import { buildInviteMail, buildStaffMail, type MailLang } from "../episode/prep-mail";
import { sendGmail, hasGmailSend, gmailSender } from "../gmail";
import { buildVcard, isUsefulCard, vcfFileName, type VcfPerson } from "../vcf";
import type { Stage, StaffMember } from "../types";

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
const DESTRUCTIVE_TOOLS = new Set(["delete_appui", "delete_touche", "archive_cible", "sync_google_contacts", "cancel_episode", "budget_override"]);

/** Scope requis pour un outil d'écriture donné, selon l'appel. */
export function requiredScope(name: string, args: unknown): "write" | "admin" {
  if (DESTRUCTIVE_TOOLS.has(name)) return "admin";
  // enrich_* avec apply=true écrit la fiche → admin ; en simple recherche → write.
  if ((name === "enrich_cible" || name === "enrich_colonne") && (args as { apply?: boolean } | null)?.apply === true) return "admin";
  return "write";
}

/** A6 — ids des cibles de test d'un show (à exclure des stats/score/sélection).
 *  Défensif : colonne is_test absente → ensemble vide. */
async function testCibleIds(sb: SB, showId: string): Promise<Set<string>> {
  try {
    const { data, error } = await sb.from("cibles").select("id").eq("show_id", showId).eq("is_test", true);
    if (error) return new Set();
    return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  } catch {
    return new Set();
  }
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
  // Chantier 1 : Vadim et l'équipe peuvent poser une demande produit.
  // Aucun autre droit d'écriture ajouté (garde-fou du brief §2.6).
  "feedback",
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
      const tests = await testCibleIds(sb, sid); // A6 : hors cibles de test
      // Slug du show pour les critères d'éligibilité écrits (chantier 4 §5.1).
      const { data: showRow } = await sb.from("shows").select("slug").eq("id", sid).maybeSingle();
      const showSlug = (showRow as { slug?: string } | null)?.slug ?? String(a.show);
      const scored = rows
        .map((r) => ({ r, s: computeCibleScore(r as unknown as ScoreInput, estival) }))
        .filter((x) => !x.s.placeholder && !(x.r.stage_key && WON.has(x.r.stage_key)) && !snoozed.has(x.r.id) && !tests.has(x.r.id))
        .sort((x, y) => y.s.score - x.s.score)
        .slice(0, Math.min(a.limit ?? 5, 10));
      const cibles = scored.map(({ r, s }) => {
        const res = computeResurgence(r);
        // Indicateur d'éligibilité DISTINCT du score (cas Belkaid §5) : il
        // signale, il n'exclut pas ; la décision éditoriale reste humaine.
        const elig = computeEligibilite(showSlug, r);
        return {
          id: r.id,
          nom: r.nom,
          score: s.score,
          badges: elig.indicateur === "eligible" ? s.badges : [...s.badges, elig.indicateur === "hors_ligne" ? "hors ligne éditoriale" : "éligibilité à vérifier"],
          eligibilite: elig.indicateur,
          eligibilite_raisons: elig.indicateur === "eligible" ? undefined : elig.raisons,
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
      // Besoins éditoriaux ouverts (§5.3) : un besoin couvert par moins de deux
      // cibles actionnables remonte en alerte dans la réponse du daily five.
      const couverture = await evaluerCouverture(sb, sid, estival);
      const besoins_en_alerte = couverture
        .filter((b) => b.alerte)
        .map((b) => ({
          id: b.besoin.id,
          contrainte: b.besoin.contrainte,
          periode: b.besoin.periode,
          candidates: b.candidates === null ? "critères non automatisables : évaluer à la main" : b.candidates,
        }));
      kickQueue(); // draine la file d'enrichissement en tâche de fond (plan Hobby)
      return text({ ok: true, show: a.show, cibles, ...(besoins_en_alerte.length ? { besoins_en_alerte } : {}) });
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
      is_test: z.boolean().optional().describe("cible de test : exclue des stats, du score et de la sélection du jour"),
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
      // Transparence : create_cible réutilise un homonyme existant (même archivé)
      // au lieu d'échouer. On détecte l'état AVANT pour l'annoncer (reused/was_archived).
      const pre = await resolveCible(sb, show.id, a.nom);
      let was_archived = false;
      if (pre) {
        const { data: preRow } = await sb.from("cibles").select("archive").eq("id", pre.id).maybeSingle();
        was_archived = !!(preRow as { archive?: boolean } | null)?.archive;
      }
      const c = await ensureCible(sb, show, a.nom);
      if (!c) return text({ error: "Création échouée" });
      delete patch.nom; // déjà posé par ensureCible
      if (a.is_test !== undefined) patch.is_test = a.is_test; // A6 (hors kindAwarePatch)
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
        reused: !!pre,
        was_archived,
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
      is_test: z.boolean().optional().describe("marque/démarque une cible de test (exclue des stats/score/sélection)"),
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
      if (a.is_test !== undefined) patch.is_test = a.is_test; // A6 (hors kindAwarePatch)
      if (Object.keys(patch).length === 0 && a.watchlist === undefined) {
        return text({ error: "Aucun champ à mettre à jour." });
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await sb.from("cibles").update(patch).eq("id", target.id);
        if (error) return text({ error: mapKindConstraintError(error.message) ?? error.message });
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
      duree_min: z.number().optional().describe("durée en minutes (défaut 180, « environ 3 h »)"),
      lieu: z.string().optional().describe("lieu (défaut Studio 71)"),
      invite_email: z.string().optional().describe("email de l'invité à ajouter aux participants"),
      participants: z.array(z.string()).optional().describe("emails supplémentaires à inviter"),
      contact_jour_j: z.string().optional().describe("contact jour J (défaut : Clémence + Matéo, enregistrés)"),
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
      const dureeMin = a.duree_min ?? DEFAULT_DUREE_MIN;
      const end = new Date(start.getTime() + dureeMin * 60_000);
      const lieu = a.lieu?.trim() || DEFAULT_LIEU;

      // Lien fiche : la fiche STRUCTURÉE (/fiches/{slug}, accès team) si elle
      // existe, sinon l'ancien lien signé de l'épisode.
      let ficheLink: string | null = null;
      const { data: fRow } = await sb.from("fiches").select("slug").eq("cible_id", target.id).maybeSingle();
      if ((fRow as { slug?: string } | null)?.slug) {
        ficheLink = fichePageUrl((fRow as { slug: string }).slug);
      } else {
        const { data: epRow } = await sb.from("episodes").select("fiche_token").eq("id", episodeId).maybeSingle();
        const ficheTok = (epRow as { fiche_token?: string | null } | null)?.fiche_token;
        if (ficheTok) ficheLink = ficheUrl(String(episodeId), ficheTok);
      }

      // Langue de l'invitation : déduite du playbook de la cible (invité anglophone).
      const { data: pbRow } = await sb.from("cibles").select("playbook").eq("id", target.id).maybeSingle();
      const pbLang = String(((pbRow as { playbook?: { langue?: string } } | null)?.playbook?.langue) ?? "").toLowerCase();
      const description = buildEventDescription({
        show_nom: a.show.toUpperCase(),
        invite_nom: target.nom,
        duree_min: dureeMin,
        lieu,
        contact_jour_j: a.contact_jour_j,
        fiche_url: ficheLink,
      }, pbLang.startsWith("en") ? "en" : "fr");
      // Staff par show (config DB) sinon repli env.
      const { data: scfg } = await sb.from("shows").select("staff").eq("id", sid).maybeSingle();
      const cfgStaff = (((scfg as { staff?: StaffMember[] } | null)?.staff) ?? []).map((s) => s.email).filter((e) => e?.includes("@"));
      const invites = participants(a.invite_email ? [a.invite_email] : [], a.participants ?? [], cfgStaff.length ? cfgStaff : undefined);

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

      // Déclenchement AUTOMATIQUE de la génération de fiche (brief §10, tranché
      // par l'usage : plus personne ne lance à la main). Best-effort, jamais
      // bloquant pour la validation.
      let ficheAuto: string | undefined;
      try {
        const { fiche } = await ensureFiche(sb, { show_id: sid, cible_id: target.id, invite_nom: target.nom, date_enregistrement: start.toISOString() });
        if (fiche.statut !== "verrouillee") {
          const n = await enqueueFicheGeneration(sb, target.id);
          kickQueue();
          ficheAuto = `fiche ${fichePageUrl(fiche.slug)} — génération lancée (${n} recherche(s) en file)`;
        }
      } catch (e) {
        ficheAuto = `génération non lancée : ${e instanceof Error ? e.message : String(e)}`;
      }

      return text({
        ok: true,
        cible: target.nom,
        episode_id: episodeId,
        invitation: ev.ok ? `Invitation créée${studioNote}` : `Invitation non créée : ${ev.detail}`,
        event_link: ev.htmlLink,
        participants: invites,
        fiche_url: ficheLink,
        fiche_generation: ficheAuto,
        avertissement,
      });
    }
  );

  W(
    "cancel_episode",
    "Annule un ou des épisodes : supprime l'invitation Google Calendar et la réservation studio (les invités sont prévenus), puis retire l'épisode. Passer `episode_id` (précis) OU `cible` (annule tous ses épisodes). À utiliser pour effacer une invitation devenue fantôme.",
    { show: z.string(), cible: z.string().optional(), episode_id: z.string().optional() },
    { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: "Show introuvable" });

      // Épisodes visés : par id précis, ou tous ceux de la cible.
      let query = sb.from("episodes").select("id, gcal_event_id, gcal_studio_event_id").eq("show_id", sid);
      if (a.episode_id) {
        query = query.eq("id", a.episode_id);
      } else if (a.cible) {
        const target = await resolveCible(sb, sid, a.cible);
        if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
        query = query.eq("cible_id", target.id);
      } else {
        return text({ error: "Préciser episode_id ou cible.", cause: "parametre_manquant", action: "Fournir episode_id (précis) ou cible (tous ses épisodes)." });
      }
      const { data: eps } = await query;
      const rows = (eps ?? []) as { id: string; gcal_event_id: string | null; gcal_studio_event_id: string | null }[];
      if (!rows.length) return text({ ok: true, annules: 0, detail: "Aucun épisode correspondant." });

      const details: unknown[] = [];
      for (const ep of rows) {
        const events: string[] = [];
        if (ep.gcal_event_id) {
          const r = await deleteCalendarEvent(null, ep.gcal_event_id, true);
          events.push(`invitation: ${r.ok ? "supprimée" : r.detail}`);
        }
        if (ep.gcal_studio_event_id) {
          const r = await deleteCalendarEvent(null, ep.gcal_studio_event_id, true);
          events.push(`studio: ${r.ok ? "libéré" : r.detail}`);
        }
        await sb.from("episodes").delete().eq("id", ep.id);
        details.push({ episode_id: ep.id, events });
      }
      return text({ ok: true, annules: rows.length, details });
    }
  );

  W(
    "generate_fiche",
    "Génère la fiche de préparation STRUCTURÉE d'un invité (deep research, contrat v3 Bloc A/B) : crée la fiche /fiches/{slug} si besoin, puis met en file 4 recherches web (portrait, chiffres, angles, déroulé) PLUS la passe de rédaction (redaction, exécutée en dernier : déduplication, réconciliation des chiffres, budgets de longueur, format scannable, avec rapport). Propriété unique des faits : la chronologie vit dans parcours, le récit en 1 ouverture + 7 temps, l'univers en 4 points hors graphiques, à lire en 3 sources. La génération part AUSSI automatiquement à validate_cible : cet outil sert surtout à régénérer des groupes ou relancer la seule rédaction. Suivre via get_fiche.",
    {
      show: z.string(),
      cible: z.string(),
      groupes: z.array(z.enum(["portrait", "chiffres", "angles", "deroule", "redaction"])).optional().describe("groupes à (re)générer (défaut : les 4 recherches + la rédaction)"),
    },
    { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: "Show introuvable" });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });

      // Fiche structurée (créée si absente), datée depuis l'épisode s'il existe.
      const { data: ep } = await sb.from("episodes").select("id, date_enregistrement, gcal_event_id").eq("cible_id", target.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const episode = ep as { id: string; date_enregistrement: string | null; gcal_event_id: string | null } | null;
      const { fiche } = await ensureFiche(sb, { show_id: sid, cible_id: target.id, invite_nom: target.nom, date_enregistrement: episode?.date_enregistrement ?? null });
      if (fiche.statut === "verrouillee") return text({ error: "Fiche verrouillée : régénération impossible. Repasser en_challenge via set_status.", cause: "fiche_verrouillee" });

      // Un job par groupe de recherche ; pas de doublon si un job du groupe est déjà en file.
      const groupes: FicheGroupe[] = a.groupes?.length ? Array.from(new Set(a.groupes as FicheGroupe[])) : [...FICHE_GROUPES];
      let enFile = 0;
      try {
        enFile = await enqueueFicheGeneration(sb, target.id, groupes);
      } catch (e) {
        return text({ error: e instanceof Error ? e.message : String(e) });
      }
      kickQueue();

      const url = fichePageUrl(fiche.slug);
      // A3 — si l'invitation Calendar existe, y pointer la fiche (lien court, accès team).
      let event_maj: string | undefined;
      if (episode?.gcal_event_id) {
        const r = await injectFicheLink(episode.gcal_event_id, url);
        event_maj = r.ok ? "lien fiche ajouté à l'invitation" : `invitation non mise à jour : ${r.detail}`;
      }

      return text({
        ok: true,
        cible: target.nom,
        fiche: fiche.slug,
        url,
        en_file: enFile,
        deja_en_cours: groupes.length - enFile,
        event_maj,
        detail: "Génération en tâche de fond (4 recherches : portrait, chiffres, angles, déroulé). La fiche se remplit progressivement, suivre via get_fiche.",
      });
    }
  );

  W(
    "send_prep_email",
    "Envoie les mails de préparation d'un épisode (envoyer le brief, prévenir l'invité et le staff) depuis la boîte du show, avec les coordonnées des participants en pièce jointe (VCF) et le lien de la fiche. Deux gabarits : invité + staff. La cible doit être validée. Exige le compte de service Gmail (délégation).",
    { show: z.string(), cible: z.string(), invite_email: z.string().optional(), contact_jour_j: z.string().optional(), langue: z.enum(["fr", "en"]).optional().describe("langue du mail invité (défaut : déduite du playbook)") },
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
      const { data: showRowData } = await sb.from("shows").select("nom, sender_email, sender_name, staff").eq("id", sid).maybeSingle();
      const showCfg = (showRowData ?? {}) as { nom?: string; sender_email?: string | null; sender_name?: string | null; staff?: StaffMember[] | null };
      const showNom = showCfg.nom ?? a.show;
      // En-tête From : config du show si présente, sinon expéditeur global.
      // IMPORTANT : l'adresse From peut être un ALIAS (ex. vadim@collision.studio)
      // DIFFÉRENT de la boîte impersonée (EPISODE_SENDER = la principale réelle,
      // ex. vadim@stefani.fr). On ne peut impersoner qu'une principale, mais on
      // peut envoyer « as » un alias de ce compte. D'où EPISODE_FROM_EMAIL dédié.
      const gEmail = process.env.EPISODE_FROM_EMAIL ?? process.env.EPISODE_SENDER;
      const gName = process.env.EPISODE_SENDER_NAME;
      const from = showCfg.sender_email
        ? (showCfg.sender_name ? `"${showCfg.sender_name}" <${showCfg.sender_email}>` : showCfg.sender_email)
        : gEmail
          ? (gName ? `"${gName}" <${gEmail}>` : gEmail)
          : undefined;

      const { data: ep } = await sb.from("episodes").select("id, date_enregistrement, fiche_token").eq("cible_id", target.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!ep) return text({ error: "Aucun épisode : valider d'abord.", cause: "episode_absent", action: "validate_cible avant l'envoi." });
      const episode = ep as { id: string; date_enregistrement: string | null; fiche_token: string | null };
      // Lien fiche pour le staff : la fiche STRUCTURÉE (/fiches/{slug}, URL courte,
      // derrière le login) si elle existe, sinon l'ancien lien signé (long).
      const { data: ficheRow } = await sb.from("fiches").select("slug").eq("cible_id", target.id).maybeSingle();
      const ficheLink = (ficheRow as { slug?: string } | null)?.slug
        ? fichePageUrl((ficheRow as { slug: string }).slug)
        : episode.fiche_token ? ficheUrl(episode.id, episode.fiche_token) : null;

      // Langue du mail invité : override explicite, sinon déduite du playbook.
      const { data: cRow } = await sb.from("cibles").select("playbook").eq("id", target.id).maybeSingle();
      const pbLang = String(((cRow as { playbook?: { langue?: string } } | null)?.playbook?.langue) ?? "").toLowerCase();
      const lang: MailLang = a.langue ?? (pbLang.startsWith("en") ? "en" : "fr");

      // Coordonnées réelles de l'invité (contacts de la cible) pour le VCF et l'adresse.
      const { data: contacts } = await sb.from("contacts").select("kind, valeur").eq("cible_id", target.id);
      const rows = (contacts ?? []) as { kind: string; valeur: string }[];
      const inviteEmails = rows.filter((c) => c.kind === "email").map((c) => c.valeur);
      const invitePhones = rows.filter((c) => c.kind === "telephone").map((c) => c.valeur);
      const toInvite = (a.invite_email ?? inviteEmails[0] ?? "").trim();

      // B4/B5 — staff depuis la config du show (nom, tél, rôle, in_vcf), repli env.
      const staffCfg: StaffMember[] = (showCfg.staff && showCfg.staff.length)
        ? showCfg.staff
        : staffEmails().map((e) => ({ nom: e.split("@")[0], email: e }));

      // D3 — identités d'expéditeur à exclure des destinataires ET du VCF
      // (la boîte impersonée + l'alias d'affichage : Vadim ne s'auto-notifie pas).
      const identityAddrs = new Set(
        [gmailSender(), process.env.EPISODE_FROM_EMAIL].filter((x): x is string => !!x).map((s) => s.toLowerCase())
      );
      const staffTo = staffCfg.map((s) => s.email).filter((e) => e?.includes("@") && !identityAddrs.has(e.toLowerCase()));

      const toVcf = (s: StaffMember): VcfPerson => ({ nom: s.nom, emails: s.email ? [s.email] : [], phones: s.telephone ? [s.telephone] : [], role: s.role ?? null });
      const inviteCard: VcfPerson = { nom: target.nom, emails: inviteEmails, phones: invitePhones };

      // F1 — pièces jointes VCF : UNE par personne (import plus fiable), asymétriques.
      // Mail invité : les cartes du staff flaggé in_vcf (ex. Matt + Clémence), hors
      // identité expéditeur. Mail staff : la carte de l'invité (celle dont l'équipe
      // a besoin), pas les cartes des collègues qu'ils ont déjà.
      const inviteVcfAtts = staffCfg
        .filter((s) => s.in_vcf && !identityAddrs.has((s.email ?? "").toLowerCase()))
        .map(toVcf)
        .filter(isUsefulCard)
        .map((p) => ({ filename: vcfFileName(p.nom), mimeType: "text/vcard", content: buildVcard(p) }));
      const staffVcfAtts = isUsefulCard(inviteCard)
        ? [{ filename: vcfFileName(target.nom), mimeType: "text/vcard", content: buildVcard(inviteCard) }]
        : [];

      // B2 — heure en Europe/Paris (et non en UTC serveur).
      const dateLabel = episode.date_enregistrement
        ? new Date(episode.date_enregistrement).toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" })
        : null;
      const common = { invite_nom: target.nom, show_nom: showNom, date_label: dateLabel, lieu: DEFAULT_LIEU, fiche_url: ficheLink, contact_jour_j: a.contact_jour_j ?? DEFAULT_CONTACTS_JOUR_J.join(" · ") };

      // A4 — statut typé par destinataire + `ok` global honnête.
      type MailStatus = { status: "sent" | "skipped" | "failed"; detail: string };
      const resultats: Record<string, MailStatus> = {};

      let expediteur: string | undefined; // C1 — écho de l'expéditeur EFFECTIF
      if (toInvite) {
        const m = buildInviteMail(common, lang);
        const r = await sendGmail({ to: [toInvite], subject: m.subject, html: m.html, attachments: inviteVcfAtts, from });
        expediteur = r.from ?? expediteur;
        resultats.invite = r.ok ? { status: "sent", detail: `envoyé à ${toInvite} (${inviteVcfAtts.length} carte(s) jointe(s))` } : { status: "failed", detail: r.detail };
      } else {
        resultats.invite = { status: "skipped", detail: "email de l'invité inconnu (préciser invite_email ou ajouter un contact email)." };
      }

      if (staffTo.length) {
        const m = buildStaffMail(common);
        const r = await sendGmail({ to: staffTo, subject: m.subject, html: m.html, attachments: staffVcfAtts, from });
        expediteur = r.from ?? expediteur;
        resultats.staff = r.ok ? { status: "sent", detail: `envoyé à ${staffTo.length} destinataire(s)` } : { status: "failed", detail: r.detail };
      } else {
        resultats.staff = { status: "skipped", detail: "aucun staff configuré (shows.staff ou EPISODE_STAFF_EMAILS)." };
      }

      const anyFailed = Object.values(resultats).some((r) => r.status === "failed");
      const anySent = Object.values(resultats).some((r) => r.status === "sent");
      // On ne marque l'épisode « prep envoyée » que si au moins un envoi a réussi.
      if (anySent) await sb.from("episodes").update({ prep_sent_at: new Date().toISOString() }).eq("id", episode.id);

      return text({
        ok: !anyFailed,
        cible: target.nom,
        episode_id: episode.id,
        expediteur: expediteur ?? gmailSender(), // qui a réellement envoyé (diagnostic)
        langue: lang,
        fiche_url: ficheLink,
        resultats,
        ...(anyFailed ? { error: "Au moins un envoi a échoué (voir resultats).", cause: "envoi_partiel" } : {}),
      });
    }
  );

  W(
    "set_show_config",
    "Configure l'envoi d'un show : expéditeur (alias, ex. gdiy@collision.studio + nom d'affichage) et staff systématiquement invité (nom, email, téléphone, rôle). Remplace le staff en dur. Le staff alimente les invitations ET le VCF des mails de prep. Passer seulement les champs à changer.",
    {
      show: z.string(),
      sender_email: z.string().optional().describe("alias expéditeur (doit être Send-as sur la boîte impersonée)"),
      sender_name: z.string().optional().describe("nom d'affichage de l'expéditeur"),
      staff: z.array(z.object({
        nom: z.string(),
        email: z.string(),
        telephone: z.string().optional(),
        role: z.string().optional(),
        in_vcf: z.boolean().optional().describe("true = sa carte part en PJ du mail invité"),
      })).optional().describe("liste complète du staff (remplace l'existant)"),
    },
    { destructiveHint: false, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const patch: Record<string, unknown> = {};
      if (a.sender_email !== undefined) patch.sender_email = a.sender_email;
      if (a.sender_name !== undefined) patch.sender_name = a.sender_name;
      if (a.staff !== undefined) patch.staff = a.staff;
      if (Object.keys(patch).length === 0) return text({ error: "Rien à configurer (fournir sender_email, sender_name ou staff)." });
      const { error } = await sb.from("shows").update(patch).eq("id", sid);
      if (error) return text({ error: error.message });
      return text({ ok: true, show: a.show, configure: Object.keys(patch) });
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
      const [{ data: stages }, { data: rows }, { data: cibleIdsRows }, tests] = await Promise.all([
        sb.from("stages").select("*").eq("show_id", sid).order("position"),
        sb.from("cibles_enrichies").select("id, stage_key, stage_position, archive").eq("show_id", sid),
        sb.from("cibles").select("id").eq("show_id", sid),
        testCibleIds(sb, sid),
      ]);
      // A6 : les cibles de test ne comptent pas dans les stats.
      const statRows = ((rows ?? []) as { id: string; stage_key: string | null; stage_position: number | null; archive: boolean }[])
        .filter((r) => !tests.has(r.id));
      const stats = computeShowStats((stages ?? []) as Stage[], statRows);

      // Feedback (S7) : issues des touches renseignées. Base du tuning de septembre.
      const ids = ((cibleIdsRows ?? []) as { id: string }[]).map((c) => c.id).filter((id) => !tests.has(id));
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

  // ─────────────────────────────────────────────────────────────────────────
  // Fiches prépa STRUCTURÉES (brief GDIY, incrément II). Chaque fiche porte les
  // 19 sections du catalogue (src/lib/fiche/sections.ts), éditables une à une,
  // versionnées, commentables. Statut : draft → en_challenge → finale →
  // verrouillee. Écriture réservée à l'équipe (service role), donc scope write.
  // ─────────────────────────────────────────────────────────────────────────

  /** Vue légère d'une fiche pour list_fiches / get_fiche. */
  const fichePageUrl = (slug: string) => {
    const base = baseUrl();
    return base ? `${base}/fiches/${slug}` : `/fiches/${slug}`;
  };
  const ficheSummary = (f: FicheRow) => ({
    id: f.id,
    slug: f.slug,
    invite: f.invite_nom,
    statut: f.statut,
    version: f.version,
    date_enregistrement: f.date_enregistrement,
    updated_at: f.updated_at,
    url: fichePageUrl(f.slug),
  });

  RT(
    "list_fiches",
    "Liste les fiches de préparation d'un show : slug, invité, statut (draft, en_challenge, finale, verrouillee), version, date d'enregistrement, nombre de commentaires ouverts. Intentions : voir les fiches en cours, retrouver une fiche par invité.",
    { show: z.string().optional().describe("slug ou id ; omis = tous les shows"), statut: z.enum(FICHE_STATUTS).optional() },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      let sid: string | null = null;
      if (a.show) {
        sid = await showId(sb, a.show);
        if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      }
      // Même requête que la page /fiches (fichesOverview, A3.2) : une seule logique.
      const rows = await fichesOverview(sb, { show_id: sid, statut: a.statut });
      return text({
        total: rows.length,
        fiches: rows.map((r) => ({
          ...ficheSummary(r.fiche),
          show: r.show_slug,
          commentaires_ouverts: r.commentaires_ouverts,
          carnet_disponible: r.carnet_disponible,
        })),
      });
    }
  );

  RT(
    "get_fiche",
    "Renvoie une fiche complète : métadonnées, les 19 sections avec leur contenu structuré (JSON), les commentaires ouverts et les notes à intégrer. Résoudre par slug, id, ou nom d'invité. Intentions : lire la fiche, préparer le challenge, réviser avant l'enregistrement.",
    { fiche: z.string().describe("slug, id ou nom d'invité"), show: z.string().optional() },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = a.show ? await showId(sb, a.show) : null;
      const f = await resolveFiche(sb, a.fiche, sid);
      if (!f) return text({ error: `Fiche « ${a.fiche} » introuvable.` });
      kickQueue(); // lecture chaude : draine la génération en cours (plan Hobby)
      const sections = await ficheSections(sb, f.id);
      const catalog = new Map(FICHE_SECTIONS.map((s) => [s.id, s]));
      const { data: comments } = await sb.from("fiche_comments").select("id, section_id, author, text, resolved, created_at").eq("fiche_id", f.id).eq("resolved", false).order("created_at");
      const { data: notes } = await sb.from("fiche_notes").select("id, text, source, integrated, created_at").eq("fiche_id", f.id).eq("integrated", false).order("created_at");
      // Avancement de la génération (jobs fiche:* de la cible, hors anciens done).
      let generation: unknown;
      if (f.cible_id) {
        const { data: jobs } = await sb
          .from("enrichment_jobs")
          .select("objectif, statut, error, updated_at")
          .eq("cible_id", f.cible_id)
          .like("objectif", `${FICHE_JOB_PREFIX}%`)
          .order("updated_at", { ascending: false })
          .limit(8);
        const rows = (jobs ?? []) as { objectif: string; statut: string; error: string | null }[];
        if (rows.length) {
          generation = rows.map((j) => ({ groupe: j.objectif.slice(FICHE_JOB_PREFIX.length), statut: j.statut, ...(j.error ? { error: j.error } : {}) }));
        }
      }
      return text({
        ...ficheSummary(f),
        cible_id: f.cible_id,
        show_id: f.show_id,
        sections: sections.map((s) => {
          const def = catalog.get(s.section_id);
          const empty = !s.content || Object.keys(s.content).length === 0;
          return {
            section_id: s.section_id,
            titre: def?.titre ?? s.section_id,
            num: def?.num ?? null,
            version: s.version,
            vide: empty,
            content: s.content ?? {},
          };
        }),
        commentaires_ouverts: comments ?? [],
        notes_a_integrer: notes ?? [],
        ...(generation ? { generation } : {}),
      });
    }
  );

  RT(
    "get_section",
    "Renvoie une seule section d'une fiche (contenu structuré, version, rôle de cadrage). Pratique pour éditer finement sans recharger toute la fiche. section_id stable (ex. playbook, chiffres, dix_questions, questions_reseaux, zone_grise).",
    { fiche: z.string(), section_id: z.string().describe("clé stable de section"), show: z.string().optional() },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = a.show ? await showId(sb, a.show) : null;
      const f = await resolveFiche(sb, a.fiche, sid);
      if (!f) return text({ error: `Fiche « ${a.fiche} » introuvable.` });
      const sectionId = canonicalSectionId(a.section_id); // alias v1 acceptés
      const def = FICHE_SECTIONS.find((s) => s.id === sectionId);
      if (!def) return text({ error: `Section inconnue : ${a.section_id}.`, sections_valides: FICHE_SECTIONS.map((s) => s.id) });
      const { data } = await sb.from("fiche_sections").select("content, version, updated_at, updated_by").eq("fiche_id", f.id).eq("section_id", sectionId).maybeSingle();
      const row = data as { content: Record<string, unknown>; version: number; updated_at: string; updated_by: string | null } | null;
      return text({
        fiche: f.slug,
        section_id: sectionId,
        titre: def.titre,
        num: def.num ?? null,
        role: def.role ?? null,
        version: row?.version ?? 0,
        content: row?.content ?? {},
        contrat: SECTION_CONTRACTS[sectionId] ?? null, // forme attendue par update_section
      });
    }
  );

  W(
    "update_section",
    "Écrit le contenu structuré d'une section (remplacement complet). Versionné : l'état précédent est archivé (rollback possible), la version de la section et de la fiche sont incrémentées. Le contenu est un objet JSON propre à la section : appeler get_section d'abord, son champ `contrat` donne la forme exacte attendue. Intentions : rédiger une section, corriger le playbook, injecter les questions clips.",
    {
      fiche: z.string(),
      section_id: z.string().describe("clé stable (ex. enjeu, chiffres, playbook, dix_questions, zone_grise)"),
      content: z.record(z.any()).describe("objet JSON du contenu de la section (remplace l'existant)"),
      show: z.string().optional(),
    },
    { destructiveHint: false, idempotentHint: false },
    async (a, extra) => {
      const sb = createServiceClient();
      const sid = a.show ? await showId(sb, a.show) : null;
      const f = await resolveFiche(sb, a.fiche, sid);
      if (!f) return text({ error: `Fiche « ${a.fiche} » introuvable.` });
      if (f.statut === "verrouillee") return text({ error: "Fiche verrouillée : édition impossible. Repasser en_challenge via set_status.", cause: "fiche_verrouillee" });
      const sectionId = canonicalSectionId(a.section_id); // alias v1 acceptés
      const def = FICHE_SECTIONS.find((s) => s.id === sectionId);
      if (!def) return text({ error: `Section inconnue : ${a.section_id}.`, sections_valides: FICHE_SECTIONS.map((s) => s.id) });
      const author = extra?.authInfo?.extra?.email ?? extra?.authInfo?.extra?.userId ?? null;
      const r = await writeSection(sb, f.id, sectionId, a.content, author);
      if (!r) return text({ error: `Section inconnue : ${a.section_id}.` });
      return text({ ok: true, fiche: f.slug, section_id: sectionId, titre: def.titre, version: r.version });
    }
  );

  W(
    "add_comment",
    "Ajoute un commentaire de challenge ancré à une section (façon commentaire Google Docs). Sert au dialogue Matt / Clémence sur une fiche : signaler un manque, contester un angle, demander une source. Reste ouvert jusqu'à resolve_comment.",
    {
      fiche: z.string(),
      section_id: z.string().optional().describe("section visée ; omis = commentaire général sur la fiche"),
      text: z.string().describe("le commentaire"),
      author: z.string().optional().describe("auteur (défaut : identité de l'appelant)"),
      show: z.string().optional(),
    },
    { destructiveHint: false, idempotentHint: false },
    async (a, extra) => {
      const sb = createServiceClient();
      const sid = a.show ? await showId(sb, a.show) : null;
      const f = await resolveFiche(sb, a.fiche, sid);
      if (!f) return text({ error: `Fiche « ${a.fiche} » introuvable.` });
      if (a.section_id && !FICHE_SECTIONS.some((s) => s.id === a.section_id)) {
        return text({ error: `Section inconnue : ${a.section_id}.`, sections_valides: FICHE_SECTIONS.map((s) => s.id) });
      }
      const author = a.author ?? extra?.authInfo?.extra?.email ?? extra?.authInfo?.extra?.userId ?? null;
      const { data, error } = await sb
        .from("fiche_comments")
        .insert({ fiche_id: f.id, section_id: a.section_id ?? null, author, text: a.text, resolved: false })
        .select("id")
        .single();
      if (error) return text({ error: error.message });
      return text({ ok: true, fiche: f.slug, comment_id: (data as { id: string }).id, section_id: a.section_id ?? null });
    }
  );

  W(
    "resolve_comment",
    "Marque un commentaire de challenge comme résolu (traité). Intentions : clore un point du challenge, nettoyer les commentaires ouverts avant de passer la fiche en finale.",
    { comment_id: z.string().describe("id du commentaire (voir get_fiche)") },
    { destructiveHint: false, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const { data, error } = await sb.from("fiche_comments").update({ resolved: true }).eq("id", a.comment_id).select("id, fiche_id").maybeSingle();
      if (error) return text({ error: error.message });
      if (!data) return text({ error: `Commentaire introuvable : ${a.comment_id}.` });
      return text({ ok: true, comment_id: a.comment_id });
    }
  );

  W(
    "set_status",
    "Change le statut d'une fiche : draft (rédaction), en_challenge (relecture Matt/Clémence), finale (validée), verrouillee (figée à J-1). Une fiche verrouillée n'est plus éditable (déverrouiller en repassant en_challenge). Intentions : envoyer au challenge, valider, verrouiller avant l'enregistrement.",
    { fiche: z.string(), statut: z.enum(FICHE_STATUTS), show: z.string().optional() },
    { destructiveHint: false, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = a.show ? await showId(sb, a.show) : null;
      const f = await resolveFiche(sb, a.fiche, sid);
      if (!f) return text({ error: `Fiche « ${a.fiche} » introuvable.` });
      // Gate du contrat v2 (§3.5) : passage en_challenge refusé si la mécanique
      // du succès (A3), l'univers (A4) ou les chiffres (B2) sont vides.
      if (a.statut === "en_challenge") {
        const requises = [...SECTIONS_OBLIGATOIRES];
        const { data: secs } = await sb.from("fiche_sections").select("section_id, content").eq("fiche_id", f.id).in("section_id", requises);
        const parId = new Map(((secs ?? []) as { section_id: string; content: unknown }[]).map((s) => [s.section_id, s.content]));
        const vides = requises.filter((id) => isEmptyContent(parId.get(id)));
        if (vides.length) {
          return text({
            error: `Passage en_challenge refusé : section(s) obligatoire(s) vide(s) : ${vides.join(", ")}.`,
            cause: "sections_obligatoires_vides",
            action: "Lancer generate_fiche (groupe chiffres) ou remplir via update_section, puis réessayer.",
          });
        }
      }
      // Garde-fou : verrouiller une fiche qui a encore des commentaires ouverts est
      // probablement une erreur ; on le signale sans bloquer (l'équipe décide).
      let avertissement: string | undefined;
      if (a.statut === "verrouillee") {
        const { count } = await sb.from("fiche_comments").select("id", { count: "exact", head: true }).eq("fiche_id", f.id).eq("resolved", false);
        if ((count ?? 0) > 0) avertissement = `${count} commentaire(s) encore ouvert(s) au verrouillage.`;
      }
      const { error } = await sb.from("fiches").update({ statut: a.statut, updated_at: new Date().toISOString() }).eq("id", f.id);
      if (error) return text({ error: error.message });
      return text({ ok: true, fiche: f.slug, statut_precedent: f.statut, statut: a.statut, ...(avertissement ? { avertissement } : {}) });
    }
  );

  W(
    "add_note",
    "Injecte de la matière brute rattachée à une fiche, à intégrer plus tard dans les sections (add_note pendant la préparation : une info entendue, un article, une remarque). Reste « à intégrer » jusqu'à traitement. Intentions : noter une info à chaud, déposer une source à exploiter.",
    { fiche: z.string(), text: z.string(), source: z.string().optional().describe("origine (url, personne, contexte)"), show: z.string().optional() },
    { destructiveHint: false, idempotentHint: false },
    async (a) => {
      const sb = createServiceClient();
      const sid = a.show ? await showId(sb, a.show) : null;
      const f = await resolveFiche(sb, a.fiche, sid);
      if (!f) return text({ error: `Fiche « ${a.fiche} » introuvable.` });
      const { data, error } = await sb
        .from("fiche_notes")
        .insert({ fiche_id: f.id, text: a.text, source: a.source ?? null, integrated: false })
        .select("id")
        .single();
      if (error) return text({ error: error.message });
      return text({ ok: true, fiche: f.slug, note_id: (data as { id: string }).id });
    }
  );

  W(
    "note_fiche",
    "Note la fiche APRÈS l'enregistrement : la fiche a-t-elle servi sur le plateau ? Note de 1 (inutile) à 5 (décisive), commentaire libre optionnel (ce qui a manqué, ce qui a marché). Alimente la boucle éditoriale et le récap hebdomadaire ; c'est la matière qui fait évoluer la doctrine des fiches. Intentions : débrief post-tournage, retour de Matt ou de Clémence sur la qualité de la préparation.",
    {
      fiche: z.string(),
      note: z.number().int().min(1).max(5).describe("1 = fiche inutile, 5 = fiche décisive"),
      commentaire: z.string().optional().describe("ce qui a manqué ou marché (alimente la boucle éditoriale)"),
      show: z.string().optional(),
    },
    { destructiveHint: false, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = a.show ? await showId(sb, a.show) : null;
      const f = await resolveFiche(sb, a.fiche, sid);
      if (!f) return text({ error: `Fiche « ${a.fiche} » introuvable.` });
      const { error } = await sb
        .from("fiches")
        .update({ note_plateau: a.note, note_commentaire: a.commentaire ?? null, note_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", f.id);
      if (error) {
        if (/note_plateau|note_commentaire|note_at/.test(error.message)) {
          return text({ error: "Colonnes de note absentes : appliquer la migration 0038_gate_alertes_note.sql, puis réessayer.", cause: "migration_0038_manquante" });
        }
        return text({ error: error.message });
      }
      return text({ ok: true, fiche: f.slug, note: a.note, commentaire: a.commentaire ?? null });
    }
  );

  W(
    "create_fiche",
    "Crée une fiche de préparation structurée pour une cible validée et sème les 19 sections vides du catalogue (à alimenter ensuite via update_section ou la génération). Idempotent : une seule fiche par cible ; réappelée, renvoie l'existante en complétant les sections manquantes. Slug = prénom-nom (unique).",
    { show: z.string(), cible: z.string() },
    { destructiveHint: false, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      // Date d'enregistrement depuis l'épisode le plus récent, si présent.
      const { data: ep } = await sb.from("episodes").select("date_enregistrement").eq("cible_id", target.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const date = (ep as { date_enregistrement?: string | null } | null)?.date_enregistrement ?? null;
      const { fiche, created } = await ensureFiche(sb, { show_id: sid, cible_id: target.id, invite_nom: target.nom, date_enregistrement: date });
      return text({ ok: true, cree: created, fiche: fiche.slug, fiche_id: fiche.id, invite: fiche.invite_nom, statut: fiche.statut, sections: FICHE_SECTIONS.length, url: fichePageUrl(fiche.slug) });
    }
  );

  W(
    "suggest_questions_reseaux",
    "Propose des questions « clips » calibrées sur l'invité d'une fiche : questions clickbait à dégainer en tournage (moment de mou, relance) pour fabriquer un extrait viral. Ressorts : argent, échec, contre-pied, confession. Vadim propose, l'équipe challenge. apply=true écrit la section questions_reseaux (non destructif) ; sinon, renvoie seulement les propositions.",
    { fiche: z.string(), count: z.number().optional().describe("nombre de questions (défaut 10, max 12)"), apply: z.boolean().optional().describe("true = écrit la section questions_reseaux de la fiche"), show: z.string().optional() },
    { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    async (a, extra) => {
      const sb = createServiceClient();
      const sid = a.show ? await showId(sb, a.show) : null;
      const f = await resolveFiche(sb, a.fiche, sid);
      if (!f) return text({ error: `Fiche « ${a.fiche} » introuvable.` });
      // Contexte invité depuis la cible (dossier enrichi) si rattachée.
      const guest: GuestContext = { nom: f.invite_nom };
      if (f.cible_id) {
        const { data: c } = await sb.from("cibles_enrichies").select("role, organisation, secteur, sujets").eq("id", f.cible_id).maybeSingle();
        const row = c as { role?: string | null; organisation?: string | null; secteur?: string | null; sujets?: string[] | null } | null;
        if (row) { guest.role = row.role; guest.organisation = row.organisation; guest.secteur = row.secteur; guest.sujets = row.sujets; }
        const { data: enr } = await sb.from("enrichment_jobs").select("resultat").eq("cible_id", f.cible_id).eq("statut", "done").order("updated_at", { ascending: false }).limit(1).maybeSingle();
        guest.resume = (enr as { resultat?: { resume?: string | null } } | null)?.resultat?.resume ?? null;
      }
      const { questions, demo } = await suggestQuestionsReseaux(guest, a.count ?? 10);
      let ecrit = false;
      if (a.apply) {
        if (f.statut === "verrouillee") return text({ error: "Fiche verrouillée : écriture impossible.", cause: "fiche_verrouillee", questions });
        const author = extra?.authInfo?.extra?.email ?? extra?.authInfo?.extra?.userId ?? null;
        await writeSection(sb, f.id, "questions_reseaux", { questions }, author);
        ecrit = true;
      }
      return text({ ok: true, fiche: f.slug, invite: f.invite_nom, demo, ecrit, count: questions.length, questions, ...(demo ? { note: "Mode démo (pas de clé Anthropic ou recherche vide) : questions génériques par ressort." } : {}) });
    }
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Chantier 1 (brief arbitrages 17/07) : backlog produit. Le MCP écrit dans le
  // backlog, jamais dans le code. La décision de triage reste humaine.
  // ───────────────────────────────────────────────────────────────────────────

  W(
    "feedback",
    "Pose une demande d'évolution ou un constat produit dans le backlog Magellan (une ligne suffit). Le contexte est capté automatiquement : acteur du jeton, dernier outil appelé, cible concernée si fournie. Compilé chaque lundi dans le récap hebdo avec un triage proposé. Intentions : signaler un manque, proposer une amélioration, noter un irritant à chaud.",
    {
      texte: z.string().describe("la demande ou le constat, en clair"),
      cible: z.string().optional().describe("nom ou id de la cible concernée, le cas échéant"),
    },
    { destructiveHint: false, idempotentHint: false },
    async (a, extra) => {
      const sb = createServiceClient();
      const acteur = extra?.authInfo?.extra?.email ?? extra?.authInfo?.extra?.userId ?? "inconnu";
      // Contexte auto : dernier outil appelé par cet acteur (fenêtre 30 min).
      const contexte: Record<string, unknown> = {};
      try {
        const depuis = new Date(Date.now() - 30 * 60_000).toISOString();
        const { data: dernier } = await sb
          .from("mcp_audit")
          .select("tool")
          .eq("actor", acteur)
          .gte("created_at", depuis)
          .neq("tool", "feedback")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dernier) contexte.dernier_outil = (dernier as { tool: string }).tool;
      } catch { /* contexte best-effort */ }
      if (a.cible) contexte.cible = a.cible;
      const { data, error } = await sb
        .from("product_backlog")
        .insert({ auteur: acteur, source: "mcp_feedback", contenu: a.texte, contexte, statut: "nouveau" })
        .select("id")
        .single();
      if (error) return text({ error: error.message });
      return text({ ok: true, backlog_id: (data as { id: string }).id, detail: "Noté au backlog. Compilé dans le récap du lundi." });
    }
  );

  RT(
    "list_backlog",
    "Liste les items du backlog produit (demandes d'évolution posées via feedback, email ou session), avec statut, triage proposé et PR liée. Filtrable par statut : nouveau, a_faire, a_preciser, rejete, livre.",
    { statut: z.enum(["nouveau", "a_faire", "a_preciser", "rejete", "livre"]).optional() },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      let q = sb.from("product_backlog").select("*").order("created_at", { ascending: false }).limit(100);
      if (a.statut) q = q.eq("statut", a.statut);
      const { data, error } = await q;
      if (error) return text({ error: error.message });
      return text({ total: (data ?? []).length, items: data ?? [] });
    }
  );

  W(
    "triage_backlog",
    "Tranche un item du backlog (boucle de validation du récap hebdo) : a_faire (une Routine ouvrira la PR), a_preciser, rejete, ou livre (avec pr_url). Intentions : valider ou rejeter une demande produit du récap.",
    {
      id: z.string().describe("id de l'item (voir list_backlog ou le récap)"),
      statut: z.enum(["a_faire", "a_preciser", "rejete", "livre"]),
      commentaire: z.string().optional().describe("justification du triage"),
      pr_url: z.string().optional().describe("URL de la PR qui livre l'item"),
    },
    { destructiveHint: false, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const patch: Record<string, unknown> = { statut: a.statut };
      if (a.commentaire !== undefined) patch.commentaire_triage = a.commentaire;
      if (a.pr_url !== undefined) patch.pr_url = a.pr_url;
      const { data, error } = await sb.from("product_backlog").update(patch).eq("id", a.id).select("id, statut").maybeSingle();
      if (error) return text({ error: error.message });
      if (!data) return text({ error: `Item introuvable : ${a.id}.` });
      return text({ ok: true, id: a.id, statut: a.statut });
    }
  );

  RT(
    "budget_api",
    "État du budget API Anthropic du mois : dépense estimée, plafond, ratio, override, ventilation par objectif (fiche:portrait, fiche:chiffres, profil...). Coût estimé depuis les tokens enregistrés par job (télémétrie chantier 3). Intentions : où en est le budget, combien coûte une fiche, quel groupe consomme le plus.",
    {},
    { readOnlyHint: true },
    async () => {
      const sb = createServiceClient();
      const etat = await etatBudgetLecture(sb);
      const ventilation = await ventilationMois(sb);
      if (etat.depense_eur === null) {
        return text({
          telemetrie: "absente",
          action: "Appliquer la migration 0039_telemetrie_cout.sql ; les tokens seront comptés sur les jobs suivants.",
          plafond_eur: etat.plafond_eur,
        });
      }
      return text({
        mois: new Date().toISOString().slice(0, 7),
        depense_estimee_eur: Number(etat.depense_eur.toFixed(2)),
        plafond_eur: etat.plafond_eur,
        ratio: Number(((etat.ratio ?? 0) * 100).toFixed(1)) + " %",
        override: etat.override,
        generations_bloquees: etat.bloque,
        ventilation: ventilation.map((v) => ({ ...v, cout_eur: Number(v.cout_eur.toFixed(2)) })),
        note: "Coût estimé sur les tokens (grille par famille de modèle). La recherche web est facturée en sus par requête : le plafond se recalibre sur la facture réelle.",
      });
    }
  );

  W(
    "budget_override",
    "Lève ou repose le plafond budget API pour le mois en cours (décision §1.3 : override manuel réservé à l'admin). actif=true : les générations reprennent malgré un plafond atteint, jusqu'à la fin du mois. actif=false : le plafond s'applique de nouveau. Intentions : débloquer les générations après l'alerte 100 pour cent, en connaissance de cause.",
    { actif: z.boolean().describe("true = ignorer le plafond ce mois-ci, false = réappliquer") },
    { destructiveHint: true, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      try {
        await setBudgetOverride(sb, a.actif);
      } catch {
        return text({ error: "Table system_state absente : appliquer la migration 0038, puis réessayer.", cause: "migration_0038_manquante" });
      }
      const etat = await etatBudgetLecture(sb);
      return text({ ok: true, override: a.actif, mois: new Date().toISOString().slice(0, 7), depense_estimee_eur: etat.depense_eur === null ? null : Number(etat.depense_eur.toFixed(2)), plafond_eur: etat.plafond_eur });
    }
  );

  W(
    "add_besoin",
    "Pose un besoin éditorial sur un show (chantier 4) : la contrainte de programmation en clair (exemple : « 1 femme, épisode estival, closing sous 15 jours »), avec critères structurés optionnels pour le matching automatique. Le daily five et le récap hebdo alertent tant que le besoin n'est pas couvert par au moins deux cibles actionnables. Intentions : réserver une case du planning, tracer une contrainte de casting.",
    {
      show: z.string(),
      contrainte: z.string().describe("la demande en clair"),
      periode: z.string().optional().describe("ex. été 2026, rentrée"),
      sujets: z.array(z.string()).optional().describe("sujets à matcher dans le pipe"),
      archetype: z.enum(["big_fish", "quick_win", "pepite"]).optional(),
      genre: z.string().optional().describe("porté au besoin, non matchable automatiquement (pas dans le modèle de données)"),
      echeance: z.string().optional().describe("date limite AAAA-MM-JJ"),
    },
    { destructiveHint: false, idempotentHint: false },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const criteres: Record<string, unknown> = {};
      if (a.sujets?.length) criteres.sujets = a.sujets;
      if (a.archetype) criteres.archetype = a.archetype;
      if (a.genre) criteres.genre = a.genre;
      if (a.echeance) criteres.echeance = a.echeance;
      const { data, error } = await sb
        .from("besoins_editoriaux")
        .insert({ show_id: sid, contrainte: a.contrainte, periode: a.periode ?? null, criteres: Object.keys(criteres).length ? criteres : null })
        .select("id")
        .single();
      if (error) {
        if (/besoins_editoriaux/.test(error.message)) {
          return text({ error: "Table besoins_editoriaux absente : appliquer la migration 0040, puis réessayer.", cause: "migration_0040_manquante" });
        }
        return text({ error: error.message });
      }
      return text({ ok: true, besoin_id: (data as { id: string }).id, statut: "ouvert" });
    }
  );

  RT(
    "list_besoins",
    "Liste les besoins éditoriaux d'un show avec leur couverture par le pipe : pour chaque besoin ouvert, les cibles actionnables qui matchent les critères structurés, et une alerte si moins de deux. Intentions : qui a-t-on pour la case X, où en est le casting contre le planning.",
    { show: z.string(), statut: z.enum(["ouvert", "couvert", "expire"]).optional().describe("défaut : ouvert") },
    { readOnlyHint: true },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      if (a.statut && a.statut !== "ouvert") {
        const { data, error } = await sb
          .from("besoins_editoriaux")
          .select("id, periode, contrainte, criteres, statut, couvert_par, updated_at")
          .eq("show_id", sid)
          .eq("statut", a.statut)
          .order("updated_at", { ascending: false })
          .limit(50);
        if (error) return text({ error: error.message });
        return text({ statut: a.statut, besoins: data ?? [] });
      }
      const couverture = await evaluerCouverture(sb, sid, estivalActif());
      return text({
        statut: "ouvert",
        besoins: couverture.map((b) => ({
          id: b.besoin.id,
          periode: b.besoin.periode,
          contrainte: b.besoin.contrainte,
          criteres: b.besoin.criteres,
          alerte: b.alerte,
          candidates: b.candidates === null ? "critères non automatisables : évaluer à la main" : b.candidates,
        })),
      });
    }
  );

  W(
    "update_besoin",
    "Fait vivre un besoin éditorial : couvert (avec la cible qui le couvre), expiré, ou rouvert. Intentions : la case est prise, la fenêtre est passée, la contrainte revient.",
    {
      id: z.string().describe("id du besoin (voir list_besoins)"),
      statut: z.enum(["ouvert", "couvert", "expire"]),
      couvert_par: z.string().optional().describe("id de la cible qui couvre le besoin (avec statut=couvert)"),
    },
    { destructiveHint: false, idempotentHint: true },
    async (a) => {
      const sb = createServiceClient();
      const patch: Record<string, unknown> = { statut: a.statut, updated_at: new Date().toISOString() };
      patch.couvert_par = a.statut === "couvert" ? (a.couvert_par ?? null) : null;
      const { data, error } = await sb.from("besoins_editoriaux").update(patch).eq("id", a.id).select("id, statut").maybeSingle();
      if (error) return text({ error: error.message });
      if (!data) return text({ error: `Besoin introuvable : ${a.id}.` });
      return text({ ok: true, id: a.id, statut: a.statut, couvert_par: patch.couvert_par ?? null });
    }
  );
}
