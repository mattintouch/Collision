// Helper partagé : interroge Claude avec l'outil de recherche web et récupère
// un JSON structuré. Utilisé par la veille (§5) et l'enrichissement contacts.

import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_MODEL } from "../copilot/config";

/** Tokens consommés par un appel (télémétrie de coût, chantier 3). */
export interface WebSearchUsage {
  tokens_in: number;
  tokens_out: number;
}

function addUsage(u: WebSearchUsage, res: Anthropic.Message): void {
  u.tokens_in += res.usage?.input_tokens ?? 0;
  u.tokens_out += res.usage?.output_tokens ?? 0;
}

/** Retire les balises de citation de l'API (<cite index="...">texte</cite>)
 *  en gardant le texte : elles fuyaient dans les champs écrits (constat P0 du
 *  24/07, raison_de_selection de Tarik Benabdallah). Appliqué récursivement
 *  aux chaînes d'un résultat JSON. */
export function stripCitations<T>(v: T): T {
  if (typeof v === "string") {
    return (v as string).replace(/<\/?cite[^>]*>/g, "").replace(/\s{2,}/g, " ").trim() as unknown as T;
  }
  if (Array.isArray(v)) return v.map(stripCitations) as unknown as T;
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, stripCitations(x)])) as unknown as T;
  }
  return v;
}

/** Extrait le premier bloc JSON ([...] ou {...}) d'un texte (gère les ```json). */
export function extractJson<T>(text: string): T | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, "```").replace(/```/g, "");
  const candidates: string[] = [];
  const firstArr = cleaned.indexOf("[");
  const lastArr = cleaned.lastIndexOf("]");
  if (firstArr !== -1 && lastArr > firstArr)
    candidates.push(cleaned.slice(firstArr, lastArr + 1));
  const firstObj = cleaned.indexOf("{");
  const lastObj = cleaned.lastIndexOf("}");
  if (firstObj !== -1 && lastObj > firstObj)
    candidates.push(cleaned.slice(firstObj, lastObj + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Lance une requête avec recherche web et renvoie le JSON parsé (ou null).
 * Gère le `pause_turn` de la boucle d'outils serveur.
 */
export async function runWebSearchJSON<T>(
  system: string,
  prompt: string,
  maxUses = 5,
  model: string = ANTHROPIC_MODEL,
  maxTokens = 4000,
  // Accumulateur MUTÉ au fil des tours : les tokens sont comptés même si le
  // JSON final est illisible (ils ont été consommés quand même).
  usageOut?: WebSearchUsage
): Promise<T | null> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const tools = [
    // allowed_callers:["direct"] requis pour les modèles sans tool calling
    // programmatique (ex. Haiku) — et inoffensif pour les autres.
    { type: "web_search_20260209", name: "web_search", max_uses: maxUses, allowed_callers: ["direct"] },
  ] as Anthropic.MessageCreateParams["tools"];

  for (let i = 0; i < 4; i++) {
    const res = await client.messages.create({
      model,
      // Plafond paramétrable : les gros JSON (génération de fiche, groupes
      // angles/déroulé) débordent 4000 tokens ; tronqués, ils deviennent
      // illisibles et la recherche paraît « sans résultat exploitable ».
      max_tokens: maxTokens,
      system,
      tools,
      messages,
    });
    if (usageOut) addUsage(usageOut, res);

    if (res.stop_reason === "pause_turn") {
      // Outil serveur en cours : on relance pour laisser Claude continuer.
      messages.push({ role: "assistant", content: res.content });
      continue;
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return stripCitations(extractJson<T>(text));
  }
  return null;
}

/**
 * Variante diagnostique : renvoie AUSSI le texte brut et le stop_reason, pour
 * que l'appelant remonte une erreur exploitable quand le JSON est illisible
 * (refus du modèle, troncature, prose sans JSON) au lieu d'un échec muet.
 */
export async function runWebSearchJSONVerbose<T>(
  system: string,
  prompt: string,
  maxUses = 5,
  model: string = ANTHROPIC_MODEL,
  maxTokens = 4000
): Promise<{ json: T | null; text: string; stop: string | null; usage: WebSearchUsage }> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: maxUses, allowed_callers: ["direct"] },
  ] as Anthropic.MessageCreateParams["tools"];
  const usage: WebSearchUsage = { tokens_in: 0, tokens_out: 0 };

  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({ model, max_tokens: maxTokens, system, tools, messages });
    addUsage(usage, res);
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const json = extractJson<T>(text);
    if (json !== null) return { json: stripCitations(json), text, stop: res.stop_reason ?? null, usage };
    // Tour terminé SANS JSON (le modèle narre ses recherches puis s'arrête).
    // Finisher : une relance unique, sans outils, pour exiger le JSON : toute
    // la matière de recherche est déjà dans le contexte de la conversation.
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: "Réponds maintenant UNIQUEMENT avec l'objet JSON demandé, complet, sans aucun texte autour." });
    const fin = await client.messages.create({ model, max_tokens: maxTokens, system, messages });
    addUsage(usage, fin);
    const finText = fin.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return { json: stripCitations(extractJson<T>(finText)), text: finText || text, stop: fin.stop_reason ?? res.stop_reason ?? null, usage };
  }
  return { json: null, text: "", stop: "pause_turn_epuise", usage };
}
