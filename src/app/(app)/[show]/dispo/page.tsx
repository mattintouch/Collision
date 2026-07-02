import { redirect } from "next/navigation";

// S5 : « Dispo » est remplacé par « Aujourd'hui » (session du jour, une seule
// vue triée par score). On redirige pour ne pas casser les liens existants.
export default function DispoPage({ params }: { params: { show: string } }) {
  redirect(`/${params.show}/aujourdhui`);
}
