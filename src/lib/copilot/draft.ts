// S5 — brouillon d'ouverture rédigé par le copilote, au style maison. Court,
// sobre, sans emoji, une accroche + une demande d'échange. Repli sur un gabarit
// simple si la clé IA est absente ou l'appel échoue (zéro dépendance dure).

import Anthropic from "@anthropic-ai/sdk";
import { ENRICH_MODEL, hasAnthropicKey } from "./config";

export interface DraftInput {
  nom: string;
  role?: string | null;
  organisation?: string | null;
  pourquoi?: string | null;
  angle?: string | null;
  canal?: string | null;
  langue?: string | null;
  show_nom: string;
}

/** Gabarit de repli (identique à l'esprit de buildDraft côté carte). */
export function templateDraft(a: DraftInput): string {
  const prenom = a.nom.split(/\s+/)[0];
  const en = (a.langue ?? "").toLowerCase().startsWith("en");
  const accroche = a.angle || a.pourquoi || "";
  if (en) {
    return `Hi ${prenom},\n\nI'd love to have you on ${a.show_nom}.${accroche ? ` ${accroche}` : ""}\n\nWould you be open to a conversation?`;
  }
  return `Bonjour ${prenom},\n\nJ'aimerais beaucoup vous recevoir sur ${a.show_nom}.${accroche ? ` ${accroche}` : ""}\n\nSeriez-vous ouvert(e) à un échange ?`;
}

export async function composeDraft(a: DraftInput): Promise<{ draft: string; source: "copilote" | "gabarit" }> {
  if (!hasAnthropicKey()) return { draft: templateDraft(a), source: "gabarit" };
  const en = (a.langue ?? "").toLowerCase().startsWith("en");
  const contexte = [
    `Cible : ${a.nom}${a.role ? `, ${a.role}` : ""}${a.organisation ? ` (${a.organisation})` : ""}.`,
    a.pourquoi ? `Pourquoi maintenant : ${a.pourquoi}.` : "",
    a.angle ? `Angle d'approche : ${a.angle}.` : "",
    a.canal ? `Canal : ${a.canal}.` : "",
    `Show : ${a.show_nom}.`,
  ].filter(Boolean).join("\n");

  const system = [
    "Tu rédiges un premier message d'invitation à un podcast, au nom de la production.",
    "Style maison : sobre, direct, sans emoji, phrases nettes, pas de superlatifs, pas de tiret cadratin, pas de « on ».",
    en ? "Rédige en anglais." : "Rédige en français, vouvoiement.",
    "Format : 3 à 5 lignes. Une accroche qui montre que le message est personnel (t'appuyer sur le pourquoi/angle), puis une demande d'échange claire. Pas d'objet, pas de signature.",
    "Ne fabrique aucun fait : n'utilise que le contexte fourni.",
  ].join(" ");

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: ENRICH_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: `Contexte :\n${contexte}\n\nRédige le message.` }],
    });
    const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
    if (!text) return { draft: templateDraft(a), source: "gabarit" };
    return { draft: text, source: "copilote" };
  } catch {
    return { draft: templateDraft(a), source: "gabarit" };
  }
}
