// Écriture Folk : mettre à jour une fiche (description / alliés, téléphone).
// Best effort : Folk reste la source historique, Magellan pilote.
// On écrit dans des champs sûrs et documentés du modèle Person (description, phones).

import { hasFolkKey, type FolkPerson } from "./client";

const FOLK_BASE = "https://api.folk.app/v1";

function folkKey(): string {
  return process.env.FOLK_API_KEY ?? "";
}

async function folk(
  method: "GET" | "POST" | "PATCH" | "PUT",
  path: string,
  body?: unknown
): Promise<Response> {
  return fetch(`${FOLK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${folkKey()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
}

/** Cherche une personne Folk par nom (sur les premières pages). */
async function findPersonByName(name: string): Promise<FolkPerson | null> {
  const needle = name.trim().toLowerCase();
  let url: string | null = `${FOLK_BASE}/people?limit=100`;
  let guard = 0;
  while (url && guard++ < 10) {
    const res = await folk("GET", url.replace(FOLK_BASE, ""));
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { items?: FolkPerson[]; pagination?: { nextLink?: string } };
    };
    const items = json.data?.items ?? [];
    const hit = items.find(
      (p) => (p.fullName ?? "").trim().toLowerCase() === needle
    );
    if (hit) return hit;
    // match partiel en secours
    const partial = items.find((p) =>
      (p.fullName ?? "").trim().toLowerCase().includes(needle)
    );
    if (partial) return partial;
    url = json.data?.pagination?.nextLink ?? null;
  }
  return null;
}

/** Crée une fiche Folk minimale (fullName). */
async function createPerson(name: string): Promise<FolkPerson | null> {
  const res = await folk("POST", "/people", { fullName: name });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: FolkPerson };
  return json.data ?? null;
}

/** Trouve la fiche Folk par nom, sinon la crée (pont idempotent — ne plus échouer
 *  sur « fiche introuvable »). */
async function findOrCreatePerson(name: string): Promise<FolkPerson | null> {
  return (await findPersonByName(name)) ?? (await createPerson(name));
}

/** PATCH puis PUT en secours (le verbe d'update varie selon les API). */
async function updatePerson(id: string, patch: Record<string, unknown>): Promise<boolean> {
  let res = await folk("PATCH", `/people/${id}`, patch);
  if (res.status === 404 || res.status === 405) {
    res = await folk("PUT", `/people/${id}`, patch);
  }
  return res.ok;
}

export interface FolkSyncResult {
  ok: boolean;
  matched: boolean;
  detail: string;
}

/** Ajoute une ligne « Allié : … » à la description de la fiche Folk. */
export async function folkAddAlly(
  cibleNom: string,
  allyNom: string,
  context?: string
): Promise<FolkSyncResult> {
  if (!hasFolkKey()) return { ok: false, matched: false, detail: "Pas de clé Folk." };
  try {
    const person = await findOrCreatePerson(cibleNom);
    if (!person) return { ok: false, matched: false, detail: `Fiche Folk « ${cibleNom} » : création/recherche impossible.` };
    const line = `Allié : ${allyNom}${context ? ` — ${context}` : ""}`;
    const description = [person.description?.trim(), line].filter(Boolean).join("\n");
    const ok = await updatePerson(person.id, { description });
    return { ok, matched: true, detail: ok ? `Fiche Folk de ${cibleNom} mise à jour.` : "Échec de mise à jour Folk." };
  } catch (e) {
    return { ok: false, matched: false, detail: e instanceof Error ? e.message : "Erreur Folk" };
  }
}

/** Mappe un canal Magellan vers un type d'interaction Folk (défaut : message). */
function folkInteractionType(canal?: string | null): string {
  const c = (canal ?? "").toLowerCase();
  const apps = ["whatsapp", "twitter", "linkedin", "skype", "slack", "signal", "discord", "wechat", "telegram", "viber"];
  for (const a of apps) if (c.includes(a)) return a;
  if (c.includes("imessage")) return "iMessage";
  if (c.includes("call") || c.includes("appel") || c.includes("téléphone") || c.includes("phone")) return "call";
  if (c.includes("rdv") || c.includes("réunion") || c.includes("rendez") || c.includes("meeting")) return "meeting";
  if (c.includes("café") || c.includes("coffee")) return "coffee";
  if (c.includes("event") || c.includes("événement") || c.includes("evenement")) return "event";
  return "message";
}

/**
 * Écrit une touche Magellan comme interaction dans Folk (POST /v1/interactions).
 * L'API Folk ne permet que d'écrire les interactions : c'est le seul moyen de
 * garder Folk à jour. Best effort — n'interrompt jamais la touche Magellan.
 */
export async function folkLogTouche(
  cibleNom: string,
  contenu: string,
  canal?: string | null
): Promise<FolkSyncResult> {
  if (!hasFolkKey()) return { ok: false, matched: false, detail: "Pas de clé Folk." };
  try {
    const person = await findOrCreatePerson(cibleNom);
    if (!person) return { ok: false, matched: false, detail: `Fiche Folk « ${cibleNom} » : création/recherche impossible.` };
    const title = (contenu.split("\n")[0] || "Touche Magellan").slice(0, 255);
    const res = await folk("POST", "/interactions", {
      entity: { id: person.id },
      dateTime: new Date().toISOString(),
      title,
      content: (contenu.trim() || title).slice(0, 100000),
      type: folkInteractionType(canal),
    });
    return {
      ok: res.ok,
      matched: true,
      detail: res.ok ? `Touche loggée dans Folk pour ${cibleNom}.` : `Échec interaction Folk (${res.status}).`,
    };
  } catch (e) {
    return { ok: false, matched: false, detail: e instanceof Error ? e.message : "Erreur Folk" };
  }
}

/** Ajoute un téléphone à la fiche Folk. */
export async function folkAddPhone(cibleNom: string, phone: string): Promise<FolkSyncResult> {
  if (!hasFolkKey()) return { ok: false, matched: false, detail: "Pas de clé Folk." };
  try {
    const person = await findOrCreatePerson(cibleNom);
    if (!person) return { ok: false, matched: false, detail: `Fiche Folk « ${cibleNom} » : création/recherche impossible.` };
    const phones = Array.from(new Set([...(person.phones ?? []), phone]));
    const ok = await updatePerson(person.id, { phones });
    return { ok, matched: true, detail: ok ? `Téléphone ajouté à la fiche Folk de ${cibleNom}.` : "Échec de mise à jour Folk." };
  } catch (e) {
    return { ok: false, matched: false, detail: e instanceof Error ? e.message : "Erreur Folk" };
  }
}

/** Ajoute un email à la fiche Folk (union avec les emails existants). */
export async function folkAddEmail(cibleNom: string, email: string): Promise<FolkSyncResult> {
  if (!hasFolkKey()) return { ok: false, matched: false, detail: "Pas de clé Folk." };
  try {
    const person = await findOrCreatePerson(cibleNom);
    if (!person) return { ok: false, matched: false, detail: `Fiche Folk « ${cibleNom} » : création/recherche impossible.` };
    const emails = Array.from(new Set([...(person.emails ?? []), email]));
    const ok = await updatePerson(person.id, { emails });
    return { ok, matched: true, detail: ok ? `Email ajouté à la fiche Folk de ${cibleNom}.` : "Échec de mise à jour Folk." };
  } catch (e) {
    return { ok: false, matched: false, detail: e instanceof Error ? e.message : "Erreur Folk" };
  }
}
