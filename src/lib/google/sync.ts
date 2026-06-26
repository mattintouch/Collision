// Lot 8 — Orchestration de la synchro d'un show vers Google Contacts.
// Magellan = source de vérité. Crée/MAJ un contact Google par cible et par
// relais (appui est_relais), groupés « <Show> Pipeline » + un groupe par
// watchlist. Stocke resourceName/etag pour le lien stable (anti-doublon).

import { createServiceClient } from "../supabase/service";
import { googleAccessToken, ensureGroup, upsertPerson, hasGoogleSync, type PersonInput } from "./contacts";

type SB = ReturnType<typeof createServiceClient>;

interface CibleRow {
  id: string;
  nom: string;
  kind: string;
  role: string | null;
  organisation: string | null;
  raison_de_selection: string | null;
  google_resource_name: string | null;
  google_etag: string | null;
}
interface ContactRow { cible_id: string | null; appui_id: string | null; kind: string; valeur: string }
interface AppuiRow {
  id: string;
  nom: string;
  organisation: string | null;
  note: string | null;
  est_relais: boolean;
  google_resource_name: string | null;
  google_etag: string | null;
}

function splitContacts(rows: ContactRow[]) {
  const phones: string[] = [], emails: string[] = [], urls: string[] = [];
  for (const c of rows) {
    if (c.kind === "telephone") phones.push(c.valeur);
    else if (c.kind === "email") emails.push(c.valeur);
    else if (c.kind === "reseau" || c.kind === "site") urls.push(c.valeur);
  }
  return { phones, emails, urls };
}

export interface SyncResult {
  ok: boolean;
  detail: string;
  cibles: number;
  relais: number;
  erreurs: string[];
}

export async function syncShowContacts(sb: SB, show: { id: string; nom: string }): Promise<SyncResult> {
  const empty = { cibles: 0, relais: 0, erreurs: [] as string[] };
  if (!hasGoogleSync()) {
    const len = (process.env.GOOGLE_SA_KEY ?? "").length;
    const email = process.env.GOOGLE_IMPERSONATE_EMAIL ? "présent" : "absent";
    return {
      ok: false,
      detail: `Synchro Google non configurée. GOOGLE_SA_KEY = ${len} caractères (attendu : plusieurs milliers) ; GOOGLE_IMPERSONATE_EMAIL = ${email}.`,
      ...empty,
    };
  }
  const token = await googleAccessToken();
  if (!token) return { ok: false, detail: "Authentification Google échouée (clé de service / délégation).", ...empty };

  const groupCache = new Map<string, string>();
  const pipelineGroup = await ensureGroup(token, `${show.nom} Pipeline`, groupCache);

  // Cibles non archivées du show + leurs contacts + watchlists.
  const { data: cibleData } = await sb
    .from("cibles")
    .select("id, nom, kind, role, organisation, raison_de_selection, google_resource_name, google_etag")
    .eq("show_id", show.id)
    .eq("archive", false);
  const cibles = (cibleData ?? []) as CibleRow[];
  const cibleIds = cibles.map((c) => c.id);

  const { data: cibleContacts } = cibleIds.length
    ? await sb.from("contacts").select("cible_id, appui_id, kind, valeur").in("cible_id", cibleIds)
    : { data: [] };
  const { data: wlLinks } = cibleIds.length
    ? await sb.from("cible_watchlists").select("cible_id, watchlists(key, label)").in("cible_id", cibleIds)
    : { data: [] };
  const wlByCible = new Map<string, string[]>();
  const wlRows = (wlLinks ?? []) as unknown as { cible_id: string; watchlists: { label: string }[] | { label: string } | null }[];
  for (const l of wlRows) {
    const w = Array.isArray(l.watchlists) ? l.watchlists[0] : l.watchlists;
    if (!w) continue;
    const arr = wlByCible.get(l.cible_id) ?? [];
    arr.push(w.label);
    wlByCible.set(l.cible_id, arr);
  }

  const errors: string[] = [];
  let cibleCount = 0;

  for (const c of cibles) {
    const own = ((cibleContacts ?? []) as ContactRow[]).filter((ct) => ct.cible_id === c.id);
    const { phones, emails, urls } = splitContacts(own);
    const groups = [pipelineGroup].filter(Boolean) as string[];
    for (const label of wlByCible.get(c.id) ?? []) {
      const g = await ensureGroup(token, label, groupCache);
      if (g) groups.push(g);
    }
    const input: PersonInput = {
      fullName: c.nom,
      organisation: c.organisation,
      role: c.role,
      phones, emails, urls,
      bio: c.raison_de_selection,
      groupResourceNames: groups,
    };
    const r = await upsertPerson(token, { resourceName: c.google_resource_name, etag: c.google_etag }, input);
    if (r.ok && r.resourceName) {
      await sb.from("cibles").update({ google_resource_name: r.resourceName, google_etag: r.etag }).eq("id", c.id);
      cibleCount++;
    } else if (!r.ok) {
      errors.push(`${c.nom}: ${r.detail}`);
    }
  }

  // Relais (appuis est_relais) avec coordonnées.
  const { data: appuiData } = cibleIds.length
    ? await sb.from("appuis").select("id, nom, organisation, note, est_relais, google_resource_name, google_etag").in("cible_id", cibleIds).eq("est_relais", true)
    : { data: [] };
  const appuis = (appuiData ?? []) as AppuiRow[];
  const appuiIds = appuis.map((a) => a.id);
  const { data: appuiContacts } = appuiIds.length
    ? await sb.from("contacts").select("cible_id, appui_id, kind, valeur").in("appui_id", appuiIds)
    : { data: [] };
  const relaisGroup = await ensureGroup(token, `${show.nom} Relais`, groupCache);
  let relaisCount = 0;

  for (const a of appuis) {
    const own = ((appuiContacts ?? []) as ContactRow[]).filter((ct) => ct.appui_id === a.id);
    if (own.length === 0) continue; // pas de coordonnées → rien à synchroniser
    const { phones, emails, urls } = splitContacts(own);
    const input: PersonInput = {
      fullName: a.nom,
      organisation: a.organisation,
      phones, emails, urls,
      bio: a.note ? `Relais — ${a.note}` : "Relais",
      groupResourceNames: [relaisGroup].filter(Boolean) as string[],
    };
    const r = await upsertPerson(token, { resourceName: a.google_resource_name, etag: a.google_etag }, input);
    if (r.ok && r.resourceName) {
      await sb.from("appuis").update({ google_resource_name: r.resourceName, google_etag: r.etag }).eq("id", a.id);
      relaisCount++;
    } else if (!r.ok) {
      errors.push(`${a.nom} (relais): ${r.detail}`);
    }
  }

  return {
    ok: errors.length === 0,
    detail: `Synchro Google : ${cibleCount} cible(s), ${relaisCount} relais.${errors.length ? ` ${errors.length} erreur(s).` : ""}`,
    cibles: cibleCount,
    relais: relaisCount,
    erreurs: errors.slice(0, 10),
  };
}
