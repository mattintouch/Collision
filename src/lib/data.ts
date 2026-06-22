// Couche d'accès aux données. Branche Supabase si configuré, sinon repli démo.

import { isSupabaseConfigured } from "./config";
import {
  demoAppuis,
  demoCibles,
  demoContacts,
  demoShows,
  demoSignals,
  demoStages,
  demoTouches,
} from "./demo";
import { createClient } from "./supabase/server";
import type {
  Appui,
  CibleEnrichie,
  Contact,
  Show,
  Signal,
  Stage,
  Touche,
} from "./types";

export const demoMode = !isSupabaseConfigured();

export async function getShows(): Promise<Show[]> {
  if (demoMode) return demoShows;
  const supabase = createClient();
  const { data } = await supabase.from("shows").select("*").order("nom");
  return data ?? [];
}

export async function getShow(slug: string): Promise<Show | null> {
  const shows = await getShows();
  return shows.find((s) => s.slug === slug) ?? null;
}

export async function getStages(showId: string): Promise<Stage[]> {
  if (demoMode) return demoStages[showId] ?? [];
  const supabase = createClient();
  const { data } = await supabase
    .from("stages")
    .select("*")
    .eq("show_id", showId)
    .order("position");
  return data ?? [];
}

export async function getCibles(showId: string): Promise<CibleEnrichie[]> {
  if (demoMode) return demoCibles.filter((c) => c.show_id === showId);
  const supabase = createClient();
  const { data } = await supabase
    .from("cibles_enrichies")
    .select("*")
    .eq("show_id", showId);
  return data ?? [];
}

export interface MyProfile {
  id: string;
  email: string;
  nom: string | null;
  type: "admin" | "interne" | "externe";
  default_show_slug: string | null;
}

/** Profil de l'utilisateur connecté (null en démo ou hors session). */
export async function getMyProfile(): Promise<MyProfile | null> {
  if (demoMode) return null;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, email, nom, type, default_show_slug")
    .eq("id", user.id)
    .maybeSingle();
  return (data as MyProfile) ?? null;
}

export async function getDefaultShowSlug(): Promise<string | null> {
  const profile = await getMyProfile();
  return profile?.default_show_slug ?? null;
}

export interface CibleDossier {
  cible: CibleEnrichie | null;
  appuis: Appui[];
  touches: Touche[];
  signals: Signal[];
  contacts: Contact[];
}

export async function getCibleDossier(id: string): Promise<CibleDossier> {
  if (demoMode) {
    return {
      cible: demoCibles.find((c) => c.id === id) ?? null,
      appuis: demoAppuis.filter((a) => a.cible_id === id),
      touches: demoTouches.filter((t) => t.cible_id === id),
      signals: demoSignals.filter((s) => s.cible_id === id),
      contacts: demoContacts.filter((c) => c.cible_id === id),
    };
  }
  const supabase = createClient();
  const [cible, appuis, touches, signals, contacts] = await Promise.all([
    supabase.from("cibles_enrichies").select("*").eq("id", id).single(),
    supabase.from("appuis").select("*").eq("cible_id", id),
    supabase.from("touches").select("*").eq("cible_id", id).order("date", { ascending: false }),
    supabase.from("signals").select("*").eq("cible_id", id).order("date", { ascending: false }),
    supabase.from("contacts").select("*").eq("cible_id", id).order("confiance", { ascending: false }),
  ]);
  return {
    cible: cible.data ?? null,
    appuis: appuis.data ?? [],
    touches: touches.data ?? [],
    signals: signals.data ?? [],
    contacts: contacts.data ?? [],
  };
}
