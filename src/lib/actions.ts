"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { demoMode } from "./data";

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const DEMO_BLOCK: ActionResult = {
  ok: false,
  error:
    "Mode démo : branchez Supabase (.env.local) pour enregistrer. Lecture seule pour l'instant.",
};

/** Créer une cible (personne ou entreprise) — §13.1. */
export async function createCible(input: {
  show_id: string;
  show_slug: string;
  kind: "personne" | "entreprise";
  nom: string;
  priorite?: string;
  voie?: string;
  sujets?: string[];
  canal_reel?: string | null;
  via_qui?: string | null;
  // personne
  role?: string | null;
  organisation?: string | null;
  archetype?: string | null;
  // entreprise
  secteur?: string | null;
  pays?: string | null;
  envergure?: string | null;
  raison_de_selection?: string | null;
  etat_recherche?: string | null;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  if (!input.nom?.trim()) return { ok: false, error: "Le nom est requis." };

  const supabase = createClient();

  // Étape initiale du show (position 1).
  const { data: firstStage } = await supabase
    .from("stages")
    .select("id")
    .eq("show_id", input.show_id)
    .order("position")
    .limit(1)
    .single();

  const { data, error } = await supabase
    .from("cibles")
    .insert({
      show_id: input.show_id,
      kind: input.kind,
      nom: input.nom.trim(),
      stage_id: firstStage?.id ?? null,
      priorite: input.priorite ?? "moyenne",
      voie: input.voie ?? "froid",
      sujets: input.sujets ?? [],
      canal_reel: input.canal_reel ?? null,
      via_qui: input.via_qui ?? null,
      role: input.kind === "personne" ? input.role ?? null : null,
      organisation: input.kind === "personne" ? input.organisation ?? null : null,
      archetype: input.kind === "personne" ? input.archetype ?? null : null,
      secteur: input.kind === "entreprise" ? input.secteur ?? null : null,
      pays: input.kind === "entreprise" ? input.pays ?? null : null,
      envergure: input.kind === "entreprise" ? input.envergure ?? null : null,
      raison_de_selection:
        input.kind === "entreprise" ? input.raison_de_selection ?? null : null,
      etat_recherche:
        input.kind === "entreprise" ? input.etat_recherche ?? null : null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true, id: data?.id };
}

/** Logger une touche — remet le compteur à zéro via trigger (§13.5). */
export async function logTouche(input: {
  cible_id: string;
  show_slug: string;
  canal?: string | null;
  contenu: string;
  source?: "saisie" | "capture";
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  if (!input.contenu?.trim())
    return { ok: false, error: "Le contenu de la touche est requis." };

  const supabase = createClient();
  const { error } = await supabase.from("touches").insert({
    cible_id: input.cible_id,
    canal: input.canal ?? null,
    contenu: input.contenu.trim(),
    source: input.source ?? "saisie",
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/cible/${input.cible_id}`);
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true };
}

/** Valider une cible : bascule en épisode en emmenant son contexte (§13.7). */
export async function validateCible(input: {
  cible_id: string;
  show_slug: string;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  const supabase = createClient();
  const { data, error } = await supabase.rpc("validate_cible", {
    target_cible: input.cible_id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/cible/${input.cible_id}`);
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true, id: data as string };
}

/** Mettre une cible sur une étape donnée. */
export async function moveCibleStage(input: {
  cible_id: string;
  stage_id: string;
  show_slug: string;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  const supabase = createClient();
  const { error } = await supabase
    .from("cibles")
    .update({ stage_id: input.stage_id })
    .eq("id", input.cible_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/cible/${input.cible_id}`);
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true };
}
