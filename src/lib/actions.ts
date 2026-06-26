"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { demoMode, getCibleDossier, getShow, type CibleDossier } from "./data";
import { runVeille, type VeilleItem } from "./veille/engine";
import { enrichCible, type ContactSuggestion } from "./enrichment/engine";
import { fetchFolkGroups, fetchFolkPeople, hasFolkKey, type FolkGroup } from "./folk/client";
import { mapPerson, type MappedTarget } from "./folk/map";
import { folkLogTouche } from "./folk/write";
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEventTimes } from "./calendar";

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
  detail?: string;
  claudeUrl?: string;
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

  // Miroir Folk : on écrit la touche comme interaction (best effort).
  const { data: c } = await supabase.from("cibles").select("nom").eq("id", input.cible_id).maybeSingle();
  if (c?.nom) await folkLogTouche(c.nom, input.contenu.trim(), input.canal);

  revalidatePath(`/${input.show_slug}/cible/${input.cible_id}`);
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true };
}

const DEFAULT_LIEU = "Studio 71, 71 rue de Saussure, 75017 Paris";

/**
 * Valider une cible : bascule en épisode (§13.7), enregistre date/lieu/participants,
 * et crée l'invitation dans Google Calendar.
 */
/**
 * Construit un lien claude.ai pré-rempli avec le brief de prépa de l'invité
 * (le chat à plusieurs n'étant pas créable via API, on ouvre une nouvelle
 * conversation prête à partager).
 */
function buildClaudePrepUrl(d: CibleDossier, showSlug: string): string | undefined {
  const c = d.cible;
  if (!c) return undefined;
  const lines: string[] = [
    `Tu es mon copilote de prépa podcast. Aide-moi à préparer la fiche invité et l'angle d'enregistrement pour ${c.nom}.`,
  ];
  const ident = [c.role, c.organisation].filter(Boolean).join(", ");
  if (ident) lines.push(`Qui : ${ident}.`);
  lines.push(`Émission : ${showSlug.toUpperCase()}.`);
  if (c.sujets?.length) lines.push(`Sujets : ${c.sujets.join(", ")}.`);
  if (c.raison_de_selection) lines.push(`Raison de sélection : ${c.raison_de_selection}.`);
  if (d.appuis.length) lines.push(`Appuis : ${d.appuis.map((a) => a.nom).join(", ")}.`);
  const touches = d.touches.slice(0, 3).map((t) => (t.contenu ?? "").trim()).filter(Boolean);
  if (touches.length) lines.push(`Dernières touches :\n- ${touches.join("\n- ")}`);
  lines.push("Propose un angle d'épisode, 8-10 questions, et les points à creuser avant l'enregistrement.");
  return `https://claude.ai/new?q=${encodeURIComponent(lines.join("\n"))}`;
}

export async function validateCible(input: {
  cible_id: string;
  show_slug: string;
  cible_nom?: string;
  start_iso?: string; // date+heure d'enregistrement
  duree_min?: number;
  lieu?: string;
  attendees?: string[]; // emails à inviter
  send_invite?: boolean;
  summary?: string; // objet de l'invitation
  description?: string; // corps de l'invitation
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  const supabase = createClient();

  // Brief de prépa (lien Claude) construit avant la bascule, tant que la cible existe.
  let claudeUrl: string | undefined;
  try {
    claudeUrl = buildClaudePrepUrl(await getCibleDossier(input.cible_id), input.show_slug);
  } catch {
    // best effort : la validation n'échoue pas si le brief ne se construit pas
  }

  const { data: episodeId, error } = await supabase.rpc("validate_cible", {
    target_cible: input.cible_id,
  });
  if (error) return { ok: false, error: error.message };

  const lieu = input.lieu?.trim() || DEFAULT_LIEU;
  const attendees = (input.attendees ?? []).filter((e) => e.includes("@"));

  // Invitation Google Calendar + réservation studio (si une date est fournie).
  let detail = "Validé — épisode créé.";
  let gcalEventId: string | undefined;
  let gcalStudioEventId: string | undefined;
  if (input.start_iso) {
    const start = new Date(input.start_iso);
    const end = new Date(start.getTime() + (input.duree_min ?? 90) * 60000);
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.provider_token;

    // 1) L'enregistrement : invitation (objet + corps du gabarit) aux participants.
    const ev = await createCalendarEvent(token, {
      summary: input.summary?.trim() || `Enregistrement — ${input.cible_nom ?? "invité"}`,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      location: lieu,
      attendees,
      description: input.description?.trim() || `Enregistrement ${input.show_slug.toUpperCase()} avec ${input.cible_nom ?? ""}.`,
      sendInvites: input.send_invite,
    });
    gcalEventId = ev.eventId;

    // 2) La réservation Studio 71 : seulement si le lieu est bien le Studio 71
    //    (lieu modifié → pas de réservation). Bloc d'1h avant à 1h après.
    let studioNote = "";
    if (lieu === DEFAULT_LIEU) {
      const studio = await createCalendarEvent(token, {
        summary: `Studio 71 réservé — ${input.cible_nom ?? "invité"}`,
        startISO: new Date(start.getTime() - 60 * 60000).toISOString(),
        endISO: new Date(end.getTime() + 60 * 60000).toISOString(),
        location: lieu,
        attendees: [],
        description: `Réservation studio (installation/débrief) pour l'enregistrement ${input.show_slug.toUpperCase()} avec ${input.cible_nom ?? ""}.`,
        sendInvites: false,
      });
      gcalStudioEventId = studio.eventId;
      studioNote = studio.ok ? " Studio 71 réservé (-1h/+1h)." : ` Studio : ${studio.detail}`;
    } else {
      studioNote = " (lieu hors Studio 71 : pas de réservation studio).";
    }

    detail = ev.ok
      ? `Validé — épisode créé. ${ev.detail}${studioNote}`
      : `Validé — épisode créé. Calendrier : ${ev.detail}`;
  }

  // Détails sur l'épisode (dont les ids d'événements pour annuler/reporter).
  if (episodeId) {
    await supabase
      .from("episodes")
      .update({
        date_enregistrement: input.start_iso ?? null,
        lieu,
        attendees,
        statut_prod: input.start_iso ? "programme" : "a_programmer",
        gcal_event_id: gcalEventId ?? null,
        gcal_studio_event_id: gcalStudioEventId ?? null,
      })
      .eq("id", episodeId as string);
  }

  revalidatePath(`/${input.show_slug}/cible/${input.cible_id}`);
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true, id: episodeId as string, detail, claudeUrl };
}

/** Annule l'enregistrement : supprime les 2 événements Google et libère l'épisode. */
export async function cancelEpisodeRecording(input: {
  cible_id: string;
  show_slug: string;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  const supabase = createClient();
  const { data: ep } = await supabase
    .from("episodes")
    .select("id, gcal_event_id, gcal_studio_event_id")
    .eq("cible_id", input.cible_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ep) return { ok: false, error: "Aucun épisode à annuler." };

  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.provider_token;
  const notes: string[] = [];
  if (ep.gcal_event_id) {
    const r = await deleteCalendarEvent(token, ep.gcal_event_id, true);
    notes.push(r.ok ? "enregistrement supprimé" : r.detail);
  }
  if (ep.gcal_studio_event_id) {
    const r = await deleteCalendarEvent(token, ep.gcal_studio_event_id, false);
    notes.push(r.ok ? "studio libéré" : r.detail);
  }

  await supabase
    .from("episodes")
    .update({ statut_prod: "annule", date_enregistrement: null, gcal_event_id: null, gcal_studio_event_id: null })
    .eq("id", ep.id);

  revalidatePath(`/${input.show_slug}/cible/${input.cible_id}`);
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true, detail: `Enregistrement annulé. ${notes.join(", ")}`.trim() };
}

/** Reporte l'enregistrement : déplace les 2 événements (-1h/+1h pour le studio). */
export async function rescheduleEpisode(input: {
  cible_id: string;
  show_slug: string;
  start_iso: string;
  duree_min?: number;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  const supabase = createClient();
  const { data: ep } = await supabase
    .from("episodes")
    .select("id, gcal_event_id, gcal_studio_event_id")
    .eq("cible_id", input.cible_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ep) return { ok: false, error: "Aucun épisode à reporter." };

  const start = new Date(input.start_iso);
  const end = new Date(start.getTime() + (input.duree_min ?? 90) * 60000);
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.provider_token;
  const notes: string[] = [];
  if (ep.gcal_event_id) {
    const r = await updateCalendarEventTimes(token, ep.gcal_event_id, start.toISOString(), end.toISOString(), true);
    notes.push(r.ok ? "enregistrement déplacé" : r.detail);
  }
  if (ep.gcal_studio_event_id) {
    const r = await updateCalendarEventTimes(
      token,
      ep.gcal_studio_event_id,
      new Date(start.getTime() - 60 * 60000).toISOString(),
      new Date(end.getTime() + 60 * 60000).toISOString(),
      false
    );
    notes.push(r.ok ? "studio déplacé" : r.detail);
  }
  if (!ep.gcal_event_id && !ep.gcal_studio_event_id) {
    notes.push("aucun événement à déplacer (revalide la fiche pour en créer)");
  }

  await supabase
    .from("episodes")
    .update({ date_enregistrement: start.toISOString(), statut_prod: "programme" })
    .eq("id", ep.id);

  revalidatePath(`/${input.show_slug}/cible/${input.cible_id}`);
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true, detail: `Reprogrammé. ${notes.join(", ")}`.trim() };
}

/** Archive (ou désarchive) plusieurs cibles d'un coup. Non destructif. */
export async function bulkSetArchive(input: {
  ids: string[];
  archive: boolean;
  show_slug: string;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  if (input.ids.length === 0) return { ok: false, error: "Aucune fiche sélectionnée." };
  const supabase = createClient();
  const { error } = await supabase.from("cibles").update({ archive: input.archive }).in("id", input.ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true, detail: `${input.ids.length} fiche(s) ${input.archive ? "archivée(s)" : "désarchivée(s)"}.` };
}

/** Supprime définitivement plusieurs cibles (et leur dossier en cascade). */
export async function bulkDeleteCibles(input: {
  ids: string[];
  show_slug: string;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  if (input.ids.length === 0) return { ok: false, error: "Aucune fiche sélectionnée." };
  const supabase = createClient();
  const { error } = await supabase.from("cibles").delete().in("id", input.ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true, detail: `${input.ids.length} fiche(s) supprimée(s).` };
}

/** Ajoute une watchlist (par clé) à plusieurs cibles. Idempotent. */
export async function bulkAddWatchlist(input: {
  ids: string[];
  watchlist_key: string;
  show_slug: string;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  if (input.ids.length === 0) return { ok: false, error: "Aucune fiche sélectionnée." };
  const supabase = createClient();
  const { data: w } = await supabase.from("watchlists").select("id").eq("key", input.watchlist_key).maybeSingle();
  if (!w) return { ok: false, error: `Watchlist inconnue : ${input.watchlist_key}` };
  const rows = input.ids.map((cible_id) => ({ cible_id, watchlist_id: (w as { id: string }).id }));
  const { error } = await supabase
    .from("cible_watchlists")
    .upsert(rows, { onConflict: "cible_id,watchlist_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true, detail: `${input.ids.length} fiche(s) taguées « ${input.watchlist_key} ».` };
}

function slugifyTag(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Crée un tag (watchlist) s'il n'existe pas, puis l'applique aux fiches sélectionnées. */
export async function bulkCreateAndTagWatchlist(input: {
  ids: string[];
  label: string;
  show_slug: string;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  if (input.ids.length === 0) return { ok: false, error: "Aucune fiche sélectionnée." };
  const label = input.label.trim();
  const key = slugifyTag(label);
  if (!key) return { ok: false, error: "Nom de tag invalide." };
  const supabase = createClient();
  let { data: w } = await supabase.from("watchlists").select("id").eq("key", key).maybeSingle();
  if (!w) {
    const ins = await supabase.from("watchlists").insert({ key, label, color: "#FFD200" }).select("id").single();
    if (ins.error) return { ok: false, error: ins.error.message };
    w = ins.data;
  }
  const rows = input.ids.map((cible_id) => ({ cible_id, watchlist_id: (w as { id: string }).id }));
  const { error } = await supabase
    .from("cible_watchlists")
    .upsert(rows, { onConflict: "cible_id,watchlist_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true, detail: `${input.ids.length} fiche(s) taguées « ${label} ».` };
}

/** Ordre des colonnes d'archétype du board (par show). */
export async function setArchetypeOrder(input: {
  show_slug: string;
  order: string[];
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  const supabase = createClient();
  const { error } = await supabase
    .from("shows")
    .update({ archetype_order: input.order })
    .eq("slug", input.show_slug);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true };
}

/** Lancer la veille sur un show (§5). Persiste les signaux trouvés. */
export async function runVeilleAction(input: {
  show_slug: string;
}): Promise<{ ok: boolean; demo: boolean; items: VeilleItem[]; error?: string }> {
  const show = await getShow(input.show_slug);
  if (!show) return { ok: false, demo: false, items: [], error: "Show introuvable" };

  const { items, demo } = await runVeille(show.id);

  // En mode réel, on matérialise les signaux (alimente la résurgence).
  if (!demo && items.length > 0) {
    const supabase = createClient();
    const rows = items.map((it) => ({
      cible_id: it.cible_id,
      type: it.type,
      date: it.date ?? new Date().toISOString(),
      source: it.source,
      pertinence: it.pertinence,
      resume: it.resume ? `${it.titre} — ${it.resume}` : it.titre,
    }));
    const { error } = await supabase.from("signals").insert(rows);
    if (error) return { ok: false, demo, items, error: error.message };
    revalidatePath(`/${input.show_slug}/board`);
    revalidatePath(`/${input.show_slug}/dispo`);
  }

  return { ok: true, demo, items };
}

/** Enrichir les contacts d'une cible (§ joindre les cibles difficiles). */
export async function enrichCibleAction(input: {
  cible_id: string;
  show_slug: string;
}): Promise<{
  ok: boolean;
  demo: boolean;
  contacts: ContactSuggestion[];
  error?: string;
}> {
  const { cible } = await getCibleDossier(input.cible_id);
  if (!cible)
    return { ok: false, demo: false, contacts: [], error: "Cible introuvable" };

  const { contacts, demo } = await enrichCible(cible);

  if (!demo && contacts.length > 0) {
    const supabase = createClient();
    const rows = contacts.map((c) => ({
      cible_id: input.cible_id,
      kind: c.kind,
      valeur: c.valeur,
      label: c.label,
      source: c.source,
      confiance: c.confiance,
    }));
    const { error } = await supabase.from("contacts").insert(rows);
    if (error) return { ok: false, demo, contacts, error: error.message };
    revalidatePath(`/${input.show_slug}/cible/${input.cible_id}`);
  }

  return { ok: true, demo, contacts };
}

/** Supprimer un contact. */
export async function deleteContact(input: {
  contact_id: string;
  cible_id: string;
  show_slug: string;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  const supabase = createClient();
  const { error } = await supabase
    .from("contacts")
    .delete()
    .eq("id", input.contact_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/cible/${input.cible_id}`);
  return { ok: true };
}

/** Lister les groupes Folk (pour choisir quoi importer). */
export async function folkListGroups(): Promise<{
  ok: boolean;
  groups: FolkGroup[];
  error?: string;
}> {
  if (!hasFolkKey())
    return { ok: false, groups: [], error: "Clé Folk absente : ajoute FOLK_API_KEY (Vercel) puis redéploie." };
  try {
    return { ok: true, groups: await fetchFolkGroups() };
  } catch (e) {
    return { ok: false, groups: [], error: e instanceof Error ? e.message : "Erreur Folk" };
  }
}

export interface FolkImportPreviewRow {
  nom: string;
  role: string | null;
  organisation: string | null;
  nb_contacts: number;
}

export interface FolkImportResult {
  ok: boolean;
  error?: string;
  dry_run: boolean;
  total: number;
  created: number;
  skipped: number;
  linked: number;
  preview: FolkImportPreviewRow[];
}

/**
 * Importe les personnes d'un groupe Folk dans un show (cibles + contacts).
 * dry_run=true : aperçu sans rien écrire. Conforme §14.2 (pipe invité).
 */
export async function folkImport(input: {
  show_slug: string;
  group_id: string;
  dry_run: boolean;
}): Promise<FolkImportResult> {
  const empty = { total: 0, created: 0, skipped: 0, linked: 0, preview: [] as FolkImportPreviewRow[] };
  if (!hasFolkKey())
    return { ok: false, dry_run: input.dry_run, ...empty, error: "Clé Folk absente (FOLK_API_KEY)." };

  const show = await getShow(input.show_slug);
  if (!show) return { ok: false, dry_run: input.dry_run, ...empty, error: "Show introuvable" };

  let mapped: MappedTarget[];
  try {
    const people = await fetchFolkPeople(input.group_id);
    mapped = people.map((p) => mapPerson(p, show.type_pipe));
  } catch (e) {
    return { ok: false, dry_run: input.dry_run, ...empty, error: e instanceof Error ? e.message : "Erreur Folk" };
  }

  const preview: FolkImportPreviewRow[] = mapped.slice(0, 50).map((m) => ({
    nom: m.nom,
    role: m.role,
    organisation: m.organisation,
    nb_contacts: m.contacts.length,
  }));

  if (input.dry_run) {
    return { ok: true, dry_run: true, total: mapped.length, created: 0, skipped: 0, linked: 0, preview };
  }

  // Écriture : nécessite Supabase branché.
  if (demoMode)
    return { ok: false, dry_run: false, total: mapped.length, created: 0, skipped: 0, linked: 0, preview, error: DEMO_BLOCK.error };

  const supabase = createClient();

  // Étape initiale du show + index des cibles existantes (nom -> {id, folk_id}).
  const [{ data: firstStage }, { data: existing }] = await Promise.all([
    supabase.from("stages").select("id").eq("show_id", show.id).order("position").limit(1).maybeSingle(),
    supabase.from("cibles").select("id, nom, folk_id").eq("show_id", show.id),
  ]);
  const byName = new Map(
    (existing ?? []).map((c) => [c.nom.trim().toLowerCase(), c as { id: string; nom: string; folk_id: string | null }])
  );

  let created = 0;
  let skipped = 0;
  let linked = 0;
  for (const m of mapped) {
    const key = m.nom.trim().toLowerCase();
    const found = byName.get(key);
    if (found) {
      // Cible déjà là : on relie à Folk si le lien manque (backfill), sinon on saute.
      if (!found.folk_id) {
        await supabase.from("cibles").update({ folk_id: m.folk_id }).eq("id", found.id);
        found.folk_id = m.folk_id;
        linked++;
      } else {
        skipped++;
      }
      continue;
    }
    byName.set(key, { id: "", nom: m.nom, folk_id: m.folk_id });

    const isPers = m.kind === "personne";
    const { data: cible, error } = await supabase
      .from("cibles")
      .insert({
        show_id: show.id,
        kind: m.kind,
        nom: m.nom,
        stage_id: firstStage?.id ?? null,
        priorite: "moyenne",
        voie: "froid",
        role: isPers ? m.role : null,
        organisation: isPers ? m.organisation : null,
        folk_id: m.folk_id,
      })
      .select("id")
      .single();
    if (error || !cible) {
      skipped++;
      continue;
    }
    created++;

    if (m.contacts.length > 0) {
      await supabase.from("contacts").insert(
        m.contacts.map((c) => ({
          cible_id: cible.id,
          kind: c.kind,
          valeur: c.valeur,
          label: c.label,
          source: c.source,
          confiance: c.confiance,
        }))
      );
    }
    if (m.note) {
      await supabase.from("touches").insert({
        cible_id: cible.id,
        canal: "Import Folk",
        contenu: m.note,
        source: "saisie",
      });
    }
  }

  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true, dry_run: false, total: mapped.length, created, skipped, linked, preview };
}

/** Définir le show affiché par défaut à la connexion (préférence perso). */
export async function setDefaultShow(input: {
  show_slug: string;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non connecté." };
  const { error } = await supabase
    .from("profiles")
    .update({ default_show_slug: input.show_slug })
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/");
  return { ok: true };
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

/** Changer l'archétype d'une cible (colonnes du board invités). */
export async function setCibleArchetype(input: {
  cible_id: string;
  archetype: string | null;
  show_slug: string;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  const supabase = createClient();
  const { error } = await supabase
    .from("cibles")
    .update({ archetype: input.archetype })
    .eq("id", input.cible_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true };
}

/** Supprimer une cible (et ses données liées en cascade). */
export async function deleteCible(input: {
  cible_id: string;
  show_slug: string;
}): Promise<ActionResult> {
  if (demoMode) return DEMO_BLOCK;
  const supabase = createClient();
  const { error } = await supabase
    .from("cibles")
    .delete()
    .eq("id", input.cible_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.show_slug}/board`);
  return { ok: true };
}
