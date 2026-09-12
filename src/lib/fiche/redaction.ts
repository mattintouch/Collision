// Contrat v3, règle 4 — la passe 5, le rédacteur en chef (la vraie brique).
//
// Exécutée APRÈS les quatre groupes de recherche et la synthèse (job
// "fiche:redaction", mis en file en dernier et différé tant que des groupes
// restent à traiter), elle lit la fiche ENTIÈRE assemblée et applique, sans
// recherche web (toute la matière est déjà dans la fiche) :
//   1. Déduplication : un fait vit dans sa section propriétaire, les reprises
//      deviennent des renvois courts ou disparaissent.
//   2. Réconciliation des chiffres : une valeur unique et sourcée par fait ;
//      une incohérence non tranchée bascule en zone grise avec la consigne de
//      ne pas citer un chiffre unique à l'antenne.
//   3. Budgets de longueur (règle 2) et format scannable du Bloc B (règle 3).
//   4. Rapport : déduplications faites, chiffres réconciliés, sections
//      réduites, items restés hors budget.
//
// SCISSION (12/09, cas eric-schmidt : trois « timeout (> 15 min) » de suite).
// La passe était UN appel modèle à 16 384 tokens de sortie, écrit à la fin :
// tuée en vol par la fin de fonction, elle perdait tout, et seul un cron pris
// en début de budget pouvait la finir. Désormais, comme le deroule :
//   appel 1 (PLAN) : chiffres réconciliés, graphies unifiées, décisions de
//     dédoublonnage (fait, section propriétaire, où retirer) et consignes par
//     section, sortie courte, mémorisé dans system_state ;
//   appels 2..N : UNE section par appel (data, revue_de_presse, personnel,
//     apprentissages, topics, titres, puis le tldr en synthèse finale), le
//     plan en consigne, écriture dès réception, heartbeat entre les appels.
// Reprise : un marqueur system_state porte le plan et les sections faites ;
// une passe tuée ou suspendue reprend là où elle en était (3 h de validité,
// levé au succès d'un groupe de recherche : la matière a changé). Sous la
// réserve murale entre deux appels, la passe se SUSPEND proprement : le job
// retourne en file, ni échec ni alerte, le drain suivant continue.
//
// Garde-fous code (défense en profondeur, indépendants du modèle) : seules les
// sections rédactibles sont écrites, une section ne peut pas être vidée par la
// passe, les comptes sont re-clampés, l'écriture reste versionnée (rollback).

import Anthropic from "@anthropic-ai/sdk";
import { extractJson, type WebSearchUsage } from "../ai/websearch";
import { blocLangue, langueDeFiche, renumeroteQuestions } from "./generation";
import { hasAnthropicKey } from "../copilot/config";
import { isEmptyContent, BUDGETS_V3 } from "./schema";
import { lintFiche, doublonsQuestions, type LintRapport } from "./lint";
import { writeSection, type FicheRow } from "./store";
import type { createServiceClient } from "../supabase/service";
import type { CibleEnrichie } from "../types";

type SB = ReturnType<typeof createServiceClient>;
type Content = Record<string, unknown>;

const REDACTION_AUTHOR = "vadim (rédaction)";

/** Modèle de la passe de rédaction : consolidation de fond, sans recherche
 *  web. Recalibrable par l'env (décision Haiku/Sonnet sur données, §4.4). */
const REDACTION_MODEL = () => process.env.REDACTION_MODEL ?? "claude-sonnet-4-6";

/** Budget mural MINIMAL pour qu'un drain revendique une passe de rédaction
 *  (scission du 12/09). La passe n'est plus un appel de 16 384 tokens : un
 *  drain n'a besoin que du budget d'un appel de section, il avance d'autant
 *  d'étapes qu'il peut puis SUSPEND proprement (le job retourne en file, le
 *  drain suivant reprend). Un kickQueue (240 s) peut donc démarrer le plan et
 *  une ou deux sections au lieu d'attendre le cron. Doit rester STRICTEMENT
 *  supérieur à REDACTION_APPEL_RESERVE_MS : un job suspendu pour manque de
 *  budget n'est pas revendiqué à nouveau par le même drain. */
export const REDACTION_RESERVE_MS = 200_000;

/** Réserve murale AVANT CHAQUE appel de la passe scindée : un appel de section
 *  (plafond 12 000 tokens au plus, sans recherche) tient en quelques minutes.
 *  Sous cette réserve, la passe se suspend, l'acquis est déjà écrit. */
export const REDACTION_APPEL_RESERVE_MS = 150_000;

/** Validité du marqueur de reprise : au-delà, la passe repart d'un plan neuf
 *  (la matière a pu bouger, le plan mémorisé ne la décrit plus). */
export const REDACTION_REPRISE_MAX_MS = 3 * 3600_000;

/** Un drain peut-il revendiquer une passe de rédaction avec ce reste de
 *  budget mural ? (PURE, testée.) */
export function redactionAdmissible(resteMs: number): boolean {
  return resteMs >= REDACTION_RESERVE_MS;
}

/** Clé system_state du marqueur de reprise d'une fiche. */
export function cleRedactionEnCours(ficheId: string): string {
  return `redaction_en_cours:${ficheId}`;
}

/** Sections que la passe a le droit de réécrire (contrat v3.1). Hors
 *  périmètre : la checklist, le footer, les clips (challengés par l'équipe,
 *  lus en contexte pour le contrôle des doublons) et les sources (liste de
 *  liens vérifiés). L'identité et le bandeau sont admis mais SEULS leurs
 *  champs de titre sont modifiables (cf. CHAMPS_TITRE) : jamais le numéro,
 *  les pilules, les liens, la date de naissance, les accompagnants ni la
 *  mise en relation (saisis à la main). */
export const SECTIONS_REDACTIBLES = [
  "tldr", "data", "apprentissages", "topics", "personnel", "revue_de_presse",
  "identite", "sticky_header",
] as const;

/** Sur les sections de titre, la passe ne peut corriger QUE ces champs
 *  (cohérence titres contre corps), le reste est préservé tel quel. */
export const CHAMPS_TITRE: Record<string, readonly string[]> = {
  identite: ["sous_titre", "societe"],
  sticky_header: ["societe"],
};

/** Étapes de la passe scindée, dans l'ordre d'exécution : les sections de
 *  faits d'abord (data est propriétaire des chiffres), les questions ensuite
 *  (apprentissages puis topics, pour que le contrôle des doublons voie les
 *  apprentissages consolidés), les titres contre le corps consolidé, le tldr
 *  en DERNIER (c'est une synthèse de la fiche consolidée). */
export const ORDRE_REDACTION = ["data", "revue_de_presse", "personnel", "apprentissages", "topics", "titres", "tldr"] as const;
export type EtapeRedaction = (typeof ORDRE_REDACTION)[number];

/** Plafonds de sortie par étape : aucun appel ne peut structurellement
 *  dépasser son budget. topics est le plus gros (jusqu'à 8 briques) mais ne
 *  renvoie QUE les briques modifiées, indexées. */
export const PLAFONDS_REDACTION: Record<EtapeRedaction, number> = {
  data: 6000,
  revue_de_presse: 6000,
  personnel: 6000,
  apprentissages: 4000,
  topics: 12000,
  titres: 800,
  tldr: 2500,
};
export const PLAN_MAX_TOKENS = 4000;

/** Sections lues pour une étape (celles que l'étape peut écrire). */
const SECTIONS_PAR_ETAPE: Record<EtapeRedaction, readonly string[]> = {
  data: ["data"],
  revue_de_presse: ["revue_de_presse"],
  personnel: ["personnel"],
  apprentissages: ["apprentissages"],
  topics: ["topics"],
  titres: ["identite", "sticky_header"],
  tldr: ["tldr"],
};

/** Étapes à jouer sur une fiche (PURE, testée) : une étape n'a de sens que si
 *  au moins une de ses sections a du contenu, SAUF le tldr, écrit ou réécrit
 *  dès que la fiche a de la matière (une synthèse tombée en échec laisse un
 *  tldr vide que la rédaction pose). */
export function etapesRedaction(actuel: Record<string, Content>): EtapeRedaction[] {
  const presentes = new Set(Object.keys(actuel).filter((id) => !isEmptyContent(actuel[id] ?? {})));
  if (!presentes.size) return [];
  return ORDRE_REDACTION.filter((etape) => etape === "tldr" || SECTIONS_PAR_ETAPE[etape].some((id) => presentes.has(id)));
}

/* ───────────────────────── plan de consolidation ───────────────────────── */

export interface PlanRedaction {
  chiffres_reconcilies: { fait: string; valeur_retenue: string; source?: string; valeurs_ecartees?: string[] }[];
  noms_unifies: { retenu: string; ecartes: string[] }[];
  /** Décisions de propriété : le fait, sa section propriétaire, où le retirer. */
  dedoublonnages: { fait: string; proprietaire: string; retirer_de: string[] }[];
  /** Consignes libres par section (ce que l'étape doit faire en particulier). */
  consignes: Record<string, string[]>;
}

const asStr = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const asStrList = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, max) : [];

/** Lecture défensive du plan renvoyé par le modèle (PURE, testée) : champs
 *  typés, comptes bornés, jamais d'exception sur une sortie approximative. */
export function planDepuisJson(raw: unknown): PlanRedaction {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Content;
  const chiffres = Array.isArray(r.chiffres_reconcilies)
    ? (r.chiffres_reconcilies as unknown[]).flatMap((x) => {
        if (!x || typeof x !== "object") return [];
        const c = x as Content;
        const fait = asStr(c.fait); const valeur = asStr(c.valeur_retenue);
        if (!fait || !valeur) return [];
        return [{ fait, valeur_retenue: valeur, ...(asStr(c.source) ? { source: asStr(c.source) } : {}), ...(asStrList(c.valeurs_ecartees, 6).length ? { valeurs_ecartees: asStrList(c.valeurs_ecartees, 6) } : {}) }];
      }).slice(0, 30)
    : [];
  const noms = Array.isArray(r.noms_unifies)
    ? (r.noms_unifies as unknown[]).flatMap((x) => {
        if (!x || typeof x !== "object") return [];
        const n = x as Content;
        const retenu = asStr(n.retenu);
        return retenu ? [{ retenu, ecartes: asStrList(n.ecartes, 6) }] : [];
      }).slice(0, 20)
    : [];
  const dedoublonnages = Array.isArray(r.dedoublonnages)
    ? (r.dedoublonnages as unknown[]).flatMap((x) => {
        if (!x || typeof x !== "object") return [];
        const d = x as Content;
        const fait = asStr(d.fait); const proprietaire = asStr(d.proprietaire);
        return fait && proprietaire ? [{ fait, proprietaire, retirer_de: asStrList(d.retirer_de, 8) }] : [];
      }).slice(0, 40)
    : [];
  const consignes: Record<string, string[]> = {};
  if (r.consignes && typeof r.consignes === "object" && !Array.isArray(r.consignes)) {
    for (const [section, liste] of Object.entries(r.consignes as Content)) {
      const l = asStrList(liste, 12);
      if (l.length) consignes[section] = l;
    }
  }
  return { chiffres_reconcilies: chiffres, noms_unifies: noms, dedoublonnages, consignes };
}

/** Bloc de prompt du plan (PURE) : les décisions deviennent des consignes
 *  IMPÉRATIVES pour chaque appel de section. */
export function blocPlan(plan: PlanRedaction, etape: EtapeRedaction): string {
  const morceaux: string[] = ["PLAN DE CONSOLIDATION (décidé pour toute la fiche, à appliquer tel quel, sans le rediscuter) :"];
  if (plan.chiffres_reconcilies.length) {
    morceaux.push(`Chiffres retenus (une valeur unique partout) :\n${plan.chiffres_reconcilies.map((c) => `- ${c.fait} : ${c.valeur_retenue}${c.source ? ` (${c.source})` : ""}${c.valeurs_ecartees?.length ? ` ; écartées : ${c.valeurs_ecartees.join(", ")}` : ""}`).join("\n")}`);
  }
  if (plan.noms_unifies.length) {
    morceaux.push(`Graphies retenues :\n${plan.noms_unifies.map((n) => `- ${n.retenu}${n.ecartes.length ? ` (au lieu de ${n.ecartes.join(", ")})` : ""}`).join("\n")}`);
  }
  if (plan.dedoublonnages.length) {
    morceaux.push(`Propriété des faits (garder dans la section propriétaire, ailleurs renvoi court ou retrait) :\n${plan.dedoublonnages.map((d) => `- ${d.fait} : propriétaire ${d.proprietaire}${d.retirer_de.length ? ` ; retirer de ${d.retirer_de.join(", ")}` : ""}`).join("\n")}`);
  }
  const propres = SECTIONS_PAR_ETAPE[etape].flatMap((id) => plan.consignes[id] ?? []);
  if (propres.length) morceaux.push(`Consignes pour cette étape :\n${propres.map((c) => `- ${c}`).join("\n")}`);
  return morceaux.length > 1 ? morceaux.join("\n") : "";
}

/* ───────────────────────── marqueur de reprise ───────────────────────── */

export interface MarqueurRedaction {
  plan: PlanRedaction;
  faites: EtapeRedaction[];
  rapport: Partial<RapportRedaction>;
  started_at: string;
}

/** Une reprise est-elle possible depuis ce marqueur ? (PURE, testée.) Le
 *  marqueur doit porter un plan et rester dans la fenêtre de validité. */
export function reprisePossible(marqueur: unknown, nowMs: number = Date.now()): marqueur is MarqueurRedaction {
  if (!marqueur || typeof marqueur !== "object") return false;
  const m = marqueur as Partial<MarqueurRedaction>;
  if (!m.plan || typeof m.plan !== "object" || !Array.isArray(m.faites)) return false;
  const debut = typeof m.started_at === "string" ? new Date(m.started_at).getTime() : NaN;
  if (!Number.isFinite(debut)) return false;
  return nowMs - debut >= 0 && nowMs - debut < REDACTION_REPRISE_MAX_MS;
}

/** Étapes restantes d'une passe (PURE, testée) : l'ordre d'exécution moins
 *  les étapes déjà faites. */
export function etapesRestantes(etapes: EtapeRedaction[], faites: readonly string[]): EtapeRedaction[] {
  const done = new Set(faites);
  return etapes.filter((e) => !done.has(e));
}

/* ───────────────────────── rapport ───────────────────────── */

export interface RapportRedaction {
  dedoublonnages: string[];
  chiffres_reconcilies: { fait: string; valeur_retenue: string; source?: string; valeurs_ecartees?: string[] }[];
  sections_reduites: { section: string; avant: string; apres: string }[];
  hors_budget_residuel: string[];
  /** v3.1 : titres alignés sur le corps et graphies de noms propres unifiées. */
  titres_corriges: string[];
  noms_unifies: { retenu: string; ecartes: string[] }[];
  /** Chantier 1 du 27/07 : fuites de balisage résiduel nettoyées. */
  balisage_nettoye?: string[];
  /** Correctif anti-répétition (règle 3) : méta narratif retiré du contenu. */
  meta_narratif_nettoye?: string[];
  /** Correctif du 04/08 (backlog 64595940) : questions en double retirées par
   *  le garde-fou code APRÈS la passe, sans remplacement (fin du jeu de
   *  taupes apprentissages contre topics). */
  questions_resorbees?: string[];
  /** Correctif du 04/08 (backlog 4be50ce8) : TL;DR encore hors budget après
   *  la passe, réécrit par un appel court dédié. Mesures avant et après
   *  (longueur JSON des items, la même que le lint). */
  tldr_reecrit?: { avant: number; apres: number };
  /** Règle 5 : verdict du lint APRÈS la passe (doublons, chiffres répétés et
   *  questions en double résiduels = bloquants restants ; zéro attendu sur une
   *  fiche fraîche). */
  lint_residuel?: Pick<LintRapport, "doublons" | "chiffres_repetes" | "meta_narratif" | "questions_doublons" | "bloquants">;
  /** Scission du 12/09 : étapes jouées par cette passe (reprise comprise). */
  etapes?: string[];
}

/** Cible du lint injectée dans le prompt de la passe (règle 5) : les doublons
 *  détectés deviennent des consignes explicites de résorption. */
export function consignesLint(lint: LintRapport): string {
  const morceaux: string[] = [];
  if (lint.doublons.length) {
    morceaux.push(`DOUBLONS DÉTECTÉS PAR LE LINT (séquences recopiées entre sections), à résorber : garder dans la section propriétaire, remplacer ailleurs par un renvoi court ou un pointeur ZG :\n${lint.doublons
      .slice(0, 15)
      .map((d) => `- « ${d.extrait.slice(0, 90)}... » présent dans : ${d.sections.join(", ")}${d.proprietaire ? ` (propriétaire : ${d.proprietaire})` : ""}`)
      .join("\n")}`);
  }
  if (lint.chiffres_repetes.length) {
    morceaux.push(`CHIFFRES RÉPÉTÉS HORS SECTION CHIFFRES (au delà de 2 occurrences = bloquant) :\n${lint.chiffres_repetes
      .slice(0, 15)
      .map((c) => `- ${c.valeur} : ${c.occurrences} occurrences (${c.sections.join(", ")})`)
      .join("\n")}`);
  }
  if (lint.meta_narratif.length) {
    morceaux.push(`MÉTA NARRATIF À RETIRER :\n${lint.meta_narratif.slice(0, 10).map((m) => `- ${m.section} : « ${m.extrait} »`).join("\n")}`);
  }
  if (lint.questions_doublons.length) {
    morceaux.push(`QUESTIONS EN DOUBLE (une question ne vit qu'à UN endroit ; garder la version la mieux placée, retirer les autres de topics ou d'apprentissages, JAMAIS des clips qui ne sont pas modifiables ; ne PAS remplacer la question retirée, le retrait suffit) :\n${lint.questions_doublons
      .slice(0, 10)
      .map((q) => `- « ${q.question.slice(0, 90)} » présente dans : ${q.endroits.join(", ")}`)
      .join("\n")}`);
  }
  if (lint.hors_budget.length) {
    morceaux.push(`HORS BUDGET (à réécrire sous le budget, pas à tronquer bêtement) :\n${lint.hors_budget.slice(0, 15).map((h) => `- ${h}`).join("\n")}`);
  }
  return morceaux.length ? `\n\n${morceaux.join("\n\n")}` : "";
}

/* ───────────────────────── prompts ───────────────────────── */

/** Règles du rédacteur en chef : constantes sur tous les appels de la passe
 *  (plan puis sections), donc mises en cache par l'API. Le format de sortie
 *  de chaque appel est décrit dans le message, pas ici. */
const SYSTEM = [
  "Tu es le RÉDACTEUR EN CHEF des fiches de préparation GDIY (Collision Productions). Quatre rédacteurs exhaustifs ont écrit la fiche en parallèle : ton travail est la passe de consolidation que personne n'a faite. Tu reçois la fiche entière en JSON et tu travailles par ÉTAPES : d'abord un PLAN DE CONSOLIDATION pour toute la fiche, puis UNE section par appel, en appliquant le plan à la lettre.",
  "Objectif : à information constante, réduire le volume de 40 à 50 pour cent, rendre la fiche scannable en fragments pendant l'enregistrement, supprimer toute contradiction chiffrée. Aucune perte de fait vérifié : tu condenses et tu déplaces, tu n'inventes rien et tu ne supprimes un fait que s'il est répété ailleurs.",
  [
    "RÈGLE 1, propriété unique des faits (contrat v3.1) :",
    "- Palmarès et jalons datés (titres, exits, récompenses, records) : propriété de revue_de_presse.palmares. Toute frise ou liste de jalons datés ailleurs est à supprimer ou à réduire en renvoi court.",
    "- Données chiffrées sourcées : propriété de data. Ailleurs, UN chiffre inline maximum si le propos l'exige, sans re-citer la source. Au delà de 2 occurrences d'une même valeur hors data, c'est un défaut à résorber. Un KPI non confirmé porte un pointeur zg, JAMAIS de chiffre orphelin.",
    "- Statuts de vérification et chiffres non tranchés : propriété de personnel.zone_grise (identifiants stables zg_motcle). Ailleurs, un POINTEUR court « ZG: <mot-clé> » (90 caractères max), JAMAIS le texte complet recopié.",
    "- Cadrage d'attaque : propriété du tldr ; aucune autre section ne re-justifie le fil rouge. Personnes de l'écosystème : propriété de personnel.entourage ; une question cite un nom, pas la bio.",
    "- data.marche : le marché en UN paragraphe plus une ligne par comparable. Retire toute biographie. Les graphiques (barres, comparaison) restent tels quels, 2 maximum.",
    "- apprentissages : des SYSTÈMES et des DÉCISIONS, pas un récit biographique. Test de qualité : la réponse change la façon de travailler d'un auditeur dès lundi matin.",
    "- Un fait n'apparaît qu'UNE fois en version longue dans toute la fiche. Les reprises deviennent un renvoi court ou disparaissent.",
  ].join("\n"),
  [
    "RÈGLE 2, budgets durs (imposés aussi par le serveur au stockage, avec troncature) : tldr = 1200 caractères au TOTAL, neuf labels ; intention de topic = 200 caractères ; note tactique = 200 ; apport d'une lecture = 120 ; data.marche.texte = UN paragraphe de 900 ; zone grise = 12 items de 400 ; 16 KPI ; 5 à 8 apprentissages, champs connu/manque/question en 2 lignes chacun ; à lire = 3 à 5 entrées justifiées. AUCUN plafond sur le NOMBRE de questions : tu n'en retires jamais une pour un quota, uniquement pour un doublon ou une faiblesse.",
    "RÈGLE 3, format scannable : la console (data, apprentissages, clips, topics, personnel) est lue en studio. AUCUN item de plus de 3 lignes (environ 240 caractères) : découpe ou raccourcis.",
  ].join("\n"),
  [
    "RÈGLE DES CHIFFRES : construis mentalement la liste des valeurs chiffrées de la fiche. Pour chaque fait cité avec des valeurs divergentes, impose UNE valeur avec sa source (la mieux sourcée), partout. Si tu ne peux pas trancher, retire les valeurs divergentes des sections et ajoute un item en zone_grise : « {fait} : valeurs divergentes ({valeurs}), ne pas citer un chiffre unique à l'antenne », origine « rédaction (chiffre non tranché) ».",
    "zone_grise : conserve les items existants, ajoute les tiens.",
  ].join("\n"),
  [
    "CONTRÔLE DES TITRES : vérifie les champs de titre (sticky_header.societe, identite.sous_titre, identite.societe) contre les faits consolidés du corps. Toute divergence numérique ou qualificatif contredit par le corps (exemple : « Septuple champion » dans le sous-titre quand le corps établit 8 titres) se corrige SUR LE CHAMP DE TITRE, aligné sur la valeur retenue dans le corps. Le sous-titre garde sa forme v3.1 : une phrase de fait d'armes vérifiable, une phrase de thèse en « le comment de ». Tu ne peux modifier QUE sous_titre et societe : jamais le numéro, les titre_lignes, les pilules, les liens, la date de naissance, les accompagnants ni la mise en relation.",
    "CONTRÔLE DES NOMS PROPRES : construis la liste des personnes et entités citées dans TOUTE la fiche, détecte les variantes orthographiques proches d'un même référent (exemple : Yacine Berrabah contre Yannick Berrabah), impose UNE graphie unique partout, celle des sources les plus fiables. Si le doute n'est pas tranchable, garde la graphie majoritaire et ajoute un item dans personnel.zone_grise « orthographe à vérifier : {variante A} ou {variante B} », origine « rédaction (nom à vérifier) ».",
    "CONTRÔLE DU BALISAGE : toute fuite de balisage technique dans un texte (balise <cite ...>, fragment index=\"...\", chevrons < > orphelins, HTML ou XML résiduel) est un DÉFAUT à corriger : retire le balisage en conservant le texte intérieur, et signale chaque nettoyage dans le rapport (balisage_nettoye). Le texte destiné au lecteur ne contient jamais de balise.",
    "CONTRÔLE DU MÉTA NARRATIF : le contenu d'une section ne contient JAMAIS l'historique de ses modifications (« RECADRAGE DU... », « la version précédente de cette section », « BLOC NEUF, DEMANDÉ PAR... »), ni qui a demandé quoi et quand, ni de commentaire sur la génération. Retire ces mentions en conservant le fait éditorial s'il y en a un, et signale chaque retrait dans le rapport (meta_narratif_nettoye). Ce méta contenu vit dans les commentaires et le versioning.",
    "POINTEURS DE ZONE GRISE : chaque item de personnel.zone_grise porte un identifiant court et stable (champ id, format zg_motcle) ; s'il manque, attribue le. Toute note, carte KPI ou question qui recopie le texte d'un item de zone grise devient un POINTEUR : champ zg pour les structures qui le portent (kpis, questions, clips, données cachées), ou « ZG: motcle, consigne essentielle en moins de 90 caractères » dans une note. Signale chaque conversion dans dedoublonnages.",
  ].join("\n"),
  [
    "SECTION TL;DR : écris ou réécris la section tldr, le brief d'attaque lisible en 60 secondes (1200 caractères au TOTAL). Neuf labels DANS CET ORDRE : Qui, Fait d'armes, Fil rouge, Le comment, Polémique, Pourquoi maintenant, Piège, Levier, État d'esprit. Une idée par ligne, phrases courtes. C'est une SYNTHÈSE de la fiche consolidée : chaque ligne s'appuie sur un fait présent ailleurs, rien de neuf. La leçon transférable vit dans apprentissages, pas ici. Format : {\"items\": [{\"label\": \"Qui\", \"texte\": \"...\"}]}.",
    "CONTRÔLE DES QUESTIONS : une question ne vit qu'à UN endroit de la fiche (topics, clips, terrain connu, apprentissages). En cas de doublon ou de paraphrase, garde la version la mieux placée et retire l'autre de topics ou d'apprentissages (les clips ne sont PAS modifiables), SANS la remplacer : un retrait pour doublon ne crée JAMAIS de question de remplacement, un item d'apprentissage garde connu et manque et perd simplement sa question. Avant d'émettre une question NEUVE, quelle qu'en soit la raison, vérifie la contre TOUTES les questions existantes de la fiche (clips, topics, terrain connu, apprentissages) : en cas de recouvrement, ne l'émets pas. Signale chaque résorption dans dedoublonnages. Les questions cœur des topics restent NUMÉROTÉES EN CONTINU (01, 02...) après tes retouches : renumérote si nécessaire.",
    "PROFONDEUR DES QUESTIONS : chaque question en comment des topics exige le mode opératoire répétable (critère de décision, seuil chiffré, arbitrage vécu, cas précis, chiffre à exiger). Une question dont la réponse attendue tiendrait dans un article publié est FAIBLE : reformule la jusqu'à extraire un apprentissage que seul l'invité peut donner. Toute réponse philosophique attendue = prévoir la relance mécanisme + date en note.",
    "GATE TIMES : les topics portent debut_min et fin_min sur un épisode d'environ 150 minutes ; vérifie qu'ils se suivent sans trou ni chevauchement grossier, corrige à la marge sans réinventer le découpage.",
  ].join("\n"),
  "Style (v4) : pas d'emoji, AUCUN tiret d'aucune sorte (ni cadratin, ni demi-cadratin, ni tiret de liste, ni flèche : virgule, parenthèse, deux-points ou point médian à la place), pas de « on », sujet verbe complément. Les questions restent à l'oral, tutoiement, sans point final. Dans data, les champs marche_graphs et lexique se conservent tels quels (valeurs sourcées par la recherche) : tu peux corriger une formulation, jamais retirer un graph ni un terme.",
  "Réponds UNIQUEMENT en JSON, sans aucun texte autour, au format exact demandé dans le message. Les clés JSON ne se traduisent jamais.",
].join("\n\n");

const FORMAT_PLAN = [
  "ÉTAPE 1, LE PLAN DE CONSOLIDATION. Ne réécris AUCUNE section : décide, pour toute la fiche, ce que chaque section devra appliquer ensuite. Sortie COURTE.",
  "Renvoie UNIQUEMENT : {",
  '  "chiffres_reconcilies": [{"fait": "délai défaite-reconquête", "valeur_retenue": "15 mois", "source": "...", "valeurs_ecartees": ["12 mois", "14 mois"]}, ...],',
  '  "noms_unifies": [{"retenu": "Yannick Berrabah", "ecartes": ["Yacine Berrabah"]}, ...],',
  '  "dedoublonnages": [{"fait": "fait recopié en version longue à plusieurs endroits", "proprietaire": "data", "retirer_de": ["tldr", "topics"]}, ...],',
  '  "consignes": {"data": ["..."], "apprentissages": ["..."], "topics": ["..."], "personnel": ["..."], "revue_de_presse": ["..."], "tldr": ["..."], "identite": ["..."], "sticky_header": ["..."]} (ce que chaque section doit faire en particulier : items hors budget à condenser, méta narratif à retirer, balisage à nettoyer, questions en double à résorber et où, titres à aligner ; liste vide si rien)',
  "}",
].join("\n");

const FORMAT_RAPPORT_ETAPE = [
  '  "rapport": {',
  '    "dedoublonnages": ["fait X : gardé dans data, retiré ici", ...],',
  '    "sections_reduites": [{"section": "<id>", "avant": "10 items, ~40 lignes", "apres": "8 items, ~18 lignes"}],',
  '    "balisage_nettoye": ["..."], "meta_narratif_nettoye": ["..."], "titres_corriges": ["..."]',
  "  }",
].join("\n");

/** Consigne et format de sortie d'une étape (PURE, testée). */
export function formatEtape(etape: EtapeRedaction): string {
  const rapport = FORMAT_RAPPORT_ETAPE;
  switch (etape) {
    case "titres":
      return [
        "ÉTAPE : LES TITRES. Vérifie identite.sous_titre, identite.societe et sticky_header.societe contre le corps consolidé (CONTRÔLE DES TITRES). Renvoie UNIQUEMENT les champs que tu corriges ; un champ conforme est absent.",
        'Renvoie UNIQUEMENT : {\n  "section": {"identite": {"sous_titre": "...", "societe": "..."}, "sticky_header": {"societe": "..."}} (champs corrigés seulement, objets vides admis),',
        rapport,
        "}",
      ].join("\n");
    case "tldr":
      return [
        "ÉTAPE FINALE : LE TL;DR. La fiche ci-dessus est désormais consolidée (les sections déjà réécrites remplacent celles du JSON initial). Écris ou réécris la section tldr comme SYNTHÈSE de cette fiche consolidée (SECTION TL;DR des règles), 1200 caractères au TOTAL.",
        'Renvoie UNIQUEMENT : {\n  "section": {"items": [{"label": "Qui", "texte": "..."}, ... neuf labels dans l\'ordre]},',
        rapport,
        "}",
      ].join("\n");
    case "topics":
      return [
        "ÉTAPE : LA SECTION topics (les briques du déroulé). Applique le plan : doublons de questions résorbés (SANS remplacement), items de plus de 240 caractères raccourcis, méta narratif et balisage retirés, graphies unifiées, chiffres alignés sur les valeurs retenues. Une brique conforme n'est PAS renvoyée. Ne touche JAMAIS au titre ni à l'intention d'une brique sauf dépassement de budget ; ne retire jamais une brique ; ne crée jamais de question.",
        'Renvoie UNIQUEMENT : {\n  "section": {\n    "briques": {"<index de la brique dans topics.topics, en partant de 0>": <la brique COMPLÈTE corrigée, même structure que reçue, questions SANS le champ num (renuméroté par le serveur)>, ...} (uniquement les briques modifiées),\n    "terrain_connu": [...] (facultatif, seulement si modifié)\n  },',
        rapport,
        "}",
      ].join("\n");
    default:
      return [
        `ÉTAPE : LA SECTION ${etape}. Applique le plan à cette section : renvoie son contenu COMPLET corrigé, MÊME structure que le contenu reçu (les champs que tu ne touches pas sont recopiés tels quels). Si la section est déjà conforme, renvoie la à l'identique.`,
        `Renvoie UNIQUEMENT : {\n  "section": <contenu complet corrigé de ${etape}>,`,
        rapport,
        "}",
      ].join("\n");
  }
}

/* ───────────────────────── garde-fous purs ───────────────────────── */

/** Champs texte d'un contenu de section, aplatis (pour le contrôle 3 lignes). */
function textesDe(content: Content): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v as Content).forEach(walk);
  };
  walk(content);
  return out;
}

// data est exemptée : son paragraphe de marché a un budget propre (900).
const BLOC_B = new Set(["apprentissages", "clips", "topics", "personnel"]);

/** Items de console encore hors budget 3 lignes (contrôle final, règle 4.4). */
export function itemsHorsBudget(sections: Record<string, Content>): string[] {
  const res: string[] = [];
  for (const [id, content] of Object.entries(sections)) {
    if (!BLOC_B.has(id)) continue;
    for (const t of textesDe(content)) {
      if (t.length > BUDGETS_V3.bloc_b_item_chars) res.push(`${id} : « ${t.slice(0, 60)}... » (${t.length} car.)`);
    }
  }
  return res;
}

/** Clamp de comptes (défense en profondeur, mêmes budgets que la génération). */
function clampContenu(id: string, content: Content): Content {
  const c: Content = { ...content };
  const clampArr = (champ: string, max: number) => {
    if (Array.isArray(c[champ])) c[champ] = (c[champ] as unknown[]).slice(0, max);
  };
  if (id === "apprentissages") clampArr("items", BUDGETS_V3.apprentissages_items);
  if (id === "tldr") clampArr("items", BUDGETS_V3.tldr_items);
  if (id === "personnel") clampArr("zone_grise", BUDGETS_V3.zone_grise_items);
  if (id === "revue_de_presse") clampArr("a_lire", BUDGETS_V3.a_lire_max);
  return c;
}

/**
 * Filtre et sécurise la sortie du modèle (PURE, testée) : sections rédactibles
 * uniquement, jamais de section vidée alors qu'elle avait du contenu, comptes
 * re-clampés, timeline retirée de l'univers quoi qu'il arrive.
 */
export function appliquerRedaction(
  actuel: Record<string, Content>,
  propose: Record<string, unknown> | undefined
): Record<string, Content> {
  const admis: Record<string, Content> = {};
  const redactibles = new Set<string>(SECTIONS_REDACTIBLES);
  for (const [id, contenu] of Object.entries(propose ?? {})) {
    if (!redactibles.has(id)) continue;
    if (!contenu || typeof contenu !== "object" || Array.isArray(contenu)) continue;
    // Sections de titre (v3.1) : fusion champ par champ, SEULS les champs de
    // titre autorisés changent, tout le reste est repris de l'existant.
    if (CHAMPS_TITRE[id]) {
      const base: Content = { ...(actuel[id] ?? {}) };
      let change = false;
      for (const champ of CHAMPS_TITRE[id]) {
        const v = (contenu as Content)[champ];
        if (typeof v === "string" && v.trim() && v !== base[champ]) {
          base[champ] = v;
          change = true;
        }
      }
      if (change) admis[id] = base;
      continue;
    }
    const c = clampContenu(id, contenu as Content);
    // La passe condense, elle ne vide jamais : refus si l'existant avait du contenu.
    if (isEmptyContent(c) && !isEmptyContent(actuel[id] ?? {})) continue;
    // v4 : les graphs marché et le lexique appartiennent à la génération
    // (valeurs sourcées) ; une réécriture de data qui les omet les CONSERVE.
    if (id === "data") {
      const av = actuel.data ?? {};
      if (av.marche_graphs && !c.marche_graphs) c.marche_graphs = av.marche_graphs;
      if (av.lexique && !c.lexique) c.lexique = av.lexique;
    }
    admis[id] = c;
  }
  return admis;
}

/**
 * Fusion des briques renvoyées par l'étape topics (PURE, testée) : seules les
 * briques indexées et modifiées remplacent les existantes, les autres restent
 * telles quelles ; un index hors liste est ignoré ; une brique renvoyée SANS
 * question est refusée (la passe condense, elle ne vide pas) ; la
 * numérotation continue est refaite par le serveur.
 */
export function fusionBriques(actuelTopics: Content, sortie: unknown): { content: Content; modifiees: number[] } {
  const base = Array.isArray(actuelTopics.topics) ? ([...(actuelTopics.topics as unknown[])] as Content[]) : [];
  const modifiees: number[] = [];
  const s = (sortie && typeof sortie === "object" && !Array.isArray(sortie) ? sortie : {}) as Content;
  const briques = s.briques && typeof s.briques === "object" && !Array.isArray(s.briques) ? (s.briques as Content) : {};
  for (const [cle, brique] of Object.entries(briques)) {
    const i = Number(cle);
    if (!Number.isInteger(i) || i < 0 || i >= base.length) continue;
    if (!brique || typeof brique !== "object" || Array.isArray(brique)) continue;
    const b = brique as Content;
    const questions = Array.isArray(b.questions) ? b.questions.filter((q) => q && typeof q === "object" && asStr((q as Content).texte)) : [];
    if (!questions.length && Array.isArray(base[i].questions) && (base[i].questions as unknown[]).length) continue;
    base[i] = { ...base[i], ...b, titre: base[i].titre ?? b.titre, questions };
    modifiees.push(i);
  }
  const terrain = Array.isArray(s.terrain_connu) && s.terrain_connu.length ? s.terrain_connu : undefined;
  const content = renumeroteQuestions({ ...actuelTopics, ...(terrain ? { terrain_connu: terrain } : {}), topics: base });
  return { content, modifiees };
}

/** Sortie d'une étape → proposition pour appliquerRedaction (PURE, testée). */
export function proposeDepuisSortie(etape: EtapeRedaction, sortie: unknown, actuel: Record<string, Content>): Record<string, unknown> {
  if (etape === "titres") {
    const s = (sortie && typeof sortie === "object" && !Array.isArray(sortie) ? sortie : {}) as Content;
    const out: Record<string, unknown> = {};
    if (s.identite && typeof s.identite === "object") out.identite = s.identite;
    if (s.sticky_header && typeof s.sticky_header === "object") out.sticky_header = s.sticky_header;
    return out;
  }
  if (etape === "topics") {
    const { content, modifiees } = fusionBriques(actuel.topics ?? {}, sortie);
    return modifiees.length || (sortie as Content | null)?.terrain_connu ? { topics: content } : {};
  }
  if (!sortie || typeof sortie !== "object" || Array.isArray(sortie)) return {};
  // Tolérance : un modèle qui imbrique la section sous sa propre clé
  // ({"section": {"data": {...}}}) est déballé plutôt qu'écrit tel quel.
  const cles = Object.keys(sortie as Content);
  const interne = (sortie as Content)[etape];
  if (cles.length === 1 && cles[0] === etape && interne && typeof interne === "object" && !Array.isArray(interne)) {
    return { [etape]: interne };
  }
  return { [etape]: sortie };
}

// Correctif du 04/08 (backlog 64595940) : fin du jeu de taupes des questions.
// La consigne « remplace chaque question retirée par une question neuve »
// faisait renaître un doublon au tour suivant (la question neuve créée dans
// apprentissages entrait en collision avec une question de topics). Le prompt
// interdit désormais le remplacement, et ce garde-fou CODE contrôle la sortie
// de la passe : toute question encore en double dans l'état final est retirée
// des sections réécrites, sans remplacement. Le survivant suit la propriété :
// clips, terrain connu et sections non réécrites d'abord (intouchables), puis
// les questions cœur de topics, les questions d'apprentissages en dernier.

type EndroitQuestion =
  | { type: "apprentissage"; i: number }
  | { type: "topic_question"; i: number; j: number }
  | { type: "intouchable" };

function parseEndroitQuestion(e: string): EndroitQuestion {
  let m = /^apprentissages\[(\d+)\]$/.exec(e);
  if (m) return { type: "apprentissage", i: Number(m[1]) };
  m = /^topics\[(\d+)\]\.questions\[(\d+)\]$/.exec(e);
  if (m) return { type: "topic_question", i: Number(m[1]), j: Number(m[2]) };
  return { type: "intouchable" };
}

const RANG_SURVIE: Record<EndroitQuestion["type"], number> = {
  intouchable: 0,
  topic_question: 1,
  apprentissage: 2,
};

/**
 * Retire des sections RÉÉCRITES par la passe toute question encore en double
 * dans l'état final de la fiche (PURE, testée). Une question d'apprentissage
 * retirée laisse son item (connu, manque) sans champ question ; une question
 * cœur retirée sort de la liste de son topic et la numérotation continue
 * (01, 02...) est refaite. Les sections non réécrites ne bougent jamais.
 */
export function resorbeQuestionsSansRemplacement(
  actuel: Record<string, Content>,
  admis: Record<string, Content>
): { admis: Record<string, Content>; resorbees: string[] } {
  const resorbees: string[] = [];
  if (!admis.apprentissages && !admis.topics) return { admis, resorbees };

  const apres: Record<string, Content> = { ...actuel, ...admis };
  const retraitsApprentissages = new Set<number>();
  const retraitsTopics = new Set<string>();
  for (const g of doublonsQuestions(apres)) {
    const parsed = g.endroits.map((e) => ({ e, p: parseEndroitQuestion(e) }));
    const survivant = [...parsed].sort((a, b) => RANG_SURVIE[a.p.type] - RANG_SURVIE[b.p.type])[0];
    for (const { e, p } of parsed) {
      if (e === survivant.e) continue;
      if (p.type === "apprentissage" && admis.apprentissages) {
        retraitsApprentissages.add(p.i);
        resorbees.push(`« ${g.question.slice(0, 70)} » retirée de ${e} sans remplacement (gardée : ${survivant.e})`);
      } else if (p.type === "topic_question" && admis.topics) {
        retraitsTopics.add(`${p.i}:${p.j}`);
        resorbees.push(`« ${g.question.slice(0, 70)} » retirée de ${e} sans remplacement (gardée : ${survivant.e})`);
      }
    }
  }
  if (!retraitsApprentissages.size && !retraitsTopics.size) return { admis, resorbees };

  const out: Record<string, Content> = { ...admis };
  const app = out.apprentissages;
  if (retraitsApprentissages.size && app && Array.isArray(app.items)) {
    out.apprentissages = {
      ...app,
      items: (app.items as unknown[]).map((item, i) => {
        if (!retraitsApprentissages.has(i) || !item || typeof item !== "object") return item;
        const { question: _question, ...reste } = item as Content;
        return reste;
      }),
    };
  }
  const top = out.topics;
  if (retraitsTopics.size && top && Array.isArray(top.topics)) {
    let num = 0;
    out.topics = {
      ...top,
      topics: (top.topics as unknown[]).map((topic, i) => {
        if (!topic || typeof topic !== "object" || !Array.isArray((topic as Content).questions)) return topic;
        const questions = ((topic as Content).questions as unknown[])
          .filter((_, j) => !retraitsTopics.has(`${i}:${j}`))
          .map((q) => {
            num += 1;
            if (!q || typeof q !== "object" || typeof (q as Content).num !== "string") return q;
            return { ...(q as Content), num: String(num).padStart(2, "0") };
          });
        return { ...(topic as Content), questions };
      }),
    };
  }
  return { admis: out, resorbees };
}

// Correctif du 04/08 (backlog 4be50ce8) : réécriture ciblée du TL;DR. Sur les
// fiches denses, la passe complète ne tient pas le budget de 1200 caractères
// (Chiche oscillait entre 1601 et 1770 malgré la consigne). Plutôt qu'une
// troncature serveur (refusée : elle coupe une ligne en plein fait), un appel
// court dédié réécrit le SEUL TL;DR sous budget, sans toucher au reste. La
// mesure est celle du lint (longueur JSON des items, tolérance 200).

/** Longueur JSON des items du TL;DR (la même mesure que le lint). */
export function tldrTotal(content: Content | undefined): number {
  const items = content?.items;
  return Array.isArray(items) ? JSON.stringify(items).length : 0;
}

/** Le TL;DR dépasse-t-il le budget total, à la tolérance du lint près ? */
export function tldrAReecrire(content: Content | undefined): boolean {
  const total = tldrTotal(content);
  return total > BUDGETS_V3.tldr_total_chars + 200;
}

/** Valide la sortie de la réécriture ciblée (PURE, testée) : items non vides
 *  au format {label, texte}, et un total STRICTEMENT plus court que l'entrée
 *  (une réécriture qui rallonge ou stagne est refusée, l'existant reste). */
export function admettreTldrReecrit(actuel: Content, propose: unknown): Content | null {
  if (!propose || typeof propose !== "object" || Array.isArray(propose)) return null;
  const items = (propose as Content).items;
  if (!Array.isArray(items) || !items.length) return null;
  const propres = items.filter(
    (it) => it && typeof it === "object" && typeof (it as Content).label === "string" && typeof (it as Content).texte === "string" && ((it as Content).texte as string).trim()
  ) as Content[];
  if (!propres.length) return null;
  const resultat: Content = { items: propres };
  if (tldrTotal(resultat) >= tldrTotal(actuel)) return null;
  return resultat;
}

const SYSTEM_TLDR = [
  "Tu es le rédacteur en chef des fiches de préparation GDIY. Le TL;DR fourni dépasse son budget : réécris le SOUS 1200 caractères au TOTAL (l'ensemble des textes), en condensant sans perdre de fait.",
  "Neuf labels dans cet ordre exact : Qui, Fait d'armes, Fil rouge, Le comment, Polémique, Pourquoi maintenant, Piège, Levier, État d'esprit. Une idée par ligne, phrases courtes, chaque ligne sous 240 caractères. Tu condenses le contenu reçu, tu n'inventes rien et tu n'ajoutes aucun fait.",
  "Style : pas d'emoji, pas de tiret cadratin, pas de « on », sujet verbe complément.",
  'Réponds UNIQUEMENT en JSON : {"items": [{"label": "Qui", "texte": "..."}]}',
].join("\n\n");

interface SortieEtape { section?: unknown; rapport?: Partial<RapportRedaction> }

/** Message d'échec chiffré d'un appel de la passe (même lecture que la
 *  génération : la limite de tokens se distingue du JSON illisible). */
function messageEchecRedaction(quoi: string, res: Anthropic.Message, texte: string, plafond: number): string {
  const rendus = res.usage?.output_tokens ?? "?";
  const detail = res.stop_reason === "max_tokens"
    ? `sortie coupée par la limite de tokens (plafond ${plafond}, ${rendus} tokens rendus)`
    : `sans JSON exploitable (stop: ${res.stop_reason ?? "?"}, ${rendus} tokens rendus)`;
  return `${quoi} : ${detail}. Début : ${texte.slice(0, 200) || "(vide)"}`;
}

/** Cumul des rapports partiels des étapes dans le rapport de la passe. */
function cumuleRapport(acc: Partial<RapportRedaction>, etape: EtapeRedaction, r: Partial<RapportRedaction> | undefined): Partial<RapportRedaction> {
  if (!r) return acc;
  const liste = (v: unknown, max: number) => asStrList(v, max);
  const out: Partial<RapportRedaction> = { ...acc };
  out.dedoublonnages = [...(acc.dedoublonnages ?? []), ...liste(r.dedoublonnages, 15).map((d) => `${etape} : ${d}`)].slice(0, 40);
  out.titres_corriges = [...(acc.titres_corriges ?? []), ...liste(r.titres_corriges, 10)].slice(0, 10);
  out.balisage_nettoye = [...(acc.balisage_nettoye ?? []), ...liste(r.balisage_nettoye, 10)].slice(0, 10);
  out.meta_narratif_nettoye = [...(acc.meta_narratif_nettoye ?? []), ...liste(r.meta_narratif_nettoye, 10)].slice(0, 10);
  const reduites = Array.isArray(r.sections_reduites)
    ? (r.sections_reduites as unknown[]).flatMap((x) => {
        if (!x || typeof x !== "object") return [];
        const s = x as Content;
        return asStr(s.avant) && asStr(s.apres) ? [{ section: asStr(s.section) ?? etape, avant: asStr(s.avant)!, apres: asStr(s.apres)! }] : [];
      })
    : [];
  out.sections_reduites = [...(acc.sections_reduites ?? []), ...reduites].slice(0, 20);
  return out;
}

export interface RedactionOpts {
  model?: string;
  usageOut?: WebSearchUsage;
  heartbeat?: () => Promise<void>;
  /** Budget mural restant du drain : consulté AVANT chaque appel ; sous
   *  REDACTION_APPEL_RESERVE_MS la passe se suspend proprement. */
  resteMs?: () => number;
}

export interface ResultatRedaction {
  sections: string[];
  sources: number;
  rapport: RapportRedaction;
  /** Passe SUSPENDUE faute de budget mural : l'acquis est écrit et mémorisé,
   *  le job doit retourner en file (ni done ni failed) pour le drain suivant. */
  suspendu?: { restant: EtapeRedaction[]; raison: string };
}

/**
 * Passe 5 scindée : plan de consolidation puis une section par appel, chaque
 * section écrite dès réception (versionnée), reprise depuis le marqueur
 * system_state, suspension propre sous la réserve murale.
 */
export async function processRedaction(
  sb: SB,
  cible: CibleEnrichie,
  fiche: FicheRow,
  opts: RedactionOpts = {}
): Promise<ResultatRedaction> {
  if (!hasAnthropicKey()) throw new Error("Clé Anthropic absente : rédaction impossible (poser ANTHROPIC_API_KEY).");

  // clips est lue en PLUS des sections rédactibles : le contrôle des questions
  // en double doit voir les clips, même si la passe n'a jamais le droit de les
  // réécrire (appliquerRedaction filtre).
  const { data } = await sb
    .from("fiche_sections")
    .select("section_id, content")
    .eq("fiche_id", fiche.id)
    .in("section_id", [...SECTIONS_REDACTIBLES, "clips"]);
  const actuel: Record<string, Content> = {};
  for (const s of ((data ?? []) as { section_id: string; content: Content }[])) {
    if (!isEmptyContent(s.content)) actuel[s.section_id] = s.content ?? {};
  }
  if (!Object.keys(actuel).length) throw new Error("Fiche vide : rien à rédiger (lancer les groupes de recherche d'abord).");

  const client = new Anthropic();
  const model = REDACTION_MODEL();
  // Langue de la fiche (brief 07/09, item 6) : la passe de consolidation
  // écrit dans la langue de la fiche, pas en français par défaut.
  const langue = await langueDeFiche(sb, fiche.id);
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: blocLangue(langue) ? `${blocLangue(langue)}\n\n${SYSTEM}` : SYSTEM, cache_control: { type: "ephemeral" } },
  ];
  const compte = (res: Anthropic.Message) => {
    if (!opts.usageOut) return;
    opts.usageOut.tokens_in += res.usage?.input_tokens ?? 0;
    opts.usageOut.tokens_out += res.usage?.output_tokens ?? 0;
  };
  const texteDe = (m: Anthropic.Message) =>
    m.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  const budgetInsuffisant = () => {
    const reste = opts.resteMs?.();
    return reste !== undefined && reste < REDACTION_APPEL_RESERVE_MS ? Math.max(0, Math.round(reste / 1000)) : null;
  };

  // Le JSON de la fiche tel qu'il était au DÉBUT de la passe est le bloc mis
  // en cache par l'API (identique d'un appel au suivant) ; les sections déjà
  // consolidées par les étapes précédentes suivent dans un bloc séparé, avec
  // la consigne explicite qu'elles REMPLACENT la version initiale.
  const lintAvant = lintFiche(actuel);
  const ficheInitiale: Anthropic.TextBlockParam = {
    type: "text",
    text: `Invité : ${cible.nom}. Fiche au début de la passe (JSON par section) :\n${JSON.stringify(actuel)}${consignesLint(lintAvant)}`,
    cache_control: { type: "ephemeral" },
  };
  const consolidees: Record<string, Content> = {};
  const blocConsolidees = () =>
    Object.keys(consolidees).length
      ? `SECTIONS DÉJÀ CONSOLIDÉES PAR LES ÉTAPES PRÉCÉDENTES (elles REMPLACENT celles du JSON initial, travaille à partir de ces versions) :\n${JSON.stringify(consolidees)}\n\n`
      : "";

  const appel = async (quoi: string, consigne: string, plafond: number): Promise<{ sortie: unknown; res: Anthropic.Message }> => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: [ficheInitiale, { type: "text", text: `${blocConsolidees()}${consigne}` }] },
    ];
    let res = await client.messages.create({ model, max_tokens: plafond, system, messages });
    compte(res);
    let sortie = extractJson<unknown>(texteDe(res));
    if (!sortie && res.stop_reason === "max_tokens") throw new Error(messageEchecRedaction(quoi, res, texteDe(res), plafond));
    if (!sortie) {
      // Finisher : une relance unique pour exiger le JSON (même mécanique que la génération).
      await opts.heartbeat?.().catch(() => {});
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: "Réponds maintenant UNIQUEMENT avec l'objet JSON demandé, complet, sans aucun texte autour." });
      res = await client.messages.create({ model, max_tokens: plafond, system, messages });
      compte(res);
      sortie = extractJson<unknown>(texteDe(res));
    }
    if (!sortie) throw new Error(messageEchecRedaction(quoi, res, texteDe(res), plafond));
    return { sortie, res };
  };

  // ── Reprise : marqueur d'une passe précédente (tuée ou suspendue) ──
  const cle = cleRedactionEnCours(fiche.id);
  const { data: marqueRow } = await sb.from("system_state").select("value").eq("key", cle).maybeSingle();
  const marque = (marqueRow as { value?: unknown } | null)?.value;
  let plan: PlanRedaction | null = null;
  let faites: EtapeRedaction[] = [];
  let rapportAcc: Partial<RapportRedaction> = {};
  let startedAt = new Date().toISOString();
  if (reprisePossible(marque)) {
    plan = marque.plan;
    faites = [...marque.faites];
    rapportAcc = { ...marque.rapport };
    startedAt = marque.started_at;
    // À la reprise, `actuel` relu en base porte déjà les sections consolidées
    // par la passe précédente : le bloc initial est à jour, rien à répéter.
  }
  const memoriser = async () => {
    const valeur: MarqueurRedaction = { plan: plan!, faites, rapport: rapportAcc, started_at: startedAt };
    await sb.from("system_state").upsert({ key: cle, value: valeur, updated_at: new Date().toISOString() });
  };

  const etapes = etapesRedaction(actuel);
  const written: string[] = [];

  // ── Appel 1 : le PLAN (sauf reprise) ──
  if (!plan) {
    const s = budgetInsuffisant();
    if (s !== null) return { sections: [], sources: 0, rapport: rapportVide(), suspendu: { restant: etapes, raison: `budget mural épuisé (${s} s restants) avant le plan` } };
    const { sortie } = await appel("Plan de consolidation", FORMAT_PLAN, PLAN_MAX_TOKENS);
    plan = planDepuisJson(sortie);
    rapportAcc = { chiffres_reconcilies: plan.chiffres_reconcilies, noms_unifies: plan.noms_unifies };
    await memoriser();
  }

  // ── Appels 2..N : une section par appel, écrite dès réception ──
  const echecs: string[] = [];
  let tldr_reecrit: RapportRedaction["tldr_reecrit"];
  for (const etape of etapesRestantes(etapes, faites)) {
    const s = budgetInsuffisant();
    if (s !== null) {
      await memoriser();
      return {
        sections: written,
        sources: 0,
        rapport: assembleRapport(rapportAcc, actuel, faites, echecs, tldr_reecrit, false),
        suspendu: { restant: etapesRestantes(etapes, faites), raison: `budget mural épuisé (${s} s restants), ${faites.length} étape(s) faite(s) sur ${etapes.length}` },
      };
    }
    await opts.heartbeat?.().catch(() => {});
    try {
      const consigne = `${blocPlan(plan, etape)}\n\n${formatEtape(etape)}`.trim();
      const { sortie } = await appel(`Rédaction, étape ${etape}`, consigne, PLAFONDS_REDACTION[etape]);
      const so = (sortie as SortieEtape) ?? {};
      const filtre = appliquerRedaction(actuel, proposeDepuisSortie(etape, so.section, actuel));
      // Fin du jeu de taupes (04/08) : les questions encore en double après la
      // réécriture sont retirées des sections réécrites, sans remplacement.
      const { admis, resorbees } = resorbeQuestionsSansRemplacement(actuel, filtre);
      if (resorbees.length) rapportAcc.questions_resorbees = [...(rapportAcc.questions_resorbees ?? []), ...resorbees].slice(0, 20);
      // Réécriture ciblée du TL;DR (04/08) : si le budget total est encore
      // dépassé, un appel court dédié le réécrit seul. Best-effort.
      if (etape === "tldr") {
        const tldrFinal = (admis.tldr ?? actuel.tldr) as Content | undefined;
        if (tldrFinal && tldrAReecrire(tldrFinal)) {
          await opts.heartbeat?.().catch(() => {});
          try {
            const resTldr = await client.messages.create({
              model,
              max_tokens: 2048,
              system: blocLangue(langue) ? `${SYSTEM_TLDR}\n\n${blocLangue(langue)}` : SYSTEM_TLDR,
              messages: [{ role: "user", content: `Invité : ${cible.nom}. TL;DR actuel (JSON) :\n${JSON.stringify(tldrFinal)}` }],
            });
            compte(resTldr);
            const reecrit = admettreTldrReecrit(tldrFinal, extractJson<Content>(texteDe(resTldr)));
            if (reecrit) {
              tldr_reecrit = { avant: tldrTotal(tldrFinal), apres: tldrTotal(reecrit) };
              admis.tldr = reecrit;
            }
          } catch {
            /* réécriture best-effort : la passe principale reste valide */
          }
        }
      }
      for (const [id, contenu] of Object.entries(admis)) {
        await writeSection(sb, fiche.id, id, contenu, REDACTION_AUTHOR);
        actuel[id] = contenu;
        consolidees[id] = contenu;
        if (!written.includes(id)) written.push(id);
      }
      rapportAcc = cumuleRapport(rapportAcc, etape, so.rapport);
      faites.push(etape);
      await memoriser();
    } catch (e) {
      echecs.push(`${etape} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (echecs.length) {
    // L'acquis (étapes faites) reste mémorisé : une relance ne rejoue que les
    // étapes manquantes, tant que le marqueur est valide.
    await memoriser();
    throw new Error(`Rédaction PARTIELLE : ${faites.length} étape(s) sur ${etapes.length} écrite(s), l'acquis est conservé. Échecs : ${echecs.join(" ; ")}. Une relance de generate_fiche (redaction) ne rejoue que les étapes manquantes.`);
  }

  // Passe complète : le marqueur tombe, une prochaine passe repart d'un plan neuf.
  await sb.from("system_state").delete().eq("key", cle);
  return { sections: written, sources: 0, rapport: assembleRapport(rapportAcc, actuel, faites, echecs, tldr_reecrit, true) };
}

function rapportVide(): RapportRedaction {
  return { dedoublonnages: [], chiffres_reconcilies: [], sections_reduites: [], hors_budget_residuel: [], titres_corriges: [], noms_unifies: [] };
}

/** Rapport final : cumul des étapes, contrôle des budgets et verdict du lint
 *  (règle 5 : le résiduel est le critère d'acceptation, zéro attendu sur une
 *  fiche fraîche ; mesuré seulement quand la passe est complète). */
function assembleRapport(
  acc: Partial<RapportRedaction>,
  apres: Record<string, Content>,
  faites: EtapeRedaction[],
  echecs: string[],
  tldr_reecrit: RapportRedaction["tldr_reecrit"],
  complete: boolean
): RapportRedaction {
  const rapport: RapportRedaction = {
    ...rapportVide(),
    ...acc,
    hors_budget_residuel: itemsHorsBudget(apres).slice(0, 20),
    tldr_reecrit,
    etapes: [...faites, ...echecs.map((e) => `échec ${e.split(" : ")[0]}`)],
  };
  if (complete) {
    const lintApres = lintFiche(apres);
    rapport.lint_residuel = {
      doublons: lintApres.doublons.slice(0, 10),
      chiffres_repetes: lintApres.chiffres_repetes.slice(0, 10),
      meta_narratif: lintApres.meta_narratif.slice(0, 10),
      questions_doublons: lintApres.questions_doublons.slice(0, 10),
      bloquants: lintApres.bloquants,
    };
  }
  return rapport;
}
