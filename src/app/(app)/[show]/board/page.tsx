import { notFound } from "next/navigation";
import { getCibles, getShow, getStages, getWatchlists } from "@/lib/data";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { BoardDnd } from "@/components/BoardDnd";
import { NewTargetButton } from "@/components/NewTargetButton";

export default async function BoardPage({
  params,
}: {
  params: { show: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();

  const [stages, cibles, watchlists] = await Promise.all([
    getStages(show.id),
    getCibles(show.id),
    getWatchlists(),
  ]);

  // A3.3 : slug de fiche par cible, pour le lien direct depuis les cartes
  // « programmé ou au delà ». Pas de fiche : pas de bouton (jamais de lien mort).
  const { data: fiches } = await createServiceClient()
    .from("fiches")
    .select("cible_id, slug")
    .eq("show_id", show.id)
    .not("cible_id", "is", null);
  const ficheSlugs: Record<string, string> = {};
  for (const f of ((fiches ?? []) as { cible_id: string; slug: string }[])) ficheSlugs[f.cible_id] = f.slug;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {show.nom}
          </h1>
          <p className="text-sm text-blanc-muted">
            {cibles.length} cible{cibles.length > 1 ? "s" : ""} —{" "}
            {show.type_pipe === "invites"
              ? "par archétype, voie froide en tête"
              : "par étape, raison de sélection en avant"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/${show.slug}/import`} className="btn-ghost">
            Importer (Folk)
          </Link>
          <NewTargetButton show={show} />
        </div>
      </div>

      <BoardDnd show={show} stages={stages} cibles={cibles} watchlists={watchlists} ficheSlugs={ficheSlugs} />
    </div>
  );
}
