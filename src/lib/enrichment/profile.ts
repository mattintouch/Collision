// Enrichissement de FICHE (profil) par recherche web sourcée : rôle,
// organisation, secteur, pays, ville, photo, réseaux sociaux, sujets, angle.
// Sources publiques, jamais d'invention. Propose, puis écrit sur validation.
//
// Écriture NON DESTRUCTIVE : on ne remplace jamais un champ déjà rempli à la
// main, et on FUSIONNE les sujets/tags existants (on n'en ajoute que de
// nouveaux). Indispensable pour industrialiser sans perdre la saisie manuelle.

import { runWebSearchJSON } from "../ai/websearch";
import { ENRICH_MODEL, hasAnthropicKey } from "../copilot/config";
import { createServiceClient } from "../supabase/service";
import type { CibleEnrichie } from "../types";

type SB = ReturnType<typeof createServiceClient>;

export interface ProfileProposal {
  role?: string | null;
  organisation?: string | null;
  secteur?: string | null;
  pays?: string | null;
  ville?: string | null;
  photo_url?: string | null;
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
  "Réponds UNIQUEMENT en JSON : { role, organisation, secteur, pays, ville, photo_url, sujets:[...], reseaux:[{label,url}], resume, raison_de_selection, sources:[url] }.",
  "ville = ville principale / base de la personne (pour planifier un tournage), distincte du pays.",
  "photo_url = URL directe d'une photo publique récente (site officiel, page presse, LinkedIn, Wikipedia) ; null si rien de fiable.",
  "resume = 2-3 phrases de fond. raison_de_selection = pourquoi cette personne ferait un bon épisode. sujets = mots-clés.",
].join("\n");

/** Champs de la cible utilisés pour la fusion non destructive. */
type CibleForApply = Pick<
  CibleEnrichie,
  "id" | "kind" | "note" | "role" | "organisation" | "secteur" | "pays" | "ville" | "photo_url" | "raison_de_selection" | "sujets"
>;

export async function enrichCibleProfile(c: CibleEnrichie): Promise<ProfileProposal | null> {
  if (!hasAnthropicKey()) return null;
  const qui =
    c.kind === "entreprise"
      ? `l'entreprise/marque « ${c.nom} »${c.secteur ? ` (${c.secteur})` : ""}`
      : `« ${c.nom} »${c.role ? ` (${c.role}${c.organisation ? `, ${c.organisation}` : ""})` : ""}`;
  const prompt = `Enrichis la fiche de ${qui}. Parcours et rôle actuel, organisation, secteur, pays, ville (base), photo publique, réseaux sociaux (LinkedIn, X, Instagram, site officiel), sujets de prédilection, et un angle d'épisode. JSON strict.`;
  // 2 recherches + modèle rapide (ENRICH_MODEL) : un appel d'outil MCP est coupé
  // par le client à ~60 s, donc l'enrichissement doit tenir end-to-end sous 60 s
  // (le budget serveur n'y change rien). Opus + 5 recherches → « indisponible ».
  return runWebSearchJSON<ProfileProposal>(SYSTEM, prompt, 2, ENRICH_MODEL);
}

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/**
 * Applique une proposition de façon NON DESTRUCTIVE (champs autorisés selon le
 * kind) : ne remplit que ce qui est vide, fusionne les sujets, dédoublonne les
 * réseaux contre les contacts existants. Renvoie ce qui a été réellement écrit.
 */
export async function applyProfileProposal(
  sb: SB,
  cible: CibleForApply,
  p: ProfileProposal
): Promise<string[]> {
  const patch: Record<string, unknown> = {};
  const skipped: string[] = [];

  // N'écrit un scalaire que si la valeur actuelle est vide (préserve la saisie manuelle).
  const fillIfEmpty = (field: keyof CibleForApply, value: string | null | undefined) => {
    if (isEmpty(value)) return;
    if (!isEmpty(cible[field])) {
      skipped.push(field as string);
      return;
    }
    patch[field] = value;
  };

  // Champs descriptifs partagés (autorisés sur les deux kinds, cf. migrations 0020/0021).
  fillIfEmpty("photo_url", p.photo_url);
  fillIfEmpty("ville", p.ville);
  fillIfEmpty("secteur", p.secteur);
  fillIfEmpty("pays", p.pays);
  fillIfEmpty("raison_de_selection", p.raison_de_selection); // angle de closing — utile aussi pour une personne
  if (!isEmpty(p.resume) && isEmpty(cible.note)) patch.note = (p.resume as string).slice(0, 2000);
  else if (!isEmpty(p.resume)) skipped.push("note");

  // Champs réservés aux personnes
  if (cible.kind === "personne") {
    fillIfEmpty("role", p.role);
    fillIfEmpty("organisation", p.organisation);
  }

  // Sujets : FUSION (union) — on n'écrase jamais les tags/sujets manuels.
  if (p.sujets?.length) {
    const existing = cible.sujets ?? [];
    const seen = new Set(existing.map((s) => s.toLowerCase()));
    const merged = [...existing];
    for (const s of p.sujets) {
      const k = s.trim().toLowerCase();
      if (k && !seen.has(k)) {
        seen.add(k);
        merged.push(s.trim());
      }
    }
    if (merged.length !== existing.length) patch.sujets = merged.slice(0, 12);
  }

  const applied = Object.keys(patch);
  if (applied.length) {
    const { error } = await sb.from("cibles").update(patch).eq("id", cible.id);
    if (error) throw new Error(`MAJ cible (${applied.join(", ")}) : ${error.message}`);
  }

  // Réseaux → contacts, dédoublonnés contre les coordonnées déjà présentes.
  const reseaux = (p.reseaux ?? []).filter((r) => r?.url).slice(0, 6);
  if (reseaux.length) {
    const { data: existingContacts } = await sb.from("contacts").select("valeur").eq("cible_id", cible.id);
    const known = new Set(((existingContacts ?? []) as { valeur: string }[]).map((c) => c.valeur.trim().toLowerCase()));
    const fresh = reseaux.filter((r) => !known.has(r.url.trim().toLowerCase()));
    if (fresh.length) {
      const { error } = await sb.from("contacts").insert(
        fresh.map((r) => ({
          cible_id: cible.id,
          kind: "reseau",
          valeur: r.url,
          label: r.label ?? null,
          source: "Enrichissement",
          confiance: 3,
        }))
      );
      if (error) throw new Error(`Ajout réseaux : ${error.message}`);
      applied.push(`${fresh.length} réseau(x)`);
    }
  }
  return applied.length ? applied : (skipped.length ? [`rien de neuf (préservé : ${skipped.join(", ")})`] : []);
}
