// Fiche de PUBLICATION d'un épisode (schéma de référence, rebranchement 1).
// Tout le domaine publication de Louis, éditable par l'équipe ; une fois le
// verrou posé (published_locked_at), lecture seule sauf profil admin.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getShow } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { estAdmin, valeursStatut, CHAMPS_PUBLICATION } from "@/lib/episodes/publication";
import { EpisodePublicationForm } from "@/components/EpisodePublicationForm";

export default async function EpisodePublicationPage({
  params,
}: {
  params: { show: string; episodeId: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();
  const sb = createClient();

  const { data: ep } = await sb
    .from("episodes")
    .select(`id, cible_id, nom, date_enregistrement, published_locked_at, ${CHAMPS_PUBLICATION.join(", ")}`)
    .eq("id", params.episodeId)
    .eq("show_id", show.id)
    .maybeSingle();
  if (!ep) notFound();

  const [{ data: auth }, statutsProduction, statutsMedia] = await Promise.all([
    sb.auth.getUser(),
    valeursStatut(sb, "production_statut"),
    valeursStatut(sb, "media_statut"),
  ]);
  const admin = await estAdmin(sb, auth.user?.id);

  const episode = ep as unknown as Record<string, unknown> & { id: string; nom: string };

  return (
    <div>
      <div className="mb-6">
        <Link href={`/${show.slug}/episodes`} className="text-sm text-blanc-muted hover:underline">
          ← Épisodes
        </Link>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
          Publication — {episode.nom}
        </h1>
        <p className="text-sm text-blanc-muted">
          La source de vérité de la publication : numéro, descriptions, visuels, liens plateformes, statuts de production.
        </p>
      </div>
      <EpisodePublicationForm
        showSlug={show.slug}
        episode={episode}
        estAdmin={admin}
        statutsProduction={statutsProduction.length ? statutsProduction : ["à faire", "en cours", "à revoir", "en review", "validé"]}
        statutsMedia={statutsMedia.length ? statutsMedia : ["à faire", "en cours", "à revoir", "en review", "validé"]}
      />
    </div>
  );
}
