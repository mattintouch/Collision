// Section « Questions clips » (questions_reseaux). Objectif produit (Matt) : faire
// de l'audience en isolant des extraits. En tournage, sur un moment de mou ou pour
// relancer, l'hôte dégaine une question clickbait dont la réponse courte et frappante
// devient un clip vertical. Vadim les PROPOSE, l'équipe les CHALLENGE.
//
// Ressorts qui performent : argent (tabou), échec / point de rupture, contre-pied
// (opinion tranchée), confession / coulisses. Le clickbait tient à trois leviers :
// un écart d'information, une charge émotionnelle, une réponse exploitable en clip.
// Style maison : tutoiement, pas d'emoji, sujet-verbe-complément, pas de tiret cadratin.

import { hasAnthropicKey } from "../copilot/config";
import { runWebSearchJSON } from "../ai/websearch";

export type QuestionRessort = "argent" | "echec" | "contre_pied" | "confession";

export interface QuestionClip {
  question: string;    // formulée en tutoiement, courte, directe
  ressort: QuestionRessort;
  clip: string;        // réaction / payoff visé pour le clip
}

export interface GuestContext {
  nom: string;
  role?: string | null;
  organisation?: string | null;
  secteur?: string | null;
  resume?: string | null;
  sujets?: string[] | null;
}

const RESSORTS = new Set<QuestionRessort>(["argent", "echec", "contre_pied", "confession"]);
function coerceRessort(r: unknown): QuestionRessort {
  return RESSORTS.has(r as QuestionRessort) ? (r as QuestionRessort) : "confession";
}

const SYSTEM = [
  "Tu proposes des questions « clips » pour Génération Do It Yourself (GDIY), podcast d'entrepreneurs de Collision Productions.",
  "But : en plein enregistrement, sur un moment de mou ou pour relancer, l'hôte dégaine une de ces questions. La réponse doit être courte, franche, et devenir un short viral pour les réseaux.",
  "Doctrine de ton (impérative) : les clips portent l'ÉMOTION et la SURPRISE, jamais la démonstration. Fun, surprenant, humain, immédiatement partageable : le décalage, l'aveu, le contre-pied, la question enfantine sur un sujet sérieux. Le fond dense vit ailleurs (les 10 questions), la légèreté vit ici.",
  "Chaque question exploite un ressort qui performe : argent (le tabou), échec ou point de rupture, contre-pied (opinion tranchée), confession ou coulisses.",
  "Le clickbait tient à trois leviers : un écart d'information, une charge émotionnelle, une réponse exploitable en clip vertical.",
  "Calibre les questions sur l'invité (son parcours, son secteur, ses zones sensibles). Évite le générique quand un angle propre à l'invité existe.",
  "Style impératif : tutoiement, phrases nettes, sujet-verbe-complément, pas d'emoji, pas de tiret cadratin, pas de superlatif. Question courte, une seule idée.",
  "N'invente pas de faits sur l'invité. La question peut être frontale sans affirmer de fait non vérifié.",
  "Réponds UNIQUEMENT en JSON : un tableau d'objets { question, ressort, clip }.",
  "ressort ∈ {argent, echec, contre_pied, confession}. clip = la réaction ou le payoff visé, en une phrase.",
].join("\n");

function guestLine(g: GuestContext): string {
  const bits = [
    g.role ? g.role : null,
    g.organisation ? `chez ${g.organisation}` : null,
    g.secteur ? `secteur ${g.secteur}` : null,
  ].filter(Boolean).join(", ");
  const sujets = g.sujets?.length ? ` Sujets pressentis : ${g.sujets.join(", ")}.` : "";
  const resume = g.resume ? ` Résumé : ${g.resume}` : "";
  return `Invité : ${g.nom}${bits ? ` (${bits})` : ""}.${sujets}${resume}`;
}

/** Jeu générique par ressort, servant de repli hors mode réel (sans clé Anthropic). */
function demoQuestions(g: GuestContext): QuestionClip[] {
  const q = (question: string, ressort: QuestionRessort, clip: string): QuestionClip => ({ question, ressort, clip });
  return [
    q("Combien tu gagnes vraiment aujourd'hui ?", "argent", "Le chiffre lâché crée l'extrait le plus partagé."),
    q("Combien tu as brûlé avant de trouver le bon modèle ?", "argent", "L'ampleur de la perte accroche."),
    q("Le jour où tu as failli tout arrêter, il s'est passé quoi ?", "echec", "Le récit de rupture porte l'émotion."),
    q("Ta plus grosse erreur de recrutement, tu l'as vue venir ?", "echec", "L'aveu d'un angle mort humanise."),
    q("Quel conseil de gourou du business tu trouves complètement faux ?", "contre_pied", "L'opinion tranchée déclenche le débat en commentaires."),
    q("Qu'est-ce que personne ne comprend dans ton métier ?", "contre_pied", "Le contre-pied installe l'expertise."),
    q("Ton associé et toi, vous vous êtes disputés sur quoi ?", "confession", "La coulisse crée la proximité."),
    q("Si tu devais tout refaire, tu ne referais pas quoi ?", "confession", "Le regret assumé retient l'attention."),
  ];
}

async function generateWeb(g: GuestContext, count: number): Promise<QuestionClip[]> {
  const prompt = `${guestLine(g)}\n\nPropose ${count} questions « clips » calibrées sur cet invité, réparties entre les quatre ressorts. JSON uniquement.`;
  const raw = await runWebSearchJSON<Array<{ question?: string; ressort?: string; clip?: string }>>(SYSTEM, prompt, 4);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r.question && String(r.question).trim())
    .slice(0, count)
    .map((r) => ({
      question: String(r.question).trim().slice(0, 300),
      ressort: coerceRessort(r.ressort),
      clip: r.clip ? String(r.clip).trim().slice(0, 300) : "",
    }));
}

/** Propose des questions clips calibrées sur l'invité. Repli démo sans clé. */
export async function suggestQuestionsReseaux(
  g: GuestContext,
  count = 8
): Promise<{ questions: QuestionClip[]; demo: boolean }> {
  const n = Math.min(Math.max(count, 3), 12);
  if (!hasAnthropicKey()) return { questions: demoQuestions(g).slice(0, n), demo: true };
  const questions = await generateWeb(g, n);
  // Repli si la recherche revient vide (délai, JSON illisible) : ne jamais renvoyer 0.
  return questions.length ? { questions, demo: false } : { questions: demoQuestions(g).slice(0, n), demo: true };
}
