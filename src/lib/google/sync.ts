// Lot 8 — Orchestration de la synchro d'un show vers Google Contacts.
// Magellan = source de vérité. Crée/MAJ un contact Google par cible et par
// relais (appui est_relais), groupés « <Show> Pipeline » + un groupe par
// watchlist. Stocke resourceName/etag pour le lien stable (anti-doublon).

import { createServiceClient } from "../supabase/service";
import { googleAccessToken, ensureGroup, upsertPerson, hasGoogleSync, type PersonInput } from "./contacts";
import { isPlaceholder } from "../domain";

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
interface ContactRow { cible_id: string | null; appui_id: string | null; kind: string; valeur: string; verifie: boolean }
interface AppuiRow {
  id: string;
  nom: string;
  organisation: string | null;
  note: string | null;
  est_relais: boolean;
  google_resource_name: string | null;
  google_etag: string | null;
}

/** Exécute fn sur items avec une concurrence bornée (évite le timeout 60s). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
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
  restants: number;
  erreurs: string[];
  simulation?: boolean;
  a_creer?: number;
  a_maj?: number;
  exclus_placeholder?: number;
}

export async function syncShowContacts(
  sb: SB,
  show: { id: string; nom: string },
  limit = 150,
  dryRun = false,
  inclureNonVerifies = false
): Promise<SyncResult> {
  const empty = { cibles: 0, relais: 0, restants: 0, erreurs: [] as string[] };
  if (!hasGoogleSync()) {
    const len = (process.env.GOOGLE_SA_KEY ?? "").length;
    const email = process.env.GOOGLE_IMPERSONATE_EMAIL ? "présent" : "absent";
    return {
      ok: false,
      detail: `Synchro Google non configurée. GOOGLE_SA_KEY = ${len} caractères (attendu : plusieurs milliers) ; GOOGLE_IMPERSONATE_EMAIL = ${email}.`,
      ...empty,
    };
  }

  // Simulation : applique le même filtre qualité que le run réel et ventile
  // créations / mises à jour / exclusions, sans rien écrire dans Google. [C2]
  if (dryRun) {
    const { data: batch } = await sb
      .from("cibles")
      .select("id, nom, role, organisation, google_resource_name")
      .eq("show_id", show.id)
      .eq("archive", false)
      .order("google_resource_name", { nullsFirst: true })
      .limit(limit);
    const rows = (batch ?? []) as { nom: string; role: string | null; organisation: string | null; google_resource_name: string | null }[];
    let aCreer = 0, aMaj = 0, exclus = 0;
    for (const c of rows) {
      if (isPlaceholder(c.nom, c.role, c.organisation)) { exclus++; continue; }
      if (c.google_resource_name) aMaj++; else aCreer++;
    }
    const { count } = await sb
      .from("cibles").select("id", { count: "exact", head: true })
      .eq("show_id", show.id).eq("archive", false).is("google_resource_name", null);
    return {
      ok: true,
      detail: `[simulation] lot de ${rows.length} : ${aCreer} à créer, ${aMaj} à mettre à jour, ${exclus} exclu(s) (placeholder). ${count ?? 0} cible(s) jamais synchronisées au total. Aucune écriture.`,
      cibles: 0,
      relais: 0,
      restants: count ?? 0,
      erreurs: [],
      simulation: true,
      a_creer: aCreer,
      a_maj: aMaj,
      exclus_placeholder: exclus,
    };
  }

  try {
  const token = await googleAccessToken();
  if (!token) return { ok: false, detail: "Authentification Google échouée (clé de service / délégation).", ...empty };

  const groupCache = new Map<string, string>();
  const pipelineGroup = await ensureGroup(token, `${show.nom} Pipeline`, groupCache);

  // Mode incrémental : on traite un lot borné (`limit`), les NON synchronisées
  // d'abord (google_resource_name null), pour tenir dans les 60s de Vercel.
  // On relance jusqu'à `restants = 0`.
  const { count: nonSync } = await sb
    .from("cibles")
    .select("id", { count: "exact", head: true })
    .eq("show_id", show.id)
    .eq("archive", false)
    .is("google_resource_name", null);

  const { data: cibleData } = await sb
    .from("cibles")
    .select("id, nom, kind, role, organisation, raison_de_selection, google_resource_name, google_etag")
    .eq("show_id", show.id)
    .eq("archive", false)
    .order("google_resource_name", { nullsFirst: true })
    .limit(limit);
  const cibles = (cibleData ?? []) as CibleRow[];
  const cibleIds = cibles.map((c) => c.id);

  const { data: cibleContacts } = cibleIds.length
    ? await sb.from("contacts").select("cible_id, appui_id, kind, valeur, verifie").in("cible_id", cibleIds)
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

  // Pré-résolution des groupes watchlist (séquentiel, peu nombreux) pour ne pas
  // appeler Google dans la boucle parallèle.
  const allLabels = new Set<string>();
  wlByCible.forEach((arr) => arr.forEach((l) => allLabels.add(l)));
  for (const label of allLabels) await ensureGroup(token, label, groupCache);

  let exclusPlaceholder = 0;
  const cibleResults = await mapLimit(cibles, 8, async (c) => {
    // [C2] Gate qualité : ne pas polluer le carnet réel avec des noms factices.
    if (isPlaceholder(c.nom, c.role, c.organisation)) { exclusPlaceholder++; return false; }
    const own = ((cibleContacts ?? []) as ContactRow[])
      .filter((ct) => ct.cible_id === c.id)
      .filter((ct) => inclureNonVerifies || ct.verifie);
    const { phones, emails, urls } = splitContacts(own);
    const groups = [pipelineGroup, ...(wlByCible.get(c.id) ?? []).map((l) => groupCache.get(l) ?? null)].filter(Boolean) as string[];
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
      return true;
    }
    if (!r.ok) errors.push(`${c.nom}: ${r.detail}`);
    return false;
  });
  const cibleCount = cibleResults.filter(Boolean).length;

  // Relais (appuis est_relais) avec coordonnées.
  const { data: appuiData } = cibleIds.length
    ? await sb.from("appuis").select("id, nom, organisation, note, est_relais, google_resource_name, google_etag").in("cible_id", cibleIds).eq("est_relais", true)
    : { data: [] };
  const appuis = (appuiData ?? []) as AppuiRow[];
  const appuiIds = appuis.map((a) => a.id);
  const { data: appuiContacts } = appuiIds.length
    ? await sb.from("contacts").select("cible_id, appui_id, kind, valeur, verifie").in("appui_id", appuiIds)
    : { data: [] };
  const relaisGroup = await ensureGroup(token, `${show.nom} Relais`, groupCache);
  const verifiedAppuiContacts = ((appuiContacts ?? []) as ContactRow[]).filter((ct) => inclureNonVerifies || ct.verifie);
  const relaisAvecContacts = appuis.filter((a) => verifiedAppuiContacts.some((ct) => ct.appui_id === a.id));

  const relaisResults = await mapLimit(relaisAvecContacts, 8, async (a) => {
    const own = verifiedAppuiContacts.filter((ct) => ct.appui_id === a.id);
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
      return true;
    }
    if (!r.ok) errors.push(`${a.nom} (relais): ${r.detail}`);
    return false;
  });
  const relaisCount = relaisResults.filter(Boolean).length;

  const restants = Math.max(0, (nonSync ?? 0) - cibleCount);
  return {
    ok: errors.length === 0,
    detail:
      `Synchro Google : ${cibleCount} cible(s), ${relaisCount} relais.` +
      (exclusPlaceholder > 0 ? ` ${exclusPlaceholder} exclu(s) (placeholder).` : "") +
      (restants > 0 ? ` ${restants} restantes — relance pour continuer.` : " Terminé.") +
      (errors.length ? ` ${errors.length} erreur(s).` : ""),
    cibles: cibleCount,
    relais: relaisCount,
    restants,
    erreurs: errors.slice(0, 10),
    exclus_placeholder: exclusPlaceholder,
  };
  } catch (e) {
    return {
      ok: false,
      detail: `Erreur synchro Google : ${e instanceof Error ? e.message : String(e)}`,
      ...empty,
    };
  }
}
