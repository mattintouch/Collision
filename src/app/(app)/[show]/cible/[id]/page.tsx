import Link from "next/link";
import { notFound } from "next/navigation";
import { getCibleDossier, getShow, getStages } from "@/lib/data";
import { fetchLatestFolkInteraction } from "@/lib/folk/client";
import {
  APPUI_LABELS,
  ARCHETYPE_HINTS,
  ARCHETYPE_LABELS,
  CONSEIL_LABELS,
  PRIORITE_LABELS,
  SIGNAL_LABELS,
  VOIE_LABELS,
  computeResurgence,
} from "@/lib/domain";
import { CaptureForm } from "@/components/CaptureForm";
import { FicheActions } from "@/components/FicheActions";
import { ContactsSection } from "@/components/ContactsSection";

function fmt(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function CiblePage({
  params,
}: {
  params: { show: string; id: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();

  const [{ cible, appuis, touches, signals, contacts }, stages] =
    await Promise.all([getCibleDossier(params.id), getStages(show.id)]);
  if (!cible) notFound();

  const isEntreprise = cible.kind === "entreprise";
  const r = computeResurgence(cible);
  const finalStage = stages.find((s) => s.is_final);
  const emails = contacts.filter((c) => c.kind === "email");
  const phones = contacts.filter((c) => c.kind === "telephone");
  // Folk = source de vérité : dernière interaction connue (si la fiche y est liée).
  const folkInteraction = cible.folk_id
    ? await fetchLatestFolkInteraction(cible.folk_id)
    : null;

  return (
    <div>
      <Link
        href={`/${show.slug}/board`}
        className="text-sm text-blanc-muted hover:text-blanc"
      >
        ← Board {show.nom}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {cible.nom}
          </h1>
          <p className="mt-1 text-sm text-blanc-muted">
            {isEntreprise
              ? [cible.secteur, cible.pays, cible.envergure === "international" ? "International" : "France"]
                  .filter(Boolean)
                  .join(" · ")
              : [cible.role, cible.organisation].filter(Boolean).join(" · ")}
          </p>
          {(emails.length > 0 || phones.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {emails.map((c) => (
                <a key={c.id} href={`mailto:${c.valeur}`} className="text-jaune hover:underline">
                  ✉ {c.valeur}
                </a>
              ))}
              {phones.map((c) => (
                <a key={c.id} href={`tel:${c.valeur}`} className="text-jaune hover:underline">
                  ☎ {c.valeur}
                </a>
              ))}
            </div>
          )}
          {folkInteraction && (
            <p className="mt-2 text-xs text-blanc-muted">
              Dernière interaction Folk : {fmt(folkInteraction.date)}
              {folkInteraction.channel && ` · ${folkInteraction.channel}`}
              {folkInteraction.summary && ` — ${folkInteraction.summary}`}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            {cible.stage_label && (
              <span className="chip border-noir-600 text-blanc-muted">{cible.stage_label}</span>
            )}
            <span className="chip border-noir-600 text-blanc-muted">
              Voie {VOIE_LABELS[cible.voie].toLowerCase()}
            </span>
            <span className="chip border-noir-600 text-blanc-muted">
              Priorité {PRIORITE_LABELS[cible.priorite].toLowerCase()}
            </span>
            {!isEntreprise && cible.archetype && (
              <span className="chip border-jaune/40 text-jaune">
                {ARCHETYPE_LABELS[cible.archetype]} — {ARCHETYPE_HINTS[cible.archetype]}
              </span>
            )}
          </div>
        </div>
        <FicheActions
          cibleId={cible.id}
          showSlug={show.slug}
          cibleNom={cible.nom}
          defaultEmails={contacts.filter((c) => c.kind === "email").map((c) => c.valeur)}
          stages={stages}
          currentStageId={cible.stage_id}
          finalLabel={finalStage?.label ?? "Validé"}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* Colonne principale : relance, journal, capture */}
        <div className="space-y-5 lg:col-span-2">
          {/* Relance avec raison (§13.6) */}
          <section className="card p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
              Relance
            </h2>
            {r.raison ? (
              <div className="mt-2">
                <p className="text-lg">
                  {r.conseil !== "relancer" && (
                    <span className="font-medium text-jaune">
                      {CONSEIL_LABELS[r.conseil]}.{" "}
                    </span>
                  )}
                  {r.raison}
                </p>
                <p className="mt-1 text-xs text-blanc-muted">
                  Discipline : une relance porte une raison, jamais un simple
                  rappel temporel.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-blanc-muted">
                Pas de raison fraîche de relancer. Attendre un signal ou passer
                par un appui.
              </p>
            )}
            <p className="mt-3 text-xs text-blanc-muted">
              Dernière touche : {fmt(cible.date_derniere_touche)}
              {cible.jours_depuis_touche !== null &&
                ` (il y a ${cible.jours_depuis_touche} j)`}
              {cible.canal_reel && ` · Canal : ${cible.canal_reel}`}
              {cible.via_qui && ` · Via : ${cible.via_qui}`}
            </p>
          </section>

          {/* Capture (§13.5) */}
          <section className="card p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
              Capturer une touche
            </h2>
            <p className="mb-3 mt-1 text-xs text-blanc-muted">
              Collez un message ou une capture. Enregistrer remet le compteur à
              zéro.
            </p>
            <CaptureForm cibleId={cible.id} showSlug={show.slug} />
          </section>

          {/* Journal (§13.5) */}
          <section className="card p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
              Journal ({touches.length})
            </h2>
            <div className="mt-3 space-y-3">
              {touches.length === 0 ? (
                <p className="text-sm text-blanc-muted">Aucune touche encore.</p>
              ) : (
                touches.map((t) => (
                  <div key={t.id} className="border-l-2 border-noir-600 pl-3">
                    <div className="flex items-center gap-2 text-xs text-blanc-muted">
                      <span>{fmt(t.date)}</span>
                      {t.canal && <span>· {t.canal}</span>}
                      {t.source === "capture" && (
                        <span className="chip border-jaune/40 text-jaune">capture</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm">{t.contenu}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Colonne latérale : appuis, signaux, recherche (Fleurons) */}
        <div className="space-y-5">
          {isEntreprise && (
            <section className="card p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
                Sélection & recherche
              </h2>
              <p className="mt-2 text-xs font-medium text-blanc-muted">Raison de sélection</p>
              <p className="text-sm">{cible.raison_de_selection ?? "—"}</p>
              <p className="mt-3 text-xs font-medium text-blanc-muted">État de la recherche</p>
              <p className="text-sm">{cible.etat_recherche ?? "—"}</p>
            </section>
          )}

          {/* Contacts — enrichissement (joindre les cibles difficiles) */}
          <ContactsSection
            cibleId={cible.id}
            showSlug={show.slug}
            contacts={contacts}
          />

          {/* Appuis (§13.4) */}
          <section className="card p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
              Appuis ({appuis.length})
            </h2>
            <div className="mt-3 space-y-3">
              {appuis.length === 0 ? (
                <p className="text-sm text-blanc-muted">
                  Aucun appui identifié pour ouvrir une porte.
                </p>
              ) : (
                appuis.map((a) => (
                  <div key={a.id}>
                    {a.ally_cible_id ? (
                      <Link
                        href={`/${show.slug}/cible/${a.ally_cible_id}`}
                        className="text-sm font-medium text-jaune hover:underline"
                      >
                        {a.nom} →
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">{a.nom}</p>
                    )}
                    <p className="text-xs text-blanc-muted">
                      {APPUI_LABELS[a.type]}
                      {a.organisation && ` · ${a.organisation}`}
                    </p>
                    {a.note && <p className="mt-0.5 text-xs text-blanc-muted">{a.note}</p>}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Signaux */}
          <section className="card p-5">
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
              Signaux ({signals.length})
            </h2>
            <div className="mt-3 space-y-3">
              {signals.length === 0 ? (
                <p className="text-sm text-blanc-muted">Aucun signal.</p>
              ) : (
                signals.map((s) => (
                  <div key={s.id}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{SIGNAL_LABELS[s.type]}</span>
                      <span className="text-xs text-blanc-muted">{fmt(s.date)}</span>
                    </div>
                    {s.resume && <p className="text-xs text-blanc-muted">{s.resume}</p>}
                  </div>
                ))
              )}
            </div>
          </section>

          {cible.sujets.length > 0 && (
            <section className="card p-5">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-blanc-muted">
                Sujets
              </h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {cible.sujets.map((s) => (
                  <span key={s} className="chip border-noir-600 text-blanc-muted">
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
