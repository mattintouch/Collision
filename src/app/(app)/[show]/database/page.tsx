// Database : vue table, recherche + filtres, sur les cibles du show —
// même source de vérité que le Board (cibles_enrichies), présentée à plat.

import { notFound } from "next/navigation";
import { getCibles, getEpisodesPubliRefsForShow, getShow, getWatchlists } from "@/lib/data";
import { DatabaseTable } from "@/components/DatabaseTable";

export default async function DatabasePage({
  params,
}: {
  params: { show: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();

  const [cibles, watchlists, episodeRefs] = await Promise.all([
    getCibles(show.id),
    getWatchlists(),
    getEpisodesPubliRefsForShow(show.id),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-blanc">Database</h1>
        <p className="text-sm text-blanc-muted">
          {cibles.length} cible{cibles.length === 1 ? "" : "s"} · source de vérité unique.
        </p>
      </div>
      <DatabaseTable showSlug={show.slug} cibles={cibles} watchlists={watchlists} episodeRefs={episodeRefs} />
    </div>
  );
}
