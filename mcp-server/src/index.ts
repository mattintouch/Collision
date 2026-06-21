#!/usr/bin/env node
/**
 * Serveur MCP Magellan (cahier des charges §9, Étape 2).
 * Expose la base Supabase en lecture et écriture :
 *   - lister et filtrer les cibles par show, voie et archétype
 *   - lire un dossier
 *   - créer une cible
 *   - logger une touche
 *   - marquer une validation
 *
 * Se branche comme connecteur dans Claude (stdio) et est consommé par le
 * copilote de l'app. Utilise la clé service role (accès serveur de confiance).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "Magellan MCP : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

/** Résout un show par slug OU id. */
async function resolveShowId(showRef: string): Promise<string | null> {
  const { data } = await supabase
    .from("shows")
    .select("id, slug")
    .or(`slug.eq.${showRef},id.eq.${showRef}`)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

function text(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

const server = new McpServer({
  name: "magellan",
  version: "0.1.0",
});

// --- list_shows --------------------------------------------------------------
server.tool(
  "list_shows",
  "Liste les shows (podcasts) et leurs étapes configurées.",
  {},
  async () => {
    const { data: shows, error } = await supabase
      .from("shows")
      .select("*, stages(key, label, position, is_final)")
      .order("nom");
    if (error) return text({ error: error.message });
    return text(shows);
  }
);

// --- list_cibles -------------------------------------------------------------
server.tool(
  "list_cibles",
  "Liste et filtre les cibles d'un show par voie, archétype, étape ou type. Retourne les cibles enrichies (jours depuis touche, dernier signal, nb d'appuis).",
  {
    show: z.string().describe("slug (gdiy, ccg, fleurons) ou id du show"),
    voie: z.enum(["froid", "chaud"]).optional(),
    archetype: z.enum(["big_fish", "quick_win", "pepite"]).optional(),
    stage_key: z.string().optional().describe("ex: identifie, qualifie, contacte"),
    kind: z.enum(["personne", "entreprise"]).optional(),
  },
  async ({ show, voie, archetype, stage_key, kind }) => {
    const showId = await resolveShowId(show);
    if (!showId) return text({ error: `Show introuvable: ${show}` });

    let query = supabase
      .from("cibles_enrichies")
      .select("*")
      .eq("show_id", showId);
    if (voie) query = query.eq("voie", voie);
    if (archetype) query = query.eq("archetype", archetype);
    if (stage_key) query = query.eq("stage_key", stage_key);
    if (kind) query = query.eq("kind", kind);

    const { data, error } = await query;
    if (error) return text({ error: error.message });
    return text(data);
  }
);

// --- get_dossier -------------------------------------------------------------
server.tool(
  "get_dossier",
  "Lit le dossier complet d'une cible : champs enrichis, appuis, journal des touches, signaux.",
  { cible_id: z.string() },
  async ({ cible_id }) => {
    const [cible, appuis, touches, signals] = await Promise.all([
      supabase.from("cibles_enrichies").select("*").eq("id", cible_id).maybeSingle(),
      supabase.from("appuis").select("*").eq("cible_id", cible_id),
      supabase.from("touches").select("*").eq("cible_id", cible_id).order("date", { ascending: false }),
      supabase.from("signals").select("*").eq("cible_id", cible_id).order("date", { ascending: false }),
    ]);
    if (!cible.data) return text({ error: "Cible introuvable" });
    return text({
      cible: cible.data,
      appuis: appuis.data ?? [],
      touches: touches.data ?? [],
      signals: signals.data ?? [],
    });
  }
);

// --- create_cible ------------------------------------------------------------
server.tool(
  "create_cible",
  "Crée une cible (personne pour GDIY/CCG, entreprise pour Fleurons). Place la cible sur l'étape initiale du show.",
  {
    show: z.string(),
    kind: z.enum(["personne", "entreprise"]),
    nom: z.string(),
    priorite: z.enum(["haute", "moyenne", "basse"]).default("moyenne"),
    voie: z.enum(["froid", "chaud"]).default("froid"),
    sujets: z.array(z.string()).default([]),
    canal_reel: z.string().optional(),
    via_qui: z.string().optional(),
    role: z.string().optional(),
    organisation: z.string().optional(),
    archetype: z.enum(["big_fish", "quick_win", "pepite"]).optional(),
    secteur: z.string().optional(),
    pays: z.string().optional(),
    envergure: z.enum(["fr", "international"]).optional(),
    raison_de_selection: z.string().optional(),
    etat_recherche: z.string().optional(),
  },
  async (input) => {
    const showId = await resolveShowId(input.show);
    if (!showId) return text({ error: `Show introuvable: ${input.show}` });

    const { data: firstStage } = await supabase
      .from("stages")
      .select("id")
      .eq("show_id", showId)
      .order("position")
      .limit(1)
      .maybeSingle();

    const isPers = input.kind === "personne";
    const { data, error } = await supabase
      .from("cibles")
      .insert({
        show_id: showId,
        kind: input.kind,
        nom: input.nom,
        stage_id: firstStage?.id ?? null,
        priorite: input.priorite,
        voie: input.voie,
        sujets: input.sujets,
        canal_reel: input.canal_reel ?? null,
        via_qui: input.via_qui ?? null,
        role: isPers ? input.role ?? null : null,
        organisation: isPers ? input.organisation ?? null : null,
        archetype: isPers ? input.archetype ?? null : null,
        secteur: !isPers ? input.secteur ?? null : null,
        pays: !isPers ? input.pays ?? null : null,
        envergure: !isPers ? input.envergure ?? null : null,
        raison_de_selection: !isPers ? input.raison_de_selection ?? null : null,
        etat_recherche: !isPers ? input.etat_recherche ?? null : null,
      })
      .select("*")
      .single();
    if (error) return text({ error: error.message });
    return text({ ok: true, cible: data });
  }
);

// --- log_touche --------------------------------------------------------------
server.tool(
  "log_touche",
  "Logge une touche sur une cible. Remet le compteur (date_derniere_touche) à zéro via trigger.",
  {
    cible_id: z.string(),
    contenu: z.string(),
    canal: z.string().optional(),
    source: z.enum(["saisie", "capture"]).default("saisie"),
  },
  async ({ cible_id, contenu, canal, source }) => {
    const { data, error } = await supabase
      .from("touches")
      .insert({ cible_id, contenu, canal: canal ?? null, source })
      .select("*")
      .single();
    if (error) return text({ error: error.message });
    return text({ ok: true, touche: data });
  }
);

// --- validate_cible ----------------------------------------------------------
server.tool(
  "validate_cible",
  "Marque une cible comme validée : crée l'épisode en emmenant son contexte et place la cible sur l'étape finale.",
  { cible_id: z.string() },
  async ({ cible_id }) => {
    const { data, error } = await supabase.rpc("validate_cible", {
      target_cible: cible_id,
    });
    if (error) return text({ error: error.message });
    return text({ ok: true, episode_id: data });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Magellan MCP server prêt (stdio).");
