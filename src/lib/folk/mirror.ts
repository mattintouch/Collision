// S4 — rafraîchissement du miroir Folk (table folk_people). Appelé par le cron.
// Best-effort : ne jette pas, renvoie le nombre d'upserts.

import { createServiceClient } from "../supabase/service";
import { fetchFolkPeople, hasFolkKey } from "./client";
import { normName } from "../contacts/resolve";

export async function refreshFolkMirror(): Promise<{ upserts: number; error?: string }> {
  if (!hasFolkKey()) return { upserts: 0 };
  try {
    const people = await fetchFolkPeople();
    const sb = createServiceClient();
    const nowIso = new Date().toISOString();
    const rows = people
      .map((p) => {
        const nom = p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" ");
        return {
          id: p.id,
          nom,
          nom_normalise: normName(nom),
          emails: p.emails ?? [],
          phones: p.phones ?? [],
          updated_at: nowIso,
        };
      })
      .filter((r) => r.id);
    // Upsert par lots pour rester léger.
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await sb.from("folk_people").upsert(chunk, { onConflict: "id" });
      if (error) return { upserts: i, error: error.message };
    }
    return { upserts: rows.length };
  } catch (e) {
    return { upserts: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
