// Anti-doublon à la création (brief du 21/09). Constat : « Major Movement »
// créé face à « Grégoire Gibault » (Major Mouvement déjà en organisation) et
// « Neil Zghidour » face à « Neil Zeghidour » (distance d'édition 1) ; le
// contrôle P1 ne compare que le nom normalisé exact.
//
// Ordre de résolution : identifiants FORTS d'abord (folk_id, email, LinkedIn),
// puis similarité de nom (blocking pg_trgm indexé GIN via le RPC
// candidats_doublon de la migration 0054, levenshtein en second filtre). Des
// emails connus et DIFFÉRENTS valent non-doublon définitif. Zone grise :
// arbitrage LLM sur les cinq meilleurs candidats, création AUTORISÉE avec
// drapeau doublon_suspect et versement dans la file d'arbitrage (system_state,
// même mécanique que folk_reparation, consultée par le digest de 19h).
// Règle : le faux négatif prime sur le faux positif. Un doublon manqué coûte
// une fusion ; une fusion erronée coûte de l'historique et de la confiance.
//
// Défensif dans les deux sens : migration 0054 absente = repli silencieux sur
// le contrôle P1 existant (nom normalisé exact), rien ne casse.

import Anthropic from "@anthropic-ai/sdk";
import { extractJson } from "./ai/websearch";
import { hasAnthropicKey } from "./copilot/config";
import type { createServiceClient } from "./supabase/service";

type SB = ReturnType<typeof createServiceClient>;

export const CLE_DOUBLONS_SUSPECTS = "doublons_suspects";
const MODELE_ARBITRAGE = process.env.ENRICH_MODEL ?? "claude-haiku-4-5-20251001";

/* ───────────────────────── normalisation (miroir TS de norm_nom) ───────────────────────── */

const PARTICULES = new Set([
  "de", "du", "des", "la", "le", "les", "von", "van", "der", "den", "ter",
  "el", "al", "di", "da", "del", "della", "dos", "das", "do", "bin", "ben", "ibn",
]);

/** Normalisation de comparaison (PURE, testée), miroir exact de la fonction
 *  SQL norm_nom : minuscules, accents retirés, parenthèses retirées,
 *  ponctuation en espace, particules retirées, tokens TRIÉS. */
export function normNomDoublon(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !PARTICULES.has(t))
    .sort()
    .join(" ");
}

/** Distance de Levenshtein (PURE, testée) : second filtre après le blocking. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i, ...Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/* ───────────────────────── classification ───────────────────────── */

/** Seuils. Blocage dur : identifiant fort, OU très haute similarité de nom
 *  avec organisation concordante, OU distance d'édition de 1 sur un nom
 *  normalisé assez long (Zghidour/Zeghidour). Zone grise : similarité
 *  moyenne ou distance courte, l'arbitrage LLM et la file tranchent. */
export const SEUIL_BLOCAGE_SIM = 0.9;
export const SEUIL_ZONE_GRISE_SIM = 0.55;
export const SEUIL_ZONE_GRISE_LEV = 2;
export const LONGUEUR_MIN_LEV1 = 8;

export interface CandidatDoublon {
  cible_id: string;
  nom: string;
  champ: "nom" | "alias" | "organisation" | "role";
  valeur: string;
  sim: number;
  lev: number;
  organisation?: string | null;
  role?: string | null;
  archive?: boolean;
}

export type ClasseDoublon = "bloque" | "zone_grise" | "distinct";

/** Classe UN candidat (PURE, testée). `orgConcordante` : l'organisation
 *  fournie à la création correspond à celle du candidat (nom normalisé). */
export function classifieCandidat(c: Pick<CandidatDoublon, "champ" | "sim" | "lev" | "valeur">, nomNorm: string, orgConcordante: boolean): ClasseDoublon {
  // Distance 1 sur le NOM complet normalisé, assez long pour exclure les
  // prénoms courts : même personne à une lettre près (Zghidour/Zeghidour).
  if (c.champ === "nom" && c.lev <= 1 && Math.min(c.valeur.length, nomNorm.length) >= LONGUEUR_MIN_LEV1) return "bloque";
  // Très haute similarité de nom ET organisation concordante.
  if (c.champ === "nom" && c.sim >= SEUIL_BLOCAGE_SIM && orgConcordante) return "bloque";
  // Zone grise : similarité moyenne, distance courte, ou correspondance sur
  // un autre champ (alias, organisation, rôle : le cas Major Mouvement).
  if (c.sim >= SEUIL_ZONE_GRISE_SIM || c.lev <= SEUIL_ZONE_GRISE_LEV) return "zone_grise";
  return "distinct";
}

/* ───────────────────────── identifiants forts ───────────────────────── */

export interface ContactFourni { kind: string; valeur: string }

/** Valeurs d'identifiants forts d'une liste de contacts (PURE, testée) :
 *  emails en minuscules, URLs LinkedIn ramenées au slug de profil. */
export function identifiantsForts(contacts: ContactFourni[] | undefined): { emails: string[]; linkedin: string[] } {
  const emails: string[] = [];
  const linkedin: string[] = [];
  for (const c of contacts ?? []) {
    const v = (c.valeur ?? "").trim().toLowerCase();
    if (!v) continue;
    if (c.kind === "email" && v.includes("@")) emails.push(v);
    const m = v.match(/linkedin\.com\/(?:in|company)\/([a-z0-9%._-]+)/);
    if (m) linkedin.push(m[1].replace(/\/+$/, ""));
  }
  return { emails: [...new Set(emails)], linkedin: [...new Set(linkedin)] };
}

/** Cible du show portant un de ces identifiants forts (email exact, profil
 *  LinkedIn) : doublon certain, blocage. Renvoie null sans identifiant. */
type LigneContactJoint = { cible_id: string; valeur: string; cibles: { nom: string } | { nom: string }[] };

function nomJoint(c: LigneContactJoint["cibles"]): string {
  return (Array.isArray(c) ? c[0]?.nom : c?.nom) ?? "";
}

export async function cibleParIdentifiantFort(
  sb: SB,
  showId: string,
  ids: { emails: string[]; linkedin: string[] }
): Promise<{ cible_id: string; nom: string; identifiant: string } | null> {
  if (ids.emails.length) {
    const { data } = await sb
      .from("contacts")
      .select("cible_id, valeur, cibles!inner(id, nom, show_id)")
      .eq("kind", "email")
      .in("valeur", ids.emails)
      .eq("cibles.show_id", showId)
      .limit(1);
    const hit = ((data ?? []) as unknown as LigneContactJoint[])[0];
    if (hit) return { cible_id: hit.cible_id, nom: nomJoint(hit.cibles), identifiant: `email ${hit.valeur}` };
  }
  if (ids.linkedin.length) {
    const { data } = await sb
      .from("contacts")
      .select("cible_id, valeur, cibles!inner(id, nom, show_id)")
      .in("kind", ["reseau", "site"])
      .eq("cibles.show_id", showId)
      .ilike("valeur", "%linkedin.com%")
      .limit(400);
    for (const row of (data ?? []) as unknown as LigneContactJoint[]) {
      const m = row.valeur.toLowerCase().match(/linkedin\.com\/(?:in|company)\/([a-z0-9%._-]+)/);
      if (m && ids.linkedin.includes(m[1].replace(/\/+$/, ""))) {
        return { cible_id: row.cible_id, nom: nomJoint(row.cibles), identifiant: `linkedin ${m[1]}` };
      }
    }
  }
  return null;
}

/** Emails connus d'un lot de cibles (pour la règle « emails connus et
 *  différents valent non-doublon définitif »). */
export async function emailsDesCibles(sb: SB, cibleIds: string[]): Promise<Map<string, string[]>> {
  const par = new Map<string, string[]>();
  if (!cibleIds.length) return par;
  const { data } = await sb.from("contacts").select("cible_id, valeur").eq("kind", "email").in("cible_id", cibleIds);
  for (const row of (data ?? []) as { cible_id: string; valeur: string }[]) {
    const liste = par.get(row.cible_id) ?? [];
    liste.push(row.valeur.trim().toLowerCase());
    par.set(row.cible_id, liste);
  }
  return par;
}

/* ───────────────────────── blocking (RPC 0054, repli silencieux) ───────────────────────── */

/** Candidats de similarité via le RPC candidats_doublon. Migration 0054
 *  absente : liste vide, le contrôle P1 existant reste seul (défensif). */
export async function candidatsDoublon(sb: SB, showId: string, nom: string, limite = 10): Promise<CandidatDoublon[]> {
  try {
    const { data, error } = await sb.rpc("candidats_doublon", { p_show: showId, p_nom: nom, p_limite: limite });
    if (error) return [];
    return ((data ?? []) as CandidatDoublon[]).filter((c) => c.cible_id && c.nom);
  } catch {
    return [];
  }
}

/* ───────────────────────── arbitrage LLM (zone grise, 5 candidats max) ───────────────────────── */

export interface VerdictLLM {
  verdict: "doublon_probable" | "distinct";
  cible_id?: string;
  raison?: string;
}

/** Arbitrage LLM sur les cinq meilleurs candidats de la zone grise. En échec
 *  ou sans clé : doublon_probable par défaut (le drapeau ne coûte qu'un
 *  passage en file, jamais une fusion : le faux négatif prime au niveau de la
 *  FUSION, pas du signalement). */
export async function arbitrageLLM(
  candidatNom: string,
  candidatOrganisation: string | undefined,
  candidats: CandidatDoublon[],
  timeoutMs = 12_000
): Promise<VerdictLLM> {
  const top5 = candidats.slice(0, 5);
  const repli: VerdictLLM = { verdict: "doublon_probable", cible_id: top5[0]?.cible_id, raison: "arbitrage indisponible, versé à la file par prudence" };
  if (!hasAnthropicKey() || !top5.length) return repli;
  try {
    const client = new Anthropic();
    const prompt = [
      `Nouvelle cible à créer : « ${candidatNom} »${candidatOrganisation ? ` (organisation : ${candidatOrganisation})` : ""}.`,
      "Cibles existantes proches (nom, champ qui matche, organisation, rôle) :",
      ...top5.map((c, i) => `${i + 1}. [${c.cible_id}] ${c.nom} · champ ${c.champ} (${c.valeur}) · organisation: ${c.organisation ?? "?"} · rôle: ${c.role ?? "?"}`),
      "La nouvelle cible désigne-t-elle la MÊME personne ou entité qu'une des existantes (nom de scène contre état civil, variante d'orthographe, translittération) ?",
      'Réponds UNIQUEMENT en JSON : {"verdict": "doublon_probable" | "distinct", "cible_id": "id de la cible existante concernée (si doublon_probable)", "raison": "une phrase"}',
    ].join("\n");
    const appel = client.messages.create({
      model: MODELE_ARBITRAGE,
      max_tokens: 300,
      system: "Tu arbitres des doublons de CRM. Un nom de scène, un pseudonyme, une variante d'orthographe ou une translittération de la même personne = doublon_probable. Deux personnes réellement différentes = distinct. En cas de doute réel, doublon_probable (le signalement est réversible, une fiche ratée ne l'est pas).",
      messages: [{ role: "user", content: prompt }],
    });
    const res = await Promise.race([appel, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
    if (!res) return repli;
    const texte = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
    const json = extractJson<VerdictLLM>(texte);
    if (!json || (json.verdict !== "doublon_probable" && json.verdict !== "distinct")) return repli;
    if (json.verdict === "doublon_probable" && (!json.cible_id || !top5.some((c) => c.cible_id === json.cible_id))) {
      json.cible_id = top5[0].cible_id;
    }
    return json;
  } catch {
    return repli;
  }
}

/* ───────────────────────── file d'arbitrage (system_state) ───────────────────────── */

export interface SuspectEnFile {
  cible_id: string;
  nom: string;
  candidats: { cible_id: string; nom: string; champ: string; sim: number; lev: number }[];
  verdict?: VerdictLLM;
  origine: "creation" | "retro";
  detecte_le: string;
}

/** Verse un suspect à la file d'arbitrage (system_state, clé
 *  doublons_suspects) : même mécanique que folk_reparation, consultée par
 *  list_doublons_suspects et le digest de 19h. Best-effort, dédoublonné par
 *  cible_id, borné à 200 entrées (les plus récentes gagnent). */
export async function verseALaFile(sb: SB, entree: SuspectEnFile): Promise<void> {
  try {
    const { data } = await sb.from("system_state").select("value").eq("key", CLE_DOUBLONS_SUSPECTS).maybeSingle();
    const actuel = ((data as { value?: { suspects?: SuspectEnFile[] } } | null)?.value?.suspects ?? []).filter(
      (s) => s.cible_id !== entree.cible_id
    );
    const suspects = [entree, ...actuel].slice(0, 200);
    await sb.from("system_state").upsert({
      key: CLE_DOUBLONS_SUSPECTS,
      value: { suspects, mis_a_jour: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* table 0038 absente ou erreur : le drapeau sur la cible reste */
  }
}

/** Pose le drapeau doublon_suspect sur la cible. Best-effort : colonne 0054
 *  absente = silencieux, la file system_state garde l'information. */
export async function poseDrapeauSuspect(sb: SB, cibleId: string, detail: Record<string, unknown>): Promise<void> {
  try {
    await sb.from("cibles").update({ doublon_suspect: detail }).eq("id", cibleId);
  } catch {
    /* colonne absente : migration 0054 pas encore appliquée */
  }
}

/** Alias d'une cible (fusion, enrichissement, manuel). Best-effort : table
 *  0054 absente = silencieux. Renvoie true si l'alias est réellement écrit. */
export async function ajouteAlias(sb: SB, cibleId: string, alias: string, source: "fusion" | "enrichissement" | "manuel"): Promise<boolean> {
  const propre = (alias ?? "").trim();
  if (!propre || !normNomDoublon(propre)) return false;
  try {
    const { error } = await sb.from("cible_alias").upsert(
      { cible_id: cibleId, alias: propre, source },
      { onConflict: "cible_id,alias_norm", ignoreDuplicates: true }
    );
    return !error;
  } catch {
    return false;
  }
}
