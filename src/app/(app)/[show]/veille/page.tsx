import { notFound } from "next/navigation";
import { getShow } from "@/lib/data";
import { VeillePanel } from "@/components/VeillePanel";

export default async function VeillePage({
  params,
}: {
  params: { show: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Veille — {show.nom}
      </h1>
      <p className="mb-5 mt-1 text-sm text-blanc-muted">
        Actualité récente des cibles, filtrée, livrée en digest. Les signaux
        retenus alimentent la résurgence (le « pourquoi maintenant »). Rien sans
        raison fraîche.
      </p>
      <VeillePanel showSlug={show.slug} />
    </div>
  );
}
