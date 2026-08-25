// Lot 4 du chantier récap (décisions du 25/08) : résumés d'items de backlog
// à la compilation. Chaque item sans resume reçoit un résumé de 2 lignes
// maximum (environ 220 caractères) au modèle rapide, PERSISTÉ dans la colonne
// resume (migration 0048) pour ne jamais être recalculé. Fallback : troncature
// propre du contenu, le cron n'échoue jamais. Le coût des appels entre dans la
// télémétrie existante via une ligne enrichment_jobs (objectif recap:resume,
// statut done, sans cible), best-effort tant que 0048 n'est pas appliquée.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "../ai/websearch";
import { ENRICH_MODEL, hasAnthropicKey } from "../copilot/config";
import type { createServiceClient } from "../supabase/service";

type SB = ReturnType<typeof createServiceClient>;

export const RESUME_MAX_CHARS = 220;
/** Garde-fou par compilation : au delà, les items restants passent au
 *  fallback troncature (une semaine normale en pose 0 à 3). */
const APPELS_MAX_PAR_COMPILATION = 15;

/** Troncature propre au mot, avec ellipse (PURE, testée) : le fallback quand
 *  le modèle est indisponible, et la borne dure appliquée à toute sortie. */
export function tronqueProprement(texte: string, max = RESUME_MAX_CHARS): string {
  const plat = texte.replace(/\s+/g, " ").trim();
  if (plat.length <= max) return plat;
  const coupe = plat.slice(0, max - 1);
  const dernierEspace = coupe.lastIndexOf(" ");
  return `${(dernierEspace > max * 0.6 ? coupe.slice(0, dernierEspace) : coupe).trimEnd()}…`;
}

const SYSTEM_RESUME = [
  "Tu résumes une demande produit du backlog Magellan (moteur de conquête d'invités podcast, Collision Productions) pour l'email récap de l'équipe.",
  "Sortie : 2 lignes maximum, environ 220 caractères au total, en français. Le résumé donne le BESOIN et le contexte minimal pour DÉCIDER (valider ou rejeter), rien d'autre. Pas de paraphrase du ton, pas de détail d'implémentation.",
  "Style : pas d'emoji, pas de tiret cadratin, pas de « on », sujet verbe complément.",
  'Réponds UNIQUEMENT en JSON : {"resume": "le résumé"}.',
].join("\n");

interface ItemAResumer { id: string; contenu: string; resume?: string | null }

/**
 * Garantit un résumé pour chaque item : lit resume s'il existe, sinon le
 * génère (modèle rapide), le borne, le persiste (best-effort) et trace le
 * coût. Renvoie la table id vers résumé. AUCUNE exception ne sort d'ici.
 */
export async function assurerResumes(sb: SB, items: ItemAResumer[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const usage = { tokens_in: 0, tokens_out: 0 };
  let appels = 0;
  const client = hasAnthropicKey() ? new Anthropic() : null;

  for (const item of items) {
    const existant = (item.resume ?? "").trim();
    if (existant) {
      out.set(item.id, tronqueProprement(existant));
      continue;
    }
    let resume: string | null = null;
    if (client && appels < APPELS_MAX_PAR_COMPILATION) {
      appels += 1;
      try {
        const res = await client.messages.create({
          model: ENRICH_MODEL,
          max_tokens: 300,
          system: SYSTEM_RESUME,
          messages: [{ role: "user", content: item.contenu.slice(0, 6000) }],
        });
        usage.tokens_in += res.usage?.input_tokens ?? 0;
        usage.tokens_out += res.usage?.output_tokens ?? 0;
        const texte = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
        const brut = extractJson<{ resume?: string }>(texte)?.resume?.trim();
        if (brut) resume = tronqueProprement(brut);
      } catch {
        /* fallback troncature ci-dessous */
      }
    }
    if (!resume) resume = tronqueProprement(item.contenu);
    out.set(item.id, resume);
    // Persistance (jamais recalculé) : best-effort tant que 0048 manque.
    try {
      await sb.from("product_backlog").update({ resume }).eq("id", item.id);
    } catch {
      /* colonne absente : le résumé vit en mémoire pour cette compilation */
    }
  }

  // Télémétrie de coût (section B) : UNE ligne par compilation, statut done
  // (la file ne revendique que pending), sans cible. Best-effort avant 0048.
  if (usage.tokens_in + usage.tokens_out > 0) {
    try {
      await sb.from("enrichment_jobs").insert({
        cible_id: null,
        objectif: "recap:resume",
        statut: "done",
        tokens_in: usage.tokens_in,
        tokens_out: usage.tokens_out,
        model: ENRICH_MODEL,
        resultat: { items: appels },
      });
    } catch {
      /* contrainte non élargie : coût non tracé, jamais bloquant */
    }
  }
  return out;
}
