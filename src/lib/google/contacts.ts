// Lot 8 — Synchro Magellan -> Google Contacts (People API), unidirectionnelle.
// Auth : compte de service + délégation domaine (Workspace), impersonation du
// compte cible. Aucune reconnexion en régime permanent.
//
// Env requis (serveur uniquement, jamais journalisé) :
//   GOOGLE_SA_KEY            JSON de la clé du compte de service
//   GOOGLE_IMPERSONATE_EMAIL compte dont on gère les contacts (ex. matt@collision.studio)
//
// Le mapping n'écrit QUE les champs gérés par Magellan (updatePersonFields) :
// on n'écrase jamais un champ ajouté à la main dans Google.

import { SignJWT, importPKCS8 } from "jose";

const PEOPLE = "https://people.googleapis.com/v1";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/contacts";
const MANAGED_FIELDS = "names,organizations,phoneNumbers,emailAddresses,urls,biographies,memberships";

export function hasGoogleSync(): boolean {
  const k = process.env.GOOGLE_SA_KEY ?? "";
  return k.length > 20 && !!process.env.GOOGLE_IMPERSONATE_EMAIL;
}

let cachedToken: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string | null> {
  if (!hasGoogleSync()) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  try {
    const sa = JSON.parse(process.env.GOOGLE_SA_KEY as string) as { client_email: string; private_key: string };
    const key = await importPKCS8(sa.private_key, "RS256");
    const assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(sa.client_email)
      .setSubject(process.env.GOOGLE_IMPERSONATE_EMAIL as string)
      .setAudience(TOKEN_URL)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    cachedToken = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
    return j.access_token;
  } catch {
    return null;
  }
}

async function gfetch(token: string, path: string, init: RequestInit): Promise<Response> {
  return fetch(`${PEOPLE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
}

export interface GoogleContactHit {
  emails: string[];
  phones: string[];
}

type SearchResults = {
  results?: { person?: { names?: { displayName?: string }[]; emailAddresses?: { value?: string }[]; phoneNumbers?: { value?: string }[] } }[];
};

/** Cherche un contact Google (du compte impersonné) par nom et renvoie ses coordonnées. */
export async function searchGoogleContact(token: string, query: string): Promise<GoogleContactHit | null> {
  const run = async (q: string) => {
    const res = await gfetch(
      token,
      `/people:searchContacts?query=${encodeURIComponent(q)}&readMask=names,emailAddresses,phoneNumbers&pageSize=10`,
      { method: "GET" }
    );
    if (!res.ok) return [] as NonNullable<SearchResults["results"]>;
    return ((await res.json()) as SearchResults).results ?? [];
  };

  let results = await run(query);
  if (results.length === 0) {
    // searchContacts renvoie souvent vide à froid : on réchauffe le cache (requête
    // vide) puis on réessaie.
    await run("");
    await new Promise((r) => setTimeout(r, 1500));
    results = await run(query);
  }
  if (!results.length) return null;
  const low = query.trim().toLowerCase();
  const best =
    results.find((r) => (r.person?.names?.[0]?.displayName ?? "").toLowerCase().includes(low)) ?? results[0];
  const p = best.person ?? {};
  return {
    emails: (p.emailAddresses ?? []).map((e) => e.value ?? "").filter(Boolean),
    phones: (p.phoneNumbers ?? []).map((x) => x.value ?? "").filter(Boolean),
  };
}

/** Crée (si absent) un groupe de contacts par nom, renvoie son resourceName. */
async function ensureGroup(token: string, name: string, cache: Map<string, string>): Promise<string | null> {
  if (cache.has(name)) return cache.get(name) ?? null;
  try {
    // Liste pour retrouver un groupe existant du même nom.
    const list = await gfetch(token, "/contactGroups?groupFields=name&pageSize=200", { method: "GET" });
    if (list.ok) {
      const j = (await list.json()) as { contactGroups?: { resourceName: string; name: string; formattedName?: string }[] };
      const hit = (j.contactGroups ?? []).find((g) => g.name === name || g.formattedName === name);
      if (hit) {
        cache.set(name, hit.resourceName);
        return hit.resourceName;
      }
    }
    const res = await gfetch(token, "/contactGroups", { method: "POST", body: JSON.stringify({ contactGroup: { name } }) });
    if (!res.ok) return null;
    const g = (await res.json()) as { resourceName?: string };
    if (!g.resourceName) return null;
    cache.set(name, g.resourceName);
    return g.resourceName;
  } catch {
    return null;
  }
}

export interface PersonInput {
  fullName: string;
  givenName?: string | null;
  familyName?: string | null;
  organisation?: string | null;
  role?: string | null;
  phones?: string[];
  emails?: string[];
  urls?: string[];
  bio?: string | null;
  groupResourceNames?: string[];
}

function buildPerson(p: PersonInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    names: [{ unstructuredName: p.fullName, givenName: p.givenName ?? undefined, familyName: p.familyName ?? undefined }],
  };
  if (p.organisation || p.role) body.organizations = [{ name: p.organisation ?? undefined, title: p.role ?? undefined }];
  if (p.phones?.length) body.phoneNumbers = p.phones.map((value) => ({ value }));
  if (p.emails?.length) body.emailAddresses = p.emails.map((value) => ({ value }));
  if (p.urls?.length) body.urls = p.urls.map((value) => ({ value }));
  if (p.bio) body.biographies = [{ value: p.bio, contentType: "TEXT_PLAIN" }];
  if (p.groupResourceNames?.length)
    body.memberships = p.groupResourceNames.map((g) => ({ contactGroupMembership: { contactGroupResourceName: g } }));
  return body;
}

export interface UpsertResult {
  resourceName: string | null;
  etag: string | null;
  ok: boolean;
  detail: string;
}

/**
 * Crée ou met à jour un contact Google. Avec resourceName+etag -> updateContact
 * (champs gérés uniquement) ; sinon createContact. Gère l'etag périmé (1 réessai).
 */
export async function upsertPerson(
  token: string,
  link: { resourceName: string | null; etag: string | null },
  input: PersonInput
): Promise<UpsertResult> {
  try {
    return await upsertPersonInner(token, link, input);
  } catch (e) {
    return { resourceName: link.resourceName, etag: link.etag, ok: false, detail: `Exception : ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function upsertPersonInner(
  token: string,
  link: { resourceName: string | null; etag: string | null },
  input: PersonInput
): Promise<UpsertResult> {
  const person = buildPerson(input);

  if (link.resourceName) {
    let etag = link.etag;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await gfetch(
        token,
        `/${link.resourceName}:updateContact?updatePersonFields=${encodeURIComponent(MANAGED_FIELDS)}`,
        { method: "PATCH", body: JSON.stringify({ ...person, etag }) }
      );
      if (res.ok) {
        const j = (await res.json()) as { resourceName?: string; etag?: string };
        return { resourceName: j.resourceName ?? link.resourceName, etag: j.etag ?? null, ok: true, detail: "Mis à jour." };
      }
      if (res.status === 400 || res.status === 409) {
        // etag périmé : on rafraîchit puis on réessaie une fois.
        const get = await gfetch(token, `/${link.resourceName}?personFields=names`, { method: "GET" });
        if (!get.ok) break;
        etag = ((await get.json()) as { etag?: string }).etag ?? etag;
        continue;
      }
      const body = await res.text().catch(() => "");
      return { resourceName: link.resourceName, etag: link.etag, ok: false, detail: `Échec update (${res.status}). ${body.slice(0, 120)}` };
    }
    return { resourceName: link.resourceName, etag: link.etag, ok: false, detail: "Échec update (etag)." };
  }

  const res = await gfetch(token, "/people:createContact", { method: "POST", body: JSON.stringify(person) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { resourceName: null, etag: null, ok: false, detail: `Échec create (${res.status}). ${body.slice(0, 120)}` };
  }
  const j = (await res.json()) as { resourceName?: string; etag?: string };
  return { resourceName: j.resourceName ?? null, etag: j.etag ?? null, ok: true, detail: "Créé." };
}

export { accessToken as googleAccessToken, ensureGroup };
