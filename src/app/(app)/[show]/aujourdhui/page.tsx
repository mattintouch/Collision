import { notFound } from "next/navigation";
import { getCibles, getShow, getActiveSnoozes } from "@/lib/data";
import {
  computeCibleScore,
  computeResurgence,
  estivalActif,
  type ScoreInput,
} from "@/lib/domain";
import type { Playbook } from "@/lib/types";
import { DailyActionCard, type DailyAction } from "@/components/DailyActionCard";
import { kickQueue } from "@/lib/enrichment/jobs";

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

  const actions: DailyAction[] = scored.map(({ c, s }) => ({
    id: c.id,
    nom: c.nom,
    sous_titre:
      c.kind === "entreprise"
        ? c.raison_de_selection ?? ""
        : [c.role, c.organisation].filter(Boolean).join(" · "),
    score: s.score,
    badges: s.badges,
    pourquoi: computeResurgence(c).raison,
    playbook: ((c as { playbook?: Playbook | null }).playbook ?? null) as Playbook | null,
    canal_reel: c.canal_reel,
    via_qui: c.via_qui,
  }));

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
