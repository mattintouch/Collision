// Outils exposés au connecteur MCP (lecture + écriture), via le client service.
// Mêmes capacités que le copilote intégré, pour l'app Claude.

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createServiceClient } from "../supabase/service";
import { folkAddAlly, folkAddPhone, folkLogTouche } from "../folk/write";

type SB = ReturnType<typeof createServiceClient>;

function text(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function showRow(sb: SB, ref: string) {
  // `id` est un uuid : comparer id.eq à un slug ("gdiy") fait échouer toute la
  // requête côté PostgREST. On cible donc la bonne colonne selon le format.
  const col = UUID_RE.test(ref) ? "id" : "slug";
  const { data } = await sb
    .from("shows")
    .select("id, slug, type_pipe")
    .eq(col, ref)
    .maybeSingle();
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

export function registerMagellanTools(server: McpServer) {
  server.tool("list_shows", "Liste les shows (podcasts) et leurs étapes.", {}, async () => {
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
    },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      let q = sb.from("cibles_enrichies").select("*").eq("show_id", sid);
      if (a.voie) q = q.eq("voie", a.voie);
      if (a.archetype) q = q.eq("archetype", a.archetype);
      if (a.stage_key) q = q.eq("stage_key", a.stage_key);
      if (a.kind) q = q.eq("kind", a.kind);
      const { data, error } = await q;
      return error ? text({ error: error.message }) : text(data);
    }
  );

  server.tool(
    "get_dossier",
    "Dossier complet d'une cible : champs, appuis, journal, signaux, contacts.",
    { cible_id: z.string() },
    async (a) => {
      const sb = createServiceClient();
      const [c, appuis, touches, signals, contacts] = await Promise.all([
        sb.from("cibles_enrichies").select("*").eq("id", a.cible_id).maybeSingle(),
        sb.from("appuis").select("*").eq("cible_id", a.cible_id),
        sb.from("touches").select("*").eq("cible_id", a.cible_id).order("date", { ascending: false }),
        sb.from("signals").select("*").eq("cible_id", a.cible_id).order("date", { ascending: false }),
        sb.from("contacts").select("*").eq("cible_id", a.cible_id),
      ]);
      if (!c.data) return text({ error: "Cible introuvable" });
      return text({ cible: c.data, appuis: appuis.data, touches: touches.data, signals: signals.data, contacts: contacts.data });
    }
  );

  server.tool(
    "create_cible",
    "Crée une cible dans un show (si absente).",
    { show: z.string(), nom: z.string(), role: z.string().optional(), organisation: z.string().optional() },
    async (a) => {
      const sb = createServiceClient();
      const show = await showRow(sb, a.show);
      if (!show) return text({ error: "Show introuvable" });
      const c = await ensureCible(sb, show, a.nom);
      if (c && (a.role || a.organisation)) {
        await sb.from("cibles").update({ role: a.role ?? null, organisation: a.organisation ?? null }).eq("id", c.id);
      }
      return text({ ok: true, cible: c });
    }
  );

  server.tool(
    "add_appui",
    "Ajoute un allié/appui à une cible (relié à sa fiche si l'allié est une cible). Crée la cible visée si besoin. MAJ Folk.",
    {
      show: z.string(),
      cible: z.string(),
      allie: z.string(),
      type: z.enum(["ancien_invite", "conseiller", "entourage", "contact_interne"]).optional(),
      note: z.string().optional(),
      creer_allie_comme_cible: z.boolean().optional(),
    },
    async (a) => {
      const sb = createServiceClient();
      const show = await showRow(sb, a.show);
      if (!show) return text({ error: "Show introuvable" });
      const target = await ensureCible(sb, show, a.cible);
      if (!target) return text({ error: "Cible introuvable" });
      let ally = await resolveCible(sb, show.id, a.allie);
      if (!ally && a.creer_allie_comme_cible) ally = await ensureCible(sb, show, a.allie);
      const { error } = await sb.from("appuis").insert({
        cible_id: target.id,
        nom: a.allie,
        type: a.type ?? "ancien_invite",
        note: a.note ?? null,
        ally_cible_id: ally?.id ?? null,
      });
      if (error) return text({ error: error.message });
      const folk = await folkAddAlly(target.nom, a.allie, a.note);
      return text({ ok: true, cible: target.nom, allie: a.allie, lie: !!ally, folk: folk.detail });
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
    "Logge une touche sur une cible (remet le compteur à zéro).",
    { show: z.string(), cible: z.string(), contenu: z.string(), canal: z.string().optional() },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: "Show introuvable" });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });
      const { error } = await sb.from("touches").insert({ cible_id: target.id, contenu: a.contenu, canal: a.canal ?? null, source: "saisie" });
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
    },
    async (a) => {
      const sb = createServiceClient();
      const sid = await showId(sb, a.show);
      if (!sid) return text({ error: `Show introuvable: ${a.show}` });
      const target = await resolveCible(sb, sid, a.cible);
      if (!target) return text({ error: `Cible « ${a.cible} » introuvable.` });

      const fields = [
        "nom", "role", "organisation", "secteur", "pays", "envergure",
        "priorite", "voie", "archetype", "sujets", "raison_de_selection", "etat_recherche",
      ] as const;
      const patch: Record<string, unknown> = {};
      for (const f of fields) if (a[f] !== undefined) patch[f] = a[f];
      if (Object.keys(patch).length === 0) {
        return text({ error: "Aucun champ à mettre à jour." });
      }

      const { error } = await sb.from("cibles").update(patch).eq("id", target.id);
      if (error) return text({ error: error.message });
      return text({ ok: true, cible: target.nom, modifie: Object.keys(patch) });
    }
  );

  server.tool(
    "validate_cible",
    "Valide une cible : bascule en épisode avec son contexte.",
    { show: z.string(), cible: z.string() },
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
}
