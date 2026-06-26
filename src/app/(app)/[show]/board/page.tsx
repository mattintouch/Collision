import { notFound } from "next/navigation";
import { getCibles, getShow, getStages, getWatchlists } from "@/lib/data";
import Link from "next/link";
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

      <BoardDnd show={show} stages={stages} cibles={cibles} watchlists={watchlists} />
    </div>
  );
}
