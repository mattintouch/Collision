// Outils du copilote : lecture de la base (mêmes capacités que le serveur MCP).

import type Anthropic from "@anthropic-ai/sdk";
import { getCibleDossier, getCibles } from "../data";
import { getFreeSlots } from "../calendar";
import { createClient } from "../supabase/server";
import { folkAddAlly, folkAddPhone, folkLogTouche } from "../folk/write";
import { computeResurgence, CONSEIL_LABELS, SIGNAL_LABELS } from "../domain";
import type { CibleEnrichie } from "../types";

export interface ToolContext {
  showId: string;
  showSlug: string;
  typePipe: "invites" | "thematique";
  providerToken?: string | null;
}

type SupabaseServer = ReturnType<typeof createClient>;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Résout une cible par id (uuid) ou par nom (ilike) dans le show. */
async function resolveCible(
  sb: SupabaseServer,
  showId: string,
  ref: string
): Promise<{ id: string; nom: string } | null> {
  if (UUID_RE.test(ref)) {
    const { data } = await sb.from("cibles").select("id, nom").eq("id", ref).maybeSingle();
    if (data) return data as { id: string; nom: string };
  }
  const { data } = await sb
    .from("cibles")
    .select("id, nom")
    .eq("show_id", showId)
    .ilike("nom", `%${ref}%`)
    .limit(2);
  const rows = (data ?? []) as { id: string; nom: string }[];
  return rows.length === 1 ? rows[0] : null;
}

async function ensureCible(
  sb: SupabaseServer,
  ctx: ToolContext,
  nom: string
): Promise<{ id: string; nom: string } | null> {
  const found = await resolveCible(sb, ctx.showId, nom);
  if (found) return found;
  const { data: stage } = await sb
    .from("stages")
    .select("id")
    .eq("show_id", ctx.showId)
    .order("position")
    .limit(1)
    .maybeSingle();
  const { data } = await sb
    .from("cibles")
    .insert({
      show_id: ctx.showId,
      kind: ctx.typePipe === "invites" ? "personne" : "entreprise",
      nom,
      stage_id: stage?.id ?? null,
      priorite: "moyenne",
      voie: "froid",
    })
    .select("id, nom")
    .single();
  return (data as { id: string; nom: string }) ?? null;
}

export const toolDefs: Anthropic.Tool[] = [
  {
    name: "list_cibles",
    description:
      "Liste les cibles du show courant, enrichies du moteur de résurgence (pourquoi maintenant, conseil de relance, jours depuis la dernière touche, dernier signal, nombre d'appuis). Filtre optionnel par voie, archétype, étape ou type.",
    input_schema: {
      type: "object",
      properties: {
        voie: { type: "string", enum: ["froid", "chaud"] },
        archetype: {
          type: "string",
          enum: ["big_fish", "quick_win", "pepite"],
        },
        stage_key: { type: "string" },
        kind: { type: "string", enum: ["personne", "entreprise"] },
      },
    },
  },
  {
    name: "get_dossier",
    description:
      "Dossier complet d'une cible : champs, appuis (qui ouvre une porte), journal des touches, signaux.",
    input_schema: {
      type: "object",
      properties: { cible_id: { type: "string" } },
      required: ["cible_id"],
    },
  },
  {
    name: "list_free_slots",
    description:
      "Créneaux libres à venir dans Google Calendar (7 prochains jours, heures ouvrées). À utiliser pour proposer des cibles en face d'une vraie disponibilité.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_cible",
    description:
      "Crée une cible dans le show courant (si elle n'existe pas déjà). Retourne son id.",
    input_schema: {
      type: "object",
      properties: {
        nom: { type: "string" },
        role: { type: "string" },
        organisation: { type: "string" },
      },
      required: ["nom"],
    },
  },
  {
    name: "add_appui",
    description:
      "Ajoute un allié/appui à une cible (qui ouvre une porte / aide à closer). Si l'allié est lui-même une cible du show, le lien vers sa fiche est créé. Si l'allié est un invité (déjà enregistré ou à inviter) pas encore dans le pipe, mets creer_allie_comme_cible=true pour créer sa fiche et relier les deux. Crée aussi la cible visée si elle n'existe pas. Met à jour la fiche Folk si possible.",
    input_schema: {
      type: "object",
      properties: {
        cible: { type: "string", description: "nom ou id de la cible à aider (ex: Jean-Marie Messier)" },
        allie: { type: "string", description: "nom de l'allié (ex: Patrick Sayer)" },
        nature: { type: "string", enum: ["ancien_invite", "conseiller", "entourage", "contact_interne"], description: "ce qu'est l'appui" },
        type: { type: "string", enum: ["ancien_invite", "conseiller", "entourage", "contact_interne"], description: "DÉPRÉCIÉ : alias de nature" },
        est_relais: { type: "boolean", description: "true si l'allié ouvre la porte (relais d'introduction) — passe la cible en voie chaude" },
        note: { type: "string", description: "pourquoi / contexte (ex: enregistré lundi, épisode à venir)" },
        creer_allie_comme_cible: {
          type: "boolean",
          description: "true si l'allié est un invité à avoir aussi comme cible (crée sa fiche + relie)",
        },
        etape_allie: {
          type: "string",
          description: "étape de l'allié si on le crée (ex: enregistre, publie, confirme) — défaut: étape initiale",
        },
      },
      required: ["cible", "allie"],
    },
  },
  {
    name: "add_contact",
    description:
      "Ajoute un moyen de contact à une cible (email, téléphone, réseau…). Met aussi à jour la fiche Folk pour un téléphone.",
    input_schema: {
      type: "object",
      properties: {
        cible: { type: "string" },
        kind: { type: "string", enum: ["email", "telephone", "reseau", "agence", "site", "autre"] },
        valeur: { type: "string" },
        label: { type: "string" },
      },
      required: ["cible", "kind", "valeur"],
    },
  },
  {
    name: "log_touche",
    description: "Logge une touche (interaction) sur une cible. Remet le compteur à zéro.",
    input_schema: {
      type: "object",
      properties: {
        cible: { type: "string" },
        contenu: { type: "string" },
        canal: { type: "string" },
      },
      required: ["cible", "contenu"],
    },
  },
  {
    name: "validate_cible",
    description: "Valide une cible : la bascule en épisode en emmenant son contexte (appuis inclus).",
    input_schema: {
      type: "object",
      properties: { cible: { type: "string" } },
      required: ["cible"],
    },
  },
];

/** Vue compacte d'une cible enrichie pour le contexte du modèle. */
function summarize(c: CibleEnrichie) {
  const r = computeResurgence(c);
  return {
    id: c.id,
    nom: c.nom,
    kind: c.kind,
    voie: c.voie,
    priorite: c.priorite,
    etape: c.stage_label,
    archetype: c.archetype,
    raison_de_selection: c.raison_de_selection,
    etat_recherche: c.etat_recherche,
    role: c.role,
    organisation: c.organisation,
    secteur: c.secteur,
    sujets: c.sujets,
    canal_reel: c.canal_reel,
    via_qui: c.via_qui,
    jours_depuis_touche: c.jours_depuis_touche,
    dernier_signal: c.dernier_signal_type
      ? { type: SIGNAL_LABELS[c.dernier_signal_type], frais: c.signal_frais }
      : null,
    nb_appuis: c.nb_appuis,
    pourquoi_maintenant: r.raison,
    conseil: CONSEIL_LABELS[r.conseil],
    score: r.score,
  };
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  if (name === "list_cibles") {
    let cibles = await getCibles(ctx.showId);
    if (input.voie) cibles = cibles.filter((c) => c.voie === input.voie);
    if (input.archetype)
      cibles = cibles.filter((c) => c.archetype === input.archetype);
    if (input.stage_key)
      cibles = cibles.filter((c) => c.stage_key === input.stage_key);
    if (input.kind) cibles = cibles.filter((c) => c.kind === input.kind);
    // Voie froide devant, puis score de résurgence.
    cibles.sort((a, b) => {
      if (a.voie !== b.voie) return a.voie === "froid" ? -1 : 1;
      return computeResurgence(b).score - computeResurgence(a).score;
    });
    return JSON.stringify(cibles.map(summarize), null, 2);
  }

  if (name === "list_free_slots") {
    const { slots, demo } = await getFreeSlots(ctx.providerToken);
    return JSON.stringify({ demo, slots: slots.map((s) => s.label) }, null, 2);
  }

  if (name === "get_dossier") {
    const { cible, appuis, touches, signals, contacts } = await getCibleDossier(
      String(input.cible_id)
    );
    if (!cible) return JSON.stringify({ error: "Cible introuvable" });
    return JSON.stringify(
      { cible: summarize(cible), appuis, touches, signals, contacts },
      null,
      2
    );
  }

  // --- Écritures (agissent au nom de l'utilisateur connecté, via sa session) ---
  if (
    name === "create_cible" ||
    name === "add_appui" ||
    name === "add_contact" ||
    name === "log_touche" ||
    name === "validate_cible"
  ) {
    const sb = createClient();

    if (name === "create_cible") {
      const c = await ensureCible(sb, ctx, String(input.nom));
      if (!c) return JSON.stringify({ error: "Création impossible." });
      if (input.role || input.organisation) {
        await sb.from("cibles").update({
          role: input.role ?? null,
          organisation: input.organisation ?? null,
        }).eq("id", c.id);
      }
      return JSON.stringify({ ok: true, cible: c });
    }

    if (name === "add_appui") {
      const target = await ensureCible(sb, ctx, String(input.cible));
      if (!target) return JSON.stringify({ error: "Cible introuvable / non créée." });
      let ally = await resolveCible(sb, ctx.showId, String(input.allie));
      // Allié invité pas encore dans le pipe : on crée sa fiche pour relier.
      if (!ally && input.creer_allie_comme_cible) {
        ally = await ensureCible(sb, ctx, String(input.allie));
        if (ally && input.etape_allie) {
          const { data: st } = await sb
            .from("stages")
            .select("id")
            .eq("show_id", ctx.showId)
            .eq("key", String(input.etape_allie))
            .maybeSingle();
          if (st) await sb.from("cibles").update({ stage_id: st.id }).eq("id", ally.id);
        }
      }
      const est_relais = Boolean(input.est_relais);
      const { error } = await sb.from("appuis").insert({
        cible_id: target.id,
        nom: String(input.allie),
        nature: (input.nature as string) ?? (input.type as string) ?? "ancien_invite",
        est_relais,
        note: (input.note as string) ?? null,
        ally_cible_id: ally?.id ?? null,
      });
      if (error) return JSON.stringify({ error: error.message });
      // Règle transverse : un relais → voie chaud par défaut.
      if (est_relais) await sb.from("cibles").update({ voie: "chaud" }).eq("id", target.id);
      const folk = await folkAddAlly(target.nom, String(input.allie), (input.note as string) ?? undefined);
      return JSON.stringify({
        ok: true,
        appui: { cible: target.nom, allie: input.allie, lie_a_la_fiche: !!ally },
        folk: folk.detail,
      });
    }

    if (name === "add_contact") {
      const target = await resolveCible(sb, ctx.showId, String(input.cible));
      if (!target) return JSON.stringify({ error: `Cible « ${input.cible} » introuvable.` });
      const { error } = await sb.from("contacts").insert({
        cible_id: target.id,
        kind: String(input.kind),
        valeur: String(input.valeur),
        label: (input.label as string) ?? null,
        source: "Copilote",
        confiance: 4,
      });
      if (error) return JSON.stringify({ error: error.message });
      let folkDetail: string | undefined;
      if (input.kind === "telephone") {
        const folk = await folkAddPhone(target.nom, String(input.valeur));
        folkDetail = folk.detail;
      }
      return JSON.stringify({ ok: true, cible: target.nom, folk: folkDetail });
    }

    if (name === "log_touche") {
      const target = await resolveCible(sb, ctx.showId, String(input.cible));
      if (!target) return JSON.stringify({ error: `Cible « ${input.cible} » introuvable.` });
      const { error } = await sb.from("touches").insert({
        cible_id: target.id,
        contenu: String(input.contenu),
        canal: (input.canal as string) ?? null,
        source: "saisie",
      });
      if (error) return JSON.stringify({ error: error.message });
      const folk = await folkLogTouche(target.nom, String(input.contenu), (input.canal as string) ?? null);
      return JSON.stringify({ ok: true, cible: target.nom, folk: folk.detail });
    }

    if (name === "validate_cible") {
      const target = await resolveCible(sb, ctx.showId, String(input.cible));
      if (!target) return JSON.stringify({ error: `Cible « ${input.cible} » introuvable.` });
      const { data, error } = await sb.rpc("validate_cible", { target_cible: target.id });
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ ok: true, cible: target.nom, episode_id: data });
    }
  }

  return JSON.stringify({ error: `Outil inconnu: ${name}` });
}
