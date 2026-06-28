import Link from "next/link";
import { notFound } from "next/navigation";
import { getCibles, getShow } from "@/lib/data";
import {
  ARCHETYPE_LABELS,
  ARCHETYPE_ORDER,
  CONSEIL_LABELS,
  VOIE_LABELS,
  computeResurgence,
} from "@/lib/domain";
import type { CibleEnrichie } from "@/lib/types";

function Row({ cible, slug }: { cible: CibleEnrichie; slug: string }) {
  const r = computeResurgence(cible);
  return (
    <Link
      href={`/${slug}/cible/${cible.id}`}
      className="flex items-center justify-between gap-4 border-b border-noir-600 py-3 last:border-0 hover:bg-noir-800"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{cible.nom}</p>
        <p className="truncate text-xs text-blanc-muted">
          {cible.kind === "entreprise"
            ? cible.raison_de_selection
            : [cible.role, cible.organisation].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {r.raison ? (
          <p className={cible.signal_frais ? "text-sm text-jaune" : "text-sm"}>
            {r.conseil !== "relancer" && (
              <span className="font-medium">{CONSEIL_LABELS[r.conseil]} — </span>
            )}
            {r.raison}
          </p>
        ) : (
          <p className="text-sm text-blanc-muted">Pas de raison fraîche</p>
        )}
        <p className="text-xs text-blanc-muted">
          Voie {VOIE_LABELS[cible.voie].toLowerCase()}
        </p>
      </div>
    </Link>
  );
}

export default async function DispoPage({
  params,
}: {
  params: { show: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();
  const cibles = await getCibles(show.id);

  // Tri : voie froide devant, puis score de résurgence (§6).
  const ranked = [...cibles].sort((a, b) => {
    if (a.voie !== b.voie) return a.voie === "froid" ? -1 : 1;
    return computeResurgence(b).score - computeResurgence(a).score;
  });

  return (
    <div>
      <p className="label mb-1" style={{ color: "#FFD200" }}>Programmation</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Un créneau à remplir ?
      </h1>
      <p className="mt-1 text-sm text-blanc-muted">
        {show.type_pipe === "invites"
          ? "Qui engager, classé par archétype, chaque proposition avec son pourquoi maintenant."
          : "Quoi engager, classé par raison de sélection, avec le pourquoi maintenant."}
        {" "}La voie froide passe devant ; aucune relance sans raison.
      </p>

      <div className="mt-6 space-y-6">
        {show.type_pipe === "invites" ? (
          ARCHETYPE_ORDER.map((arch) => {
            const list = ranked.filter((c) => c.archetype === arch);
            if (list.length === 0) return null;
            return (
              <section key={arch} className="card p-5">
                <h2 className="mb-1 font-display text-sm font-semibold uppercase tracking-wide text-jaune">
                  {ARCHETYPE_LABELS[arch]}
                </h2>
                {list.map((c) => (
                  <Row key={c.id} cible={c} slug={show.slug} />
                ))}
              </section>
            );
          })
        ) : (
          <section className="card p-5">
            {ranked.map((c) => (
              <Row key={c.id} cible={c} slug={show.slug} />
            ))}
          </section>
        )}
      </div>

      <p className="mt-6 text-xs text-blanc-muted">
        Étape suivante (copilote, §8) : poser la question en langage naturel,
        suggestion d&apos;appuis et rédaction au style maison, branchés via MCP
        et Google Calendar.
      </p>
    </div>
  );
}
