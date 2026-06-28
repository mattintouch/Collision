import { notFound } from "next/navigation";
import { getShow } from "@/lib/data";
import { CopilotPanel } from "@/components/CopilotPanel";

export default async function CopilotePage({
  params,
}: {
  params: { show: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();

  return (
    <div>
      <p className="label mb-1" style={{ color: "#FFD200" }}>Assistant</p>
      <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight">
        Copilote — {show.nom}
      </h1>
      <p className="mb-4 text-sm text-blanc-muted">
        Branché sur la base. Propose pour un créneau, suggère des appuis, rédige
        au style maison, respecte la discipline de relance.
      </p>
      <CopilotPanel showSlug={show.slug} typePipe={show.type_pipe} />
    </div>
  );
}
