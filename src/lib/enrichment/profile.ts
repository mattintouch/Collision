// Enrichissement de FICHE (profil) par recherche web sourcée : rôle,
// organisation, secteur, pays, réseaux sociaux, sujets, angle d'épisode.
// Sources publiques, jamais d'invention. Propose, puis écrit sur validation.

import { runWebSearchJSON } from "../ai/websearch";
import { hasAnthropicKey } from "../copilot/config";
import { createServiceClient } from "../supabase/service";
import type { CibleEnrichie } from "../types";

type SB = ReturnType<typeof createServiceClient>;

export interface ProfileProposal {
  role?: string | null;
  organisation?: string | null;
  secteur?: string | null;
  pays?: string | null;
  raison_de_selection?: string | null;
  resume?: string | null;
  sujets?: string[];
  reseaux?: { label?: string | null; url: string }[];
  sources?: string[];
}

const SYSTEM = [
  "Tu es l'agent d'enrichissement de fiches invités de Magellan (Collision Productions).",
  "Recherche des informations PUBLIQUES et VÉRIFIABLES pour préparer une invitation podcast.",
  "Règles : sources publiques uniquement ; n'invente JAMAIS ; cite les URLs ; reste factuel et concis.",
  "Réponds UNIQUEMENT en JSON : { role, organisation, secteur, pays, sujets:[...], reseaux:[{label,url}], resume, raison_de_selection, sources:[url] }.",
  "resume = 2-3 phrases de fond. raison_de_selection = pourquoi cette personne ferait un bon épisode. sujets = mots-clés.",
].join("\n");

export async function enrichCibleProfile(c: CibleEnrichie): Promise<ProfileProposal | null> {
  if (!hasAnthropicKey()) return null;
  const qui =
    c.kind === "entreprise"
      ? `l'entreprise/marque « ${c.nom} »${c.secteur ? ` (${c.secteur})` : ""}`
      : `« ${c.nom} »${c.role ? ` (${c.role}${c.organisation ? `, ${c.organisation}` : ""})` : ""}`;
  const prompt = `Enrichis la fiche de ${qui}. Parcours et rôle actuel, organisation, secteur, pays, réseaux sociaux (LinkedIn, X, Instagram, site officiel), sujets de prédilection, et un angle d'épisode. JSON strict.`;
  return runWebSearchJSON<ProfileProposal>(SYSTEM, prompt, 5);
}

/** Applique une proposition (champs autorisés selon le kind) + réseaux en contacts. Renvoie ce qui a été écrit. */
export async function applyProfileProposal(
  sb: SB,
  cible: { id: string; kind: string; note: string | null },
  p: ProfileProposal
): Promise<string[]> {
  const patch: Record<string, unknown> = {};
  if (p.sujets?.length) patch.sujets = p.sujets.slice(0, 12);
  if (p.resume && !cible.note) patch.note = p.resume.slice(0, 2000);
  if (cible.kind === "personne") {
    if (p.role) patch.role = p.role;
    if (p.organisation) patch.organisation = p.organisation;
  } else {
    if (p.secteur) patch.secteur = p.secteur;
    if (p.pays) patch.pays = p.pays;
    if (p.raison_de_selection) patch.raison_de_selection = p.raison_de_selection;
  }
  const applied = Object.keys(patch);
  if (applied.length) await sb.from("cibles").update(patch).eq("id", cible.id);

  const reseaux = (p.reseaux ?? []).filter((r) => r?.url).slice(0, 6);
  if (reseaux.length) {
    await sb.from("contacts").insert(
      reseaux.map((r) => ({
        cible_id: cible.id,
        kind: "reseau",
        valeur: r.url,
        label: r.label ?? null,
        source: "Enrichissement",
        confiance: 3,
      }))
    );
    applied.push(`${reseaux.length} réseau(x)`);
  }
  return applied;
}
