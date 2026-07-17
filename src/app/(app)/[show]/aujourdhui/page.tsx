import { notFound } from "next/navigation";
import { getCibles, getShow, getActiveSnoozes } from "@/lib/data";
import {
  computeCibleScore,
  computeResurgence,
  estivalActif,
  type ScoreInput,
} from "@/lib/domain";
import type { Playbook } from "@/lib/types";
import { computeEligibilite, evaluerCouverture } from "@/lib/editorial";
import { createServiceClient } from "@/lib/supabase/service";
import { DailyActionCard, type DailyAction } from "@/components/DailyActionCard";
import { kickQueue } from "@/lib/enrichment/jobs";

// La page draine la file (kickQueue/waitUntil) : la fonction doit vivre au-delà
// de la réponse pour finir les jobs. Plafond Hobby avec Fluid compute.
export const maxDuration = 300;

// Les cibles déjà « gagnées » (côté production) sortent de la session du jour.
const WON = new Set(["confirme", "programme", "enregistre", "publie", "produit"]);

export default async function AujourdhuiPage({
  params,
}: {
  params: { show: string };
}) {
  const show = await getShow(params.show);
  if (!show) notFound();
  const cibles = await getCibles(show.id);
  const snoozed = await getActiveSnoozes(cibles.map((c) => c.id));
  kickQueue(); // draine la file d'enrichissement en tâche de fond (plan Hobby)
  const estival = estivalActif();

  // Même logique que l'outil MCP `daily_five` : top par score, hors placeholders,
  // cibles gagnées et cibles reportées (snooze). Les 5 premières pour une session courte.
  const scored = cibles
    .map((c) => ({ c, s: computeCibleScore(c as unknown as ScoreInput, estival) }))
    .filter((x) => !x.s.placeholder && !(x.c.stage_key && WON.has(x.c.stage_key)) && !snoozed.has(x.c.id))
    .sort((a, b) => b.s.score - a.s.score)
    .slice(0, 5);

  // Besoins éditoriaux ouverts non couverts (chantier 4 §5.3) : alerte sur la
  // page existante, aucun nouvel écran (§5.4).
  const couverture = await evaluerCouverture(createServiceClient(), show.id, estival);
  const besoinsEnAlerte = couverture.filter((b) => b.alerte);

  const actions: DailyAction[] = scored.map(({ c, s }) => {
    // Indicateur d'éligibilité éditoriale (§5.1), distinct du score : badge
    // seulement, la cible reste dans la liste, la décision reste humaine.
    const elig = computeEligibilite(show.slug, c);
    const badges =
      elig.indicateur === "eligible"
        ? s.badges
        : [...s.badges, elig.indicateur === "hors_ligne" ? "hors ligne éditoriale" : "éligibilité à vérifier"];
    return {
    id: c.id,
    nom: c.nom,
    sous_titre:
      c.kind === "entreprise"
        ? c.raison_de_selection ?? ""
        : [c.role, c.organisation].filter(Boolean).join(" · "),
    score: s.score,
    badges,
    pourquoi: computeResurgence(c).raison,
    playbook: ((c as { playbook?: Playbook | null }).playbook ?? null) as Playbook | null,
    canal_reel: c.canal_reel,
    via_qui: c.via_qui,
    };
  });

  return (
    <div>
      <p className="label mb-1" style={{ color: "#FFD200" }}>Session du jour</p>
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        Aujourd&apos;hui
      </h1>
      <p className="mt-1 text-sm text-blanc-muted">
        Les cibles à travailler maintenant, classées par score. Chaque carte
        porte son pourquoi maintenant, son playbook et un brouillon — logge la
        touche en un geste, la cible sort de la liste.
      </p>

      {besoinsEnAlerte.length > 0 && (
        <div className="card mt-6 p-4" style={{ borderLeft: "3px solid #FFD200" }}>
          <p className="label" style={{ color: "#FFD200" }}>Besoins éditoriaux non couverts</p>
          <ul className="mt-2 space-y-1 text-sm">
            {besoinsEnAlerte.map((b) => (
              <li key={b.besoin.id}>
                {b.besoin.contrainte}
                {b.besoin.periode ? ` (${b.besoin.periode})` : ""} ·{" "}
                <span className="text-blanc-muted">
                  {b.candidates === null
                    ? "critères à évaluer à la main"
                    : `${b.candidates.length} cible(s) actionnable(s), il en faut 2`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {actions.length === 0 ? (
        <div className="card mt-6 p-6 text-center text-sm text-blanc-muted">
          Rien de prioritaire aujourd&apos;hui. Ajoute des cibles ou lance un
          enrichissement.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {actions.map((a) => (
            <DailyActionCard key={a.id} action={a} showSlug={show.slug} />
          ))}
        </div>
      )}
    </div>
  );
}
