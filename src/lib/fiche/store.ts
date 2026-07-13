// Accès aux fiches prépa STRUCTURÉES (tables 0034). Utilisé par les outils MCP
// (incrément II) et la génération (incrément III). Toujours via le client service
// role (contourne la RLS) : la génération et l'édition sont des opérations de
// l'équipe, pas d'un utilisateur authentifié côté navigateur.

import type { createServiceClient } from "../supabase/service";
import { FICHE_SECTIONS, FICHE_SECTION_IDS, sectionPosition } from "./sections";

type SB = ReturnType<typeof createServiceClient>;

export const FICHE_STATUTS = ["draft", "en_challenge", "finale", "verrouillee"] as const;
export type FicheStatut = (typeof FICHE_STATUTS)[number];

export interface FicheRow {
  id: string;
  cible_id: string | null;
  show_id: string | null;
  slug: string;
  invite_nom: string;
  date_enregistrement: string | null;
  statut: FicheStatut;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface FicheSectionRow {
  id: string;
  fiche_id: string;
  section_id: string;
  position: number;
  content: Record<string, unknown>;
  version: number;
  updated_at: string;
  updated_by: string | null;
}

/** Slug stable : prenom-nom sans accents ni ponctuation. */
export function slugify(nom: string): string {
  return String(nom ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "fiche";
}

/** Slug unique dans la table (suffixe -2, -3… si collision sur une autre fiche). */
async function uniqueSlug(sb: SB, base: string, exceptId?: string): Promise<string> {
  const { data } = await sb.from("fiches").select("id, slug").ilike("slug", `${base}%`);
  const taken = new Set(
    ((data ?? []) as { id: string; slug: string }[])
      .filter((r) => r.id !== exceptId)
      .map((r) => r.slug)
  );
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

/** Résout une fiche par id, slug, ou (dans un show) nom d'invité approché. */
export async function resolveFiche(sb: SB, ref: string, showId?: string | null): Promise<FicheRow | null> {
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  if (isId) {
    const { data } = await sb.from("fiches").select("*").eq("id", ref).maybeSingle();
    if (data) return data as FicheRow;
  }
  {
    const { data } = await sb.from("fiches").select("*").eq("slug", ref).maybeSingle();
    if (data) return data as FicheRow;
  }
  let q = sb.from("fiches").select("*").ilike("invite_nom", `%${ref}%`).limit(2);
  if (showId) q = q.eq("show_id", showId);
  const { data } = await q;
  const rows = (data ?? []) as FicheRow[];
  return rows.length === 1 ? rows[0] : null;
}

/** Crée la fiche (ou renvoie l'existante pour cette cible) et sème les 19 sections
 *  vides du catalogue. Idempotent : réappelée, elle complète les sections manquantes
 *  sans écraser le contenu existant. */
export async function ensureFiche(
  sb: SB,
  input: { show_id: string | null; cible_id?: string | null; invite_nom: string; date_enregistrement?: string | null }
): Promise<{ fiche: FicheRow; created: boolean }> {
  // Fiche existante pour cette cible (une fiche par cible/épisode).
  if (input.cible_id) {
    const { data } = await sb.from("fiches").select("*").eq("cible_id", input.cible_id).maybeSingle();
    if (data) {
      await seedSections(sb, (data as FicheRow).id);
      return { fiche: data as FicheRow, created: false };
    }
  }
  const base = slugify(input.invite_nom);
  const slug = await uniqueSlug(sb, base);
  const { data, error } = await sb
    .from("fiches")
    .insert({
      show_id: input.show_id,
      cible_id: input.cible_id ?? null,
      slug,
      invite_nom: input.invite_nom,
      date_enregistrement: input.date_enregistrement ?? null,
      statut: "draft",
      version: 1,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Création de la fiche impossible.");
  await seedSections(sb, (data as FicheRow).id);
  return { fiche: data as FicheRow, created: true };
}

/** Insère les sections du catalogue absentes de la fiche (contenu vide). */
export async function seedSections(sb: SB, ficheId: string): Promise<void> {
  const { data } = await sb.from("fiche_sections").select("section_id").eq("fiche_id", ficheId);
  const present = new Set(((data ?? []) as { section_id: string }[]).map((r) => r.section_id));
  const missing = FICHE_SECTIONS.filter((s) => !present.has(s.id));
  if (!missing.length) return;
  await sb.from("fiche_sections").insert(
    missing.map((s) => ({
      fiche_id: ficheId,
      section_id: s.id,
      position: sectionPosition(s.id),
      content: {},
      version: 1,
    }))
  );
}

/** Sections d'une fiche, ordonnées selon le catalogue. */
export async function ficheSections(sb: SB, ficheId: string): Promise<FicheSectionRow[]> {
  const { data } = await sb.from("fiche_sections").select("*").eq("fiche_id", ficheId).order("position");
  const rows = (data ?? []) as FicheSectionRow[];
  return rows.sort((a, b) => sectionPosition(a.section_id) - sectionPosition(b.section_id));
}

/** Écrit une section (remplacement complet du contenu) avec versioning :
 *  la version courante est archivée dans fiche_section_versions avant l'écrasement.
 *  Renvoie la nouvelle version, ou null si la section n'existe pas. */
export async function writeSection(
  sb: SB,
  ficheId: string,
  sectionId: string,
  content: Record<string, unknown>,
  author: string | null
): Promise<{ version: number } | null> {
  if (!FICHE_SECTION_IDS.includes(sectionId)) return null;
  const { data: cur } = await sb
    .from("fiche_sections")
    .select("id, content, version")
    .eq("fiche_id", ficheId)
    .eq("section_id", sectionId)
    .maybeSingle();
  if (!cur) {
    // Section jamais semée : la créer directement en version 1.
    await sb.from("fiche_sections").insert({
      fiche_id: ficheId,
      section_id: sectionId,
      position: sectionPosition(sectionId),
      content,
      version: 1,
      updated_by: author,
    });
    await bumpFiche(sb, ficheId);
    return { version: 1 };
  }
  const row = cur as { id: string; content: Record<string, unknown>; version: number };
  // Archive de l'état courant avant écrasement (rollback).
  await sb.from("fiche_section_versions").insert({
    fiche_id: ficheId,
    section_id: sectionId,
    version: row.version,
    content: row.content ?? {},
    author,
  });
  const next = row.version + 1;
  await sb
    .from("fiche_sections")
    .update({ content, version: next, updated_by: author, updated_at: new Date().toISOString() })
    .eq("id", row.id);
  await bumpFiche(sb, ficheId);
  return { version: next };
}

/** Incrémente la version et l'horodatage de la fiche parente (best-effort). */
async function bumpFiche(sb: SB, ficheId: string): Promise<void> {
  const { data } = await sb.from("fiches").select("version").eq("id", ficheId).maybeSingle();
  const v = ((data as { version?: number } | null)?.version ?? 1) + 1;
  await sb.from("fiches").update({ version: v, updated_at: new Date().toISOString() }).eq("id", ficheId);
}
