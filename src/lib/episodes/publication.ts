// Rebranchement du domaine PUBLICATION (schéma de référence, phase 2, PR de
// rebranchement 1). Brique partagée entre la console (server actions) et le
// MCP : liste blanche des champs éditables, verrou de publication, lecture.
//
// Verrou (règle 3 du brief) : published_locked_at posé = champs de
// publication en LECTURE SEULE, sauf profil admin. Verrou applicatif, pas de
// contrainte base. Poser le verrou est un geste d'équipe ; le lever ou
// écrire verrouillé exige le rôle admin.

import type { createServiceClient } from "../supabase/service";

/** Client Supabase minimal : le client service (MCP) et le client de session
 *  (server actions) conviennent tous les deux. */
type SB = Pick<ReturnType<typeof createServiceClient>, "from">;

/** Champs de publication éditables (liste BLANCHE : rien d'autre ne passe,
 *  ni cible_id, ni show_id, ni statut_prod deprecated, ni le verrou). */
export const CHAMPS_PUBLICATION = [
  "numero",
  "titre",
  "description_site",
  "description_youtube",
  "description_rss",
  "miniature_v1",
  "miniature_v2",
  "miniature_v3",
  "visuel_public_ecoute",
  "visuel_public_instagram",
  "photo_post_linkedin",
  "date_publication",
  "transcript",
  "notes_clemence",
  "fiche_prepa",
  "liens_livres",
  "episodes_mentionnes",
  "seo_liens",
  "chapitres",
  "contenu_linkedin",
  "shorts_script",
  "shorts_statut",
  "shorts_lien",
  "teaser_reseaux_script",
  "teaser_reseaux_statut",
  "teaser_reseaux_lien",
  "teaser_youtube_script",
  "teaser_youtube_statut",
  "teaser_youtube_lien",
  "extraits",
  "sponsors",
  "timestamp_hr",
  "lien_youtube",
  "lien_apple_podcast",
  "lien_spotify",
  "lien_amazon_music",
  "lien_deezer",
  "statut_script",
  "statut_montage",
  "statut_illustration",
] as const;

export type ChampPublication = (typeof CHAMPS_PUBLICATION)[number];

/** Filtre un patch arbitraire sur la liste blanche. Les champs inconnus sont
 *  renvoyés pour une erreur actionnable, jamais écrits en silence. */
export function filtrePatchPublication(patch: Record<string, unknown>): {
  admis: Record<string, unknown>;
  refuses: string[];
} {
  const connus = new Set<string>(CHAMPS_PUBLICATION);
  const admis: Record<string, unknown> = {};
  const refuses: string[] = [];
  for (const [champ, valeur] of Object.entries(patch)) {
    if (valeur === undefined) continue;
    if (connus.has(champ)) admis[champ] = valeur;
    else refuses.push(champ);
  }
  return { admis, refuses };
}

/** Décision d'écriture sous verrou (pure, testée) : null = autorisé, sinon
 *  le motif du refus. */
export function motifRefusEcriture(
  publishedLockedAt: string | null,
  estAdmin: boolean
): string | null {
  if (!publishedLockedAt) return null;
  if (estAdmin) return null;
  return `Épisode verrouillé depuis le ${new Date(publishedLockedAt).toLocaleDateString("fr-FR")} : les champs de publication sont en lecture seule. Un profil admin peut écrire ou lever le verrou.`;
}

/** Le compte est-il admin ? (profiles.user_type). Prudent : introuvable = non. */
export async function estAdmin(sb: SB, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const { data } = await sb.from("profiles").select("user_type").eq("id", userId).maybeSingle();
  return (data as { user_type?: string } | null)?.user_type === "admin";
}

/** Valeurs actives d'un domaine de statut (table ref_statuts, 0044). */
export async function valeursStatut(sb: SB, domaine: string): Promise<string[]> {
  const { data } = await sb
    .from("ref_statuts")
    .select("valeur, position")
    .eq("domaine", domaine)
    .eq("actif", true)
    .order("position");
  return ((data ?? []) as { valeur: string }[]).map((v) => v.valeur);
}

/** Écrit un patch de publication sur un épisode, verrou respecté.
 *  Partagé par la server action de la console et l'outil MCP. */
export async function majPublication(
  sb: SB,
  episodeId: string,
  patch: Record<string, unknown>,
  opts: { estAdmin: boolean }
): Promise<{ ok: true; champs: string[] } | { ok: false; erreur: string; champs_refuses?: string[] }> {
  const { admis, refuses } = filtrePatchPublication(patch);
  if (refuses.length) {
    return { ok: false, erreur: `Champs hors du domaine publication : ${refuses.join(", ")}.`, champs_refuses: refuses };
  }
  if (!Object.keys(admis).length) return { ok: false, erreur: "Patch vide : aucun champ de publication fourni." };
  const { data: ep } = await sb
    .from("episodes")
    .select("id, published_locked_at")
    .eq("id", episodeId)
    .maybeSingle();
  if (!ep) return { ok: false, erreur: `Épisode ${episodeId} introuvable.` };
  const refus = motifRefusEcriture((ep as { published_locked_at: string | null }).published_locked_at, opts.estAdmin);
  if (refus) return { ok: false, erreur: refus };
  const { error } = await sb.from("episodes").update(admis).eq("id", episodeId);
  if (error) return { ok: false, erreur: error.message };
  return { ok: true, champs: Object.keys(admis) };
}
