// Tâche 1 (handoff 24/07) — verrou anti chevauchement du drainage.
//
// Le cron Vercel passe toutes les 5 minutes (plan Pro) avec un budget mural de
// 280 s : deux exécutions peuvent se croiser, et Vercel ne gère pas les
// chevauchements. Verrou à bail (TTL) dans system_state : une exécution pose
// le bail, la suivante passe son tour tant que le bail court, et un crash ne
// bloque rien (le bail expire seul). Défensif : sans la table (0038), le
// verrou est inactif et le drainage reste possible (fail-open).

import type { createServiceClient } from "../supabase/service";

type SB = ReturnType<typeof createServiceClient>;

const CLE = "drain_verrou";

export async function prendreVerrou(sb: SB, ttlMs: number, now = Date.now()): Promise<boolean> {
  try {
    const { data } = await sb.from("system_state").select("value").eq("key", CLE).maybeSingle();
    const jusquA = (data as { value?: { jusqu_a?: string } } | null)?.value?.jusqu_a;
    if (jusquA && new Date(jusquA).getTime() > now) return false; // bail en cours
    await sb.from("system_state").upsert({
      key: CLE,
      value: { jusqu_a: new Date(now + ttlMs).toISOString() },
      updated_at: new Date(now).toISOString(),
    });
    return true;
  } catch {
    return true; // table absente : jamais bloquant
  }
}

export async function rendreVerrou(sb: SB): Promise<void> {
  try {
    await sb.from("system_state").upsert({ key: CLE, value: { jusqu_a: null }, updated_at: new Date().toISOString() });
  } catch {
    /* table absente */
  }
}
