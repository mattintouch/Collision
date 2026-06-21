import { notFound } from "next/navigation";
import { getCibles, getShow, getStages } from "@/lib/data";
import { Board } from "@/components/Board";
import { NewTargetButton } from "@/components/NewTargetButton";

export default async function BoardPage({
  params,
}: {
  params: { show: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();

  const [stages, cibles] = await Promise.all([
    getStages(show.id),
    getCibles(show.id),
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
        <NewTargetButton show={show} />
      </div>

      <Board show={show} stages={stages} cibles={cibles} />
    </div>
  );
}
