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
    const person = await findPersonByName(cibleNom);
    if (!person) return { ok: false, matched: false, detail: `Fiche Folk « ${cibleNom} » introuvable.` };
    const line = `Allié : ${allyNom}${context ? ` — ${context}` : ""}`;
    const description = [person.description?.trim(), line].filter(Boolean).join("\n");
    const ok = await updatePerson(person.id, { description });
    return { ok, matched: true, detail: ok ? `Fiche Folk de ${cibleNom} mise à jour.` : "Échec de mise à jour Folk." };
  } catch (e) {
    return { ok: false, matched: false, detail: e instanceof Error ? e.message : "Erreur Folk" };
  }
}

/** Ajoute un téléphone à la fiche Folk. */
export async function folkAddPhone(cibleNom: string, phone: string): Promise<FolkSyncResult> {
  if (!hasFolkKey()) return { ok: false, matched: false, detail: "Pas de clé Folk." };
  try {
    const person = await findPersonByName(cibleNom);
    if (!person) return { ok: false, matched: false, detail: `Fiche Folk « ${cibleNom} » introuvable.` };
    const phones = Array.from(new Set([...(person.phones ?? []), phone]));
    const ok = await updatePerson(person.id, { phones });
    return { ok, matched: true, detail: ok ? `Téléphone ajouté à la fiche Folk de ${cibleNom}.` : "Échec de mise à jour Folk." };
  } catch (e) {
    return { ok: false, matched: false, detail: e instanceof Error ? e.message : "Erreur Folk" };
  }
}
