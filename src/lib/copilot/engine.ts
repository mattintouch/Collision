// Moteur du copilote : boucle d'outils sur l'API Claude, ou repli heuristique
// en mode démo (sans clé). Modèle frontier pour le copilote (§9).

import Anthropic from "@anthropic-ai/sdk";
import type { Show } from "../types";
import {
  ANTHROPIC_MODEL,
  hasAnthropicKey,
  systemPrompt,
  type ChatMessage,
} from "./config";
import { heuristicReply } from "./heuristic";
import { runTool, toolDefs, type ToolContext } from "./tools";

export interface CopilotResult {
  text: string;
  demo: boolean;
}

export async function copilotReply(
  show: Show,
  showId: string,
  messages: ChatMessage[],
  slot?: string
): Promise<CopilotResult> {
  // Mode démo : pas de clé branchée → heuristique sur les données locales.
  if (!hasAnthropicKey()) {
    const lastUser =
      [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    return { text: await heuristicReply(show, showId, lastUser), demo: true };
  }

  const client = new Anthropic();
  const ctx: ToolContext = { showId, showSlug: show.slug };
  const convo: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Boucle agentique manuelle (lecture base via outils).
  for (let i = 0; i < 6; i++) {
    const res = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: systemPrompt(show, slot),
      tools: toolDefs,
      messages: convo,
    });

    if (res.stop_reason === "tool_use") {
      // Écho du contenu (blocs thinking inclus) puis résultats d'outils.
      convo.push({ role: "assistant", content: res.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type === "tool_use") {
          const out = await runTool(
            block.name,
            (block.input ?? {}) as Record<string, unknown>,
            ctx
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: out,
          });
        }
      }
      convo.push({ role: "user", content: toolResults });
      continue;
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { text: text || "(réponse vide)", demo: false };
  }

  return {
    text: "Le copilote a atteint la limite d'itérations sans conclure.",
    demo: false,
  };
}
