// Veille (§5) : actualité des cibles et des entreprises, filtrée, en digest.
// Real mode : recherche web par cible. Démo : digest synthétique local.

import { getCibles } from "../data";
import { hasAnthropicKey } from "../copilot/config";
import { runWebSearchJSON } from "../ai/websearch";
import { SIGNAL_LABELS } from "../domain";
import type { CibleEnrichie, Show, SignalType } from "../types";

export interface VeilleItem {
  cible_id: string;
  cible_nom: string;
  type: SignalType;
  titre: string;
  resume: string;
  source: string | null;
  date: string | null;
  pertinence: number; // 1-5
}

export interface VeilleResult {
  items: VeilleItem[];
  demo: boolean;
}

const VALID_TYPES = new Set<SignalType>([
  "levee",
  "livre",
  "nomination",
  "prix",
  "passage_media",
  "mouvement_entreprise",
]);

function coerceType(t: unknown): SignalType {
  return VALID_TYPES.has(t as SignalType) ? (t as SignalType) : "passage_media";
}

function clampPertinence(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 3;
  return Math.min(5, Math.max(1, v));
}

const SYSTEM = [
  "Tu es l'agent de veille de Magellan (Collision Productions).",
  "Tu cherches l'actualité RÉCENTE (90 derniers jours) qui crée une fenêtre d'opportunité pour inviter une cible dans un podcast.",
  "Types de signal utiles : levee (levée de fonds), livre, nomination, prix, passage_media, mouvement_entreprise.",
  "Filtre le bruit : ne retiens que ce qui est daté, vérifiable et pertinent pour une prise de contact. Ne fabrique rien ; sans actualité fraîche, renvoie un tableau vide.",
  "Réponds UNIQUEMENT en JSON : un tableau d'objets { type, titre, resume, source, date, pertinence }.",
  "type ∈ {levee,livre,nomination,prix,passage_media,mouvement_entreprise}. date au format AAAA-MM-JJ si connue, sinon null. source = URL. pertinence = entier 1..5.",
].join("\n");

async function veilleForCible(c: CibleEnrichie): Promise<VeilleItem[]> {
  const qui =
    c.kind === "entreprise"
      ? `l'entreprise/marque « ${c.nom} »${c.secteur ? ` (${c.secteur})` : ""}`
      : `« ${c.nom} »${c.role ? ` (${c.role}${c.organisation ? `, ${c.organisation}` : ""})` : ""}`;
  const prompt = `Cherche l'actualité récente concernant ${qui}. Renvoie au plus 3 signaux pertinents, en JSON.`;

  const raw = await runWebSearchJSON<
    Array<{
      type?: string;
      titre?: string;
      resume?: string;
      source?: string;
      date?: string;
      pertinence?: number;
    }>
  >(SYSTEM, prompt, 4);

  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).map((r) => ({
    cible_id: c.id,
    cible_nom: c.nom,
    type: coerceType(r.type),
    titre: String(r.titre ?? "").slice(0, 200) || "Signal",
    resume: String(r.resume ?? "").slice(0, 600),
    source: r.source ? String(r.source).slice(0, 500) : null,
    date: r.date ? String(r.date).slice(0, 10) : null,
    pertinence: clampPertinence(r.pertinence),
  }));
}

/** Digest démo : reprend les signaux connus + synthétise pour les cibles prioritaires. */
function demoVeille(cibles: CibleEnrichie[]): VeilleItem[] {
  const items: VeilleItem[] = [];
  for (const c of cibles) {
    if (c.dernier_signal_type) {
      items.push({
        cible_id: c.id,
        cible_nom: c.nom,
        type: c.dernier_signal_type,
        titre: `${SIGNAL_LABELS[c.dernier_signal_type]} — ${c.nom}`,
        resume: `Signal connu, fenêtre ${c.signal_frais ? "ouverte" : "à confirmer"}. (démo)`,
        source: null,
        date: c.dernier_signal_date ? c.dernier_signal_date.slice(0, 10) : null,
        pertinence: c.dernier_signal_pertinence ?? 3,
      });
    } else if (c.priorite === "haute") {
      items.push({
        cible_id: c.id,
        cible_nom: c.nom,
        type: c.kind === "entreprise" ? "mouvement_entreprise" : "passage_media",
        titre: `Veille à lancer — ${c.nom}`,
        resume:
          "Aucune actualité fraîche en base. Branche ANTHROPIC_API_KEY pour la veille web réelle. (démo)",
        source: null,
        date: null,
        pertinence: 2,
      });
    }
  }
  return items.sort((a, b) => b.pertinence - a.pertinence);
}

export async function runVeille(
  showId: string,
  opts?: { limit?: number }
): Promise<VeilleResult> {
  const cibles = await getCibles(showId);
  // On vise les cibles non publiées, par priorité.
  const ranked = [...cibles]
    .filter((c) => c.stage_key !== "publie" && c.stage_key !== "produit")
    .sort((a, b) =>
      a.priorite === b.priorite ? 0 : a.priorite === "haute" ? -1 : 1
    )
    .slice(0, opts?.limit ?? 6);

  if (!hasAnthropicKey()) {
    return { items: demoVeille(ranked), demo: true };
  }

  const batches = await Promise.all(ranked.map((c) => veilleForCible(c)));
  const items = batches
    .flat()
    .sort((a, b) => b.pertinence - a.pertinence);
  return { items, demo: false };
}
