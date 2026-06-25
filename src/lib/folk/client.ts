// Client de l'API Folk (https://developer.folk.app). Lecture seule.
// Auth : Authorization: Bearer <FOLK_API_KEY>. Enveloppe { data: { items, pagination } }.
// Tourne côté serveur (Vercel) ; nécessite FOLK_API_KEY en variable d'env serveur.

const FOLK_BASE = "https://api.folk.app/v1";

export interface FolkGroup {
  id: string;
  name: string;
}

export interface FolkPerson {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  description?: string;
  jobTitle?: string;
  groups?: FolkGroup[];
  companies?: Array<{ name?: string } | string>;
  emails?: string[];
  phones?: string[];
  urls?: string[];
}

function folkKey(): string {
  return process.env.FOLK_API_KEY ?? "";
}

export function hasFolkKey(): boolean {
  const k = folkKey();
  return k.length > 0 && !k.includes("your-folk");
}

async function folkGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${folkKey()}`,
      "Content-Type": "application/json",
    },
    // Pas de cache : on veut l'état courant de Folk.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Folk API ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

interface FolkList<T> {
  data?: { items?: T[]; pagination?: { nextLink?: string } };
}

export async function fetchFolkGroups(): Promise<FolkGroup[]> {
  const json = await folkGet<FolkList<FolkGroup>>(`${FOLK_BASE}/groups?limit=100`);
  return json.data?.items ?? [];
}

/** Dernière interaction Folk, normalisée pour l'affichage fiche. */
export interface FolkInteraction {
  date: string | null;
  channel: string | null;
  summary: string | null;
}

function normalizeInteraction(raw: Record<string, unknown>): FolkInteraction {
  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return null;
  };
  return {
    date: pick("date", "occurredAt", "happenedAt", "createdAt", "timestamp"),
    channel: pick("channel", "type", "kind", "medium"),
    summary: pick("summary", "subject", "title", "note", "description"),
  };
}

/**
 * Dernière interaction connue de Folk pour une personne (Folk = source de
 * vérité). L'endpoint exact de lecture des interactions n'est pas dans la doc
 * publique (portail protégé) : on tente les deux formes REST canoniques et on
 * renvoie null si rien ne répond, pour que la fiche se dégrade proprement.
 * À confirmer/figer dès qu'on a la référence Folk « Interactions ».
 */
export async function fetchLatestFolkInteraction(
  personId: string
): Promise<FolkInteraction | null> {
  if (!hasFolkKey() || !personId) return null;
  const candidates = [
    `${FOLK_BASE}/people/${encodeURIComponent(personId)}/interactions?limit=1`,
    `${FOLK_BASE}/interactions?personId=${encodeURIComponent(personId)}&limit=1`,
  ];
  for (const url of candidates) {
    try {
      const json = await folkGet<FolkList<Record<string, unknown>>>(url);
      const items = json.data?.items ?? [];
      if (items.length > 0) return normalizeInteraction(items[0]);
    } catch {
      // endpoint absent / non autorisé : on essaie la forme suivante
    }
  }
  return null;
}

/** Récupère toutes les personnes (toutes les pages), filtrées par groupe si fourni. */
export async function fetchFolkPeople(groupId?: string): Promise<FolkPerson[]> {
  const out: FolkPerson[] = [];
  let url: string | null = `${FOLK_BASE}/people?limit=100`;
  let guard = 0;
  while (url && guard++ < 500) {
    const json: FolkList<FolkPerson> = await folkGet<FolkList<FolkPerson>>(url);
    out.push(...(json.data?.items ?? []));
    url = json.data?.pagination?.nextLink ?? null;
  }
  if (!groupId) return out;
  return out.filter((p) => (p.groups ?? []).some((g) => g.id === groupId));
}
