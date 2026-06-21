// Enrichissement contacts : trouver par où joindre une cible difficile.
// Sources PUBLIQUES, finalité prise de contact professionnelle (RGPD).
// Real mode : recherche web. Démo : suggestions synthétiques locales.

import { hasAnthropicKey } from "../copilot/config";
import { runWebSearchJSON } from "../ai/websearch";
import type { CibleEnrichie, ContactKind } from "../types";

export interface ContactSuggestion {
  kind: ContactKind;
  valeur: string;
  label: string | null;
  source: string | null;
  confiance: number; // 1-5
}

export interface EnrichResult {
  contacts: ContactSuggestion[];
  demo: boolean;
}

const VALID_KINDS = new Set<ContactKind>([
  "email",
  "telephone",
  "reseau",
  "agence",
  "site",
  "autre",
]);

function coerceKind(k: unknown): ContactKind {
  return VALID_KINDS.has(k as ContactKind) ? (k as ContactKind) : "autre";
}
function clampConf(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 2;
  return Math.min(5, Math.max(1, v));
}

const SYSTEM = [
  "Tu es l'agent d'enrichissement de contacts de Magellan (Collision Productions).",
  "Objectif : trouver la meilleure VOIE pour joindre une cible, surtout quand le mail direct ne suffit pas.",
  "Règles strictes :",
  "- Sources PUBLIQUES uniquement (sites officiels, espaces presse, fiches d'agence/management, registres d'entreprise, profils pro). Finalité : prise de contact professionnelle (RGPD).",
  "- Pour une personne, privilégie les voies indirectes professionnelles : agence, management, attaché de presse, formulaire officiel, profil réseau pro. Ne donne un numéro personnel que s'il est publié publiquement par la personne elle-même.",
  "- Pour une entreprise/marque : standard téléphonique public, service de presse, formulaire de contact, RP.",
  "- N'invente JAMAIS un email ou un numéro. Si tu n'es pas sûr, ne le mets pas. Indique toujours la source (URL) et un niveau de confiance.",
  "Réponds UNIQUEMENT en JSON : un tableau d'objets { kind, valeur, label, source, confiance }.",
  "kind ∈ {email,telephone,reseau,agence,site,autre}. confiance = entier 1..5. source = URL.",
].join("\n");

async function enrichWeb(c: CibleEnrichie): Promise<ContactSuggestion[]> {
  const qui =
    c.kind === "entreprise"
      ? `l'entreprise/marque « ${c.nom} »${c.secteur ? ` (${c.secteur}${c.pays ? `, ${c.pays}` : ""})` : ""}`
      : `« ${c.nom} »${c.role ? ` (${c.role}${c.organisation ? `, ${c.organisation}` : ""})` : ""}`;
  const prompt = `Trouve par où joindre ${qui} pour une invitation podcast. Voies publiques et professionnelles, avec source et confiance. JSON.`;

  const raw = await runWebSearchJSON<
    Array<{
      kind?: string;
      valeur?: string;
      label?: string;
      source?: string;
      confiance?: number;
    }>
  >(SYSTEM, prompt, 5);

  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r.valeur)
    .slice(0, 8)
    .map((r) => ({
      kind: coerceKind(r.kind),
      valeur: String(r.valeur).slice(0, 300),
      label: r.label ? String(r.label).slice(0, 200) : null,
      source: r.source ? String(r.source).slice(0, 500) : null,
      confiance: clampConf(r.confiance),
    }));
}

function demoEnrich(c: CibleEnrichie): ContactSuggestion[] {
  if (c.kind === "entreprise") {
    return [
      { kind: "site", valeur: `Formulaire de contact — ${c.nom}`, label: "Page officielle", source: "site officiel (démo)", confiance: 4 },
      { kind: "email", valeur: "presse@exemple.com", label: "Service de presse", source: "espace presse (démo)", confiance: 3 },
      { kind: "telephone", valeur: "+33 X XX XX XX XX", label: "Standard", source: "page contact (démo)", confiance: 2 },
      { kind: "reseau", valeur: "LinkedIn entreprise", label: "Page société", source: "LinkedIn (démo)", confiance: 3 },
    ];
  }
  const out: ContactSuggestion[] = [
    { kind: "agence", valeur: "Agence / management", label: "Voie indirecte conseillée", source: "fiche agence (démo)", confiance: 4 },
    { kind: "reseau", valeur: "Profil Instagram / LinkedIn", label: "DM", source: "réseau (démo)", confiance: 3 },
  ];
  if (c.organisation)
    out.push({ kind: "email", valeur: `prenom.nom@${c.organisation.toLowerCase().replace(/\s+/g, "")}.com`, label: "Email pro (à vérifier)", source: "déduction (démo)", confiance: 1 });
  return out;
}

export async function enrichCible(c: CibleEnrichie): Promise<EnrichResult> {
  if (!hasAnthropicKey()) return { contacts: demoEnrich(c), demo: true };
  return { contacts: await enrichWeb(c), demo: false };
}
