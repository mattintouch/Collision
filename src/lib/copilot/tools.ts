// Outils du copilote : lecture de la base (mêmes capacités que le serveur MCP).

import type Anthropic from "@anthropic-ai/sdk";
import { getCibleDossier, getCibles } from "../data";
import { computeResurgence, CONSEIL_LABELS, SIGNAL_LABELS } from "../domain";
import type { CibleEnrichie } from "../types";

export interface ToolContext {
  showId: string;
  showSlug: string;
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

  if (name === "get_dossier") {
    const { cible, appuis, touches, signals } = await getCibleDossier(
      String(input.cible_id)
    );
    if (!cible) return JSON.stringify({ error: "Cible introuvable" });
    return JSON.stringify(
      { cible: summarize(cible), appuis, touches, signals },
      null,
      2
    );
  }

  return JSON.stringify({ error: `Outil inconnu: ${name}` });
}
