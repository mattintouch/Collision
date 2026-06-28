import Link from "next/link";
import { notFound } from "next/navigation";
import { getShow, getStages, getEpisodesForShow, getShowStats, type EpisodeListItem } from "@/lib/data";
import { EpisodeReactivate } from "@/components/EpisodeReactivate";

function fmt(date: string | null) {
  if (!date) return null;
  return new Date(date).toLocaleString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function EpisodesPage({ params }: { params: { show: string } }) {
  const show = await getShow(params.show);
  if (!show) notFound();
  const [stages, episodes, stats] = await Promise.all([
    getStages(show.id),
    getEpisodesForShow(show.id),
    getShowStats(show.id),
  ]);

  // Première étape du pipe = cible de la réactivation (« seconde vie »).
  const firstStage = [...stages].sort((a, b) => a.position - b.position)[0];

  // Groupes ordonnés par position d'étape (Programmé → Enregistré → Publié…).
  const groups = new Map<string, { label: string; position: number; items: EpisodeListItem[] }>();
  for (const e of episodes) {
    const key = e.stage_key ?? "?";
    if (!groups.has(key)) groups.set(key, { label: e.stage_label ?? key, position: e.stage_position ?? 99, items: [] });
    groups.get(key)!.items.push(e);
  }
  const ordered = Array.from(groups.values()).sort((a, b) => a.position - b.position);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Épisodes — {show.nom}</h1>
        <p className="text-sm text-blanc-muted">
          {episodes.length} épisode{episodes.length > 1 ? "s" : ""} en production (programmés, enregistrés, publiés).
        </p>
      </div>

      {/* Repères : closing (conquête) vs production, séparés. */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <section className="card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="label">Closing (conquête)</h2>
            <span className="meta">
              {stats.closing.gagnees} gagnée{stats.closing.gagnees > 1 ? "s" : ""} / {stats.actives} actives
              {stats.closing.taux !== null && ` · ${stats.closing.taux}%`}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {stats.closing.stages.map((s) => (
              <span key={s.key} className="meta">
                {s.label} <span className="font-semibold text-blanc">{s.count}</span>
              </span>
            ))}
          </div>
        </section>
        <section className="card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="label">Production</h2>
            <span className="meta">{stats.production.total} en cours</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {stats.production.stages.length === 0 ? (
              <span className="meta">Aucune étape de production.</span>
            ) : (
              stats.production.stages.map((s) => (
                <span key={s.key} className="meta">
                  {s.label} <span className="font-semibold text-blanc">{s.count}</span>
                </span>
              ))
            )}
          </div>
          {stats.archivees > 0 && (
            <p className="meta mt-2">{stats.archivees} archivée{stats.archivees > 1 ? "s" : ""} (hors pipe)</p>
          )}
        </section>
      </div>

      {ordered.length === 0 ? (
        <p className="card p-6 text-center text-sm text-blanc-muted">
          Aucun épisode en production. Confirme une cible (→ épisode) ou passe-la en « enregistré ».
        </p>
      ) : (
        <div className="space-y-6">
          {ordered.map((g) => (
            <section key={g.label}>
              <h2 className="label mb-2">
                {g.label} · {g.items.length}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((e) => (
                  <div key={e.id} className="card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/${show.slug}/cible/${e.id}`} className="font-medium leading-tight hover:underline">
                        {e.nom}
                      </Link>
                      {firstStage && <EpisodeReactivate cibleId={e.id} showSlug={show.slug} targetStageId={firstStage.id} />}
                    </div>
                    <p className="mt-0.5 text-xs text-blanc-muted">
                      {[e.role, e.organisation, e.secteur, e.pays].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {(fmt(e.date_enregistrement) || e.lieu) && (
                      <p className="meta mt-2">
                        {fmt(e.date_enregistrement) ?? "date à définir"}
                        {e.lieu && ` · ${e.lieu}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
