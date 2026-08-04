// Post-prod : avancement script/montage/illustration par épisode, colonnes
// alignées sur ref_statuts(domaine=production_statut). Cliquer une carte
// ouvre la fiche rédac (EpisodePublicationForm, domaine PUBLICATION complet)
// en modale, sur la même page — pas de navigation, pas de donnée mockée.

import { notFound } from "next/navigation";
import { getPostProdEpisodes, getShow } from "@/lib/data";
import { estAdmin, valeursStatut } from "@/lib/episodes/publication";
import { createClient } from "@/lib/supabase/server";
import { PostProdBoard } from "@/components/PostProdBoard";

export default async function PostProdPage({
  params,
}: {
  params: { show: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();

  const sb = createClient();
  const [episodes, statutsProduction, statutsMedia, { data: auth }] = await Promise.all([
    getPostProdEpisodes(show.id),
    valeursStatut(sb, "production_statut"),
    valeursStatut(sb, "media_statut"),
    sb.auth.getUser(),
  ]);
  const admin = await estAdmin(sb, auth.user?.id);

  const DEFAUT = ["à faire", "en cours", "à revoir", "en review", "validé"];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-blanc">Post-prod</h1>
        <p className="text-sm text-blanc-muted">
          Avancement script, montage et illustration par épisode. Une carte suit l&apos;étape la moins avancée des
          trois ; clique-la pour ouvrir sa fiche rédac.
        </p>
      </div>
      <PostProdBoard
        showSlug={show.slug}
        episodes={episodes}
        statutsProduction={statutsProduction.length ? statutsProduction : DEFAUT}
        statutsMedia={statutsMedia.length ? statutsMedia : DEFAUT}
        estAdmin={admin}
      />
    </div>
  );
}
