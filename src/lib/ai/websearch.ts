// Helper partagé : interroge Claude avec l'outil de recherche web et récupère
// un JSON structuré. Utilisé par la veille (§5) et l'enrichissement contacts.

import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_MODEL } from "../copilot/config";

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
  model: string = ANTHROPIC_MODEL
): Promise<T | null> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: maxUses },
  ] as Anthropic.MessageCreateParams["tools"];

  for (let i = 0; i < 4; i++) {
    const res = await client.messages.create({
      model,
      max_tokens: 4000,
      system,
      tools,
      messages,
    });

    if (res.stop_reason === "pause_turn") {
      // Outil serveur en cours : on relance pour laisser Claude continuer.
      messages.push({ role: "assistant", content: res.content });
      continue;
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return extractJson<T>(text);
  }
  return null;
}
