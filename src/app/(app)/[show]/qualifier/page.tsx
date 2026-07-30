// Chantier 3 (brief du 27/07) — la file de qualification. Le pipeline crée et
// enrichit mais ne qualifiait jamais : l'archétype restait vide, le tri par
// valeur (récap, scoring) n'avait rien à trier. Cette vue liste toute cible
// active sans archétype et la qualifie en deux gestes : assigner un archétype
// et une priorité, ou archiver. Objectif : un stock qui tend vers zéro.

import { notFound } from "next/navigation";
import { getCibles, getShow } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { valeursStatut } from "@/lib/episodes/publication";
import { QualifierQueue } from "@/components/QualifierQueue";

export default async function QualifierPage({
  params,
}: {
  params: { show: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();

  // getCibles exclut déjà les cibles de test (A6, défensif sur is_test).
  const cibles = await getCibles(show.id);
  const aQualifier = cibles.filter((c) => !c.archive && !c.archetype);
  // Genres depuis ref_statuts (repli sur les valeurs de Louis si table vide).
  const genresRef = await valeursStatut(createClient(), "genre");
  const genres = genresRef.length ? genresRef : ["homme", "femme", "autre"];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          À qualifier
        </h1>
        <p className="text-sm text-blanc-muted">
          {aQualifier.length === 0
            ? "File vide : toutes les cibles actives portent un archétype."
            : `${aQualifier.length} cible${aQualifier.length > 1 ? "s" : ""} sans archétype. Deux gestes par cible : qualifier (archétype et priorité) ou archiver. Une cible non qualifiée ne déclenche pas de génération de fiche.`}
        </p>
      </div>
      <QualifierQueue show={show} cibles={aQualifier} genres={genres} />
    </div>
  );
}
