// Chantier 2 — santé de l'API Anthropic : classification des erreurs,
// disjoncteur (circuit breaker) persisté en base, nettoyage des messages
// d'erreur avant journalisation (aucun secret dans les journaux, garde-fou §8.2).
//
// Politique de retry (brief §3.3) : seules les erreurs TRANSITOIRES méritent une
// seconde tentative complète (surcharge, 5xx, réseau). Un JSON illisible est
// déjà couvert par le finisher ; un crédit épuisé ne se réessaie pas, il se
// disjoncte : réessayer brûlerait des tokens et du temps pour rien.

import type { createServiceClient } from "../supabase/service";

type SB = ReturnType<typeof createServiceClient>;

export type ClasseErreur = "transitoire" | "credit" | "autre";

/** Classe une erreur d'appel modèle. Pilote le retry et le disjoncteur. */
export function classifyApiError(message: string): ClasseErreur {
  const m = message.toLowerCase();
  if (m.includes("credit balance is too low") || m.includes("billing")) return "credit";
  if (
    m.includes("overloaded") ||
    m.includes("rate limit") ||
    m.includes("429") ||
    m.includes("529") ||
    /\b5\d{2}\b/.test(m) ||
    m.includes("timeout") ||
    m.includes("econnreset") ||
    m.includes("fetch failed") ||
    m.includes("socket")
  ) {
    return "transitoire";
  }
  return "autre";
}

/** Retire des messages d'erreur tout ce qui ressemble à un secret avant
 *  journalisation (enrichment_jobs.error est affiché dans la fiche). */
export function sanitizeError(message: string): string {
  return message
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/(api[_-]?key|secret|token|password)(["'\s:=]+)[A-Za-z0-9._-]{8,}/gi, "$1$2***")
    .slice(0, 500);
}

const BREAKER_KEY = "anthropic_breaker";
const SEUIL_ECHECS = 3;          // échecs API consécutifs avant ouverture
const FENETRE_MS = 10 * 60_000;  // fenêtre de comptage des échecs
const OUVERTURE_MS = 30 * 60_000; // durée d'ouverture du circuit

interface BreakerState {
  echecs: number;
  premier_echec: string | null; // ISO
  ouvert_jusqu_a: string | null; // ISO
  derniere_erreur?: string;
}

async function readBreaker(sb: SB): Promise<BreakerState> {
  const { data } = await sb.from("system_state").select("value").eq("key", BREAKER_KEY).maybeSingle();
  const v = ((data as { value?: BreakerState } | null)?.value ?? {}) as Partial<BreakerState>;
  return { echecs: v.echecs ?? 0, premier_echec: v.premier_echec ?? null, ouvert_jusqu_a: v.ouvert_jusqu_a ?? null, derniere_erreur: v.derniere_erreur };
}

async function writeBreaker(sb: SB, state: BreakerState): Promise<void> {
  await sb.from("system_state").upsert({ key: BREAKER_KEY, value: state, updated_at: new Date().toISOString() });
}

/** Le circuit est-il ouvert ? (API considérée durablement indisponible.) */
export async function breakerOuvert(sb: SB, now = Date.now()): Promise<{ ouvert: boolean; jusqu_a: string | null; cause?: string }> {
  try {
    const s = await readBreaker(sb);
    if (s.ouvert_jusqu_a && new Date(s.ouvert_jusqu_a).getTime() > now) {
      return { ouvert: true, jusqu_a: s.ouvert_jusqu_a, cause: s.derniere_erreur };
    }
    return { ouvert: false, jusqu_a: null };
  } catch {
    return { ouvert: false, jusqu_a: null }; // table absente (0038 non appliquée) : jamais bloquant
  }
}

/** Enregistre un échec API. Un échec « credit » ouvre le circuit immédiatement ;
 *  les transitoires l'ouvrent au bout de SEUIL_ECHECS dans la fenêtre.
 *  Renvoie true si le circuit vient de s'ouvrir (déclencheur d'alerte). */
export async function breakerEchec(sb: SB, message: string, classe: ClasseErreur, now = Date.now()): Promise<boolean> {
  try {
    const s = await readBreaker(sb);
    const dansFenetre = s.premier_echec && now - new Date(s.premier_echec).getTime() < FENETRE_MS;
    const echecs = dansFenetre ? s.echecs + 1 : 1;
    const premier = dansFenetre ? s.premier_echec : new Date(now).toISOString();
    const doitOuvrir = classe === "credit" || echecs >= SEUIL_ECHECS;
    const dejaOuvert = !!(s.ouvert_jusqu_a && new Date(s.ouvert_jusqu_a).getTime() > now);
    await writeBreaker(sb, {
      echecs,
      premier_echec: premier,
      ouvert_jusqu_a: doitOuvrir ? new Date(now + OUVERTURE_MS).toISOString() : s.ouvert_jusqu_a,
      derniere_erreur: sanitizeError(message),
    });
    return doitOuvrir && !dejaOuvert;
  } catch {
    return false;
  }
}

/** Un succès referme le circuit et remet les compteurs à zéro. */
export async function breakerSucces(sb: SB): Promise<void> {
  try {
    await writeBreaker(sb, { echecs: 0, premier_echec: null, ouvert_jusqu_a: null });
  } catch {
    /* table absente : rien à faire */
  }
}
