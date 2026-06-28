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
import { computeShowStats, type ShowStats } from "./stats";
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

export interface EpisodeRow {
  id: string;
  date_enregistrement: string | null;
  lieu: string | null;
  statut_prod: string;
  gcal_event_id: string | null;
  gcal_studio_event_id: string | null;
}

export interface EpisodeListItem {
  id: string;
  nom: string;
  role: string | null;
  organisation: string | null;
  secteur: string | null;
  pays: string | null;
  stage_key: string | null;
  stage_label: string | null;
  stage_position: number | null;
  date_enregistrement: string | null;
  lieu: string | null;
}

const PRODUCED_STAGES = ["programme", "enregistre", "publie", "produit"];

/** Cibles en phase de production (programmé/enregistré/publié) = les épisodes. */
export async function getEpisodesForShow(showId: string): Promise<EpisodeListItem[]> {
  if (demoMode) return [];
  const supabase = createClient();
  const { data: cibles } = await supabase
    .from("cibles_enrichies")
    .select("id, nom, role, organisation, secteur, pays, stage_key, stage_label, stage_position")
    .eq("show_id", showId)
    .in("stage_key", PRODUCED_STAGES);
  const rows = (cibles ?? []) as EpisodeListItem[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { data: eps } = await supabase
    .from("episodes")
    .select("cible_id, date_enregistrement, lieu, created_at")
    .in("cible_id", ids)
    .order("created_at", { ascending: false });
  const byCible = new Map<string, { date_enregistrement: string | null; lieu: string | null }>();
  for (const e of (eps ?? []) as { cible_id: string; date_enregistrement: string | null; lieu: string | null }[]) {
    if (!byCible.has(e.cible_id)) byCible.set(e.cible_id, { date_enregistrement: e.date_enregistrement, lieu: e.lieu });
  }
  return rows.map((r) => ({
    ...r,
    date_enregistrement: byCible.get(r.id)?.date_enregistrement ?? null,
    lieu: byCible.get(r.id)?.lieu ?? null,
  }));
}

/** Watchlists disponibles (vocabulaire de curation). */
export async function getWatchlists(): Promise<{ key: string; label: string }[]> {
  if (demoMode) return [];
  const supabase = createClient();
  const { data } = await supabase.from("watchlists").select("key, label").order("label");
  return (data as { key: string; label: string }[]) ?? [];
}

/** Épisode le plus récent rattaché à une cible (null si aucun / mode démo). */
export async function getEpisodeForCible(cibleId: string): Promise<EpisodeRow | null> {
  if (demoMode) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from("episodes")
    .select("id, date_enregistrement, lieu, statut_prod, gcal_event_id, gcal_studio_event_id")
    .eq("cible_id", cibleId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as EpisodeRow) ?? null;
}

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

export async function getShowStats(showId: string): Promise<ShowStats> {
  const stages = await getStages(showId);
  if (demoMode) {
    const rows = demoCibles
      .filter((c) => c.show_id === showId)
      .map((c) => ({ stage_key: c.stage_key, stage_position: c.stage_position, archive: c.archive }));
    return computeShowStats(stages, rows);
  }
  const supabase = createClient();
  const { data } = await supabase
    .from("cibles_enrichies")
    .select("stage_key, stage_position, archive")
    .eq("show_id", showId);
  return computeShowStats(stages, (data ?? []) as { stage_key: string | null; stage_position: number | null; archive: boolean }[]);
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

  // Rattache à chaque appui ses coordonnées propres (Lot 5).
  const appuiRows = (appuis.data ?? []) as Appui[];
  const appuiIds = appuiRows.map((a) => a.id);
  let appuiContacts: Contact[] = [];
  if (appuiIds.length) {
    const { data } = await supabase.from("contacts").select("*").in("appui_id", appuiIds);
    appuiContacts = (data as Contact[]) ?? [];
  }
  const appuisWithContacts = appuiRows.map((a) => ({
    ...a,
    contacts: appuiContacts.filter((c) => c.appui_id === a.id),
  }));

  return {
    cible: cible.data ?? null,
    appuis: appuisWithContacts,
    touches: touches.data ?? [],
    signals: signals.data ?? [],
    contacts: contacts.data ?? [],
  };
}
