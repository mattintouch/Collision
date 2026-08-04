// Contrat v3, règle 4 — la passe 5, le rédacteur en chef (la vraie brique).
//
// Exécutée APRÈS les quatre groupes de recherche (job "fiche:redaction", mis
// en file en dernier et différé tant que des groupes restent à traiter), elle
// lit la fiche ENTIÈRE assemblée et applique en un appel modèle, sans
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
// Garde-fous code (défense en profondeur, indépendants du modèle) : seules les
// sections rédactibles sont écrites, une section ne peut pas être vidée par la
// passe, les comptes sont re-clampés, l'écriture reste versionnée (rollback).

import Anthropic from "@anthropic-ai/sdk";
import { extractJson, type WebSearchUsage } from "../ai/websearch";
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

/** Budget mural MINIMAL pour démarrer une passe de rédaction (correctif du
 *  03/08). La passe consolide la fiche ENTIÈRE en un appel modèle à 16 384
 *  tokens de sortie, deux avec le finisher : sur la fiche la plus lourde elle
 *  dépasse largement les 300 s d'une fonction standard. Un drain qui dispose
 *  de moins que cette réserve laisse le job en file (le cron, à 800 s, le
 *  prendra avec un budget frais) plutôt que de le démarrer et de se faire
 *  tuer en plein vol, ce qui finissait en « timeout (> n min) » au faucheur. */
export const REDACTION_RESERVE_MS = 420_000;

/** Un drain peut-il revendiquer une passe de rédaction avec ce reste de
 *  budget mural ? (PURE, testée.) */
export function redactionAdmissible(resteMs: number): boolean {
  return resteMs >= REDACTION_RESERVE_MS;
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
  /** Règle 5 : verdict du lint APRÈS la passe (doublons, chiffres répétés et
   *  questions en double résiduels = bloquants restants ; zéro attendu sur une
   *  fiche fraîche). */
  lint_residuel?: Pick<LintRapport, "doublons" | "chiffres_repetes" | "meta_narratif" | "questions_doublons" | "bloquants">;
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

const SYSTEM = [
  "Tu es le RÉDACTEUR EN CHEF des fiches de préparation GDIY (Collision Productions). Quatre rédacteurs exhaustifs ont écrit la fiche en parallèle : ton travail est la passe de consolidation que personne n'a faite. Tu reçois la fiche entière en JSON, tu renvoies les sections CORRIGÉES.",
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
  "Style : pas d'emoji, pas de tiret cadratin, pas de « on », sujet verbe complément. Les questions restent à l'oral, tutoiement, sans point final.",
  [
    "Réponds UNIQUEMENT en JSON : {",
    '  "sections": { "<section_id>": <contenu complet corrigé, MÊME structure que le contenu reçu> } (uniquement les sections que tu modifies ; une section déjà conforme est absente),',
    '  "rapport": {',
    '    "dedoublonnages": ["fait X : gardé dans data, retiré de tldr et topics", ...],',
    '    "chiffres_reconcilies": [{"fait": "délai défaite-reconquête", "valeur_retenue": "15 mois", "source": "...", "valeurs_ecartees": ["12 mois", "14 mois"]}, ...],',
    '    "sections_reduites": [{"section": "apprentissages", "avant": "10 items, ~40 lignes", "apres": "8 items, ~18 lignes"}, ...],',
    '    "titres_corriges": ["sous_titre : Septuple champion corrigé en Octuple champion (8 titres établis par le corps)", ...],',
    '    "noms_unifies": [{"retenu": "Yannick Berrabah", "ecartes": ["Yacine Berrabah"]}, ...],',
    '    "balisage_nettoye": ["data : balise cite retirée d\'un libellé", ...],',
    '    "meta_narratif_nettoye": ["tldr : mention RECADRAGE retirée", ...]',
    "  }",
    "}",
  ].join("\n"),
].join("\n\n");

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
    admis[id] = c;
  }
  return admis;
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

interface SortieRedaction { sections?: Record<string, unknown>; rapport?: Partial<RapportRedaction> }

/**
 * Passe 5 complète : lit les sections, appelle le modèle (avec finisher JSON),
 * écrit les sections admises (versionnées), renvoie sections écrites + rapport.
 */
export async function processRedaction(
  sb: SB,
  cible: CibleEnrichie,
  fiche: FicheRow,
  opts: { model?: string; usageOut?: WebSearchUsage; heartbeat?: () => Promise<void> } = {}
): Promise<{ sections: string[]; sources: number; rapport: RapportRedaction }> {
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
  // Règle 5 : le lint mesure AVANT la passe et ses trouvailles deviennent des
  // consignes explicites (doublons, chiffres répétés, méta narratif, budgets).
  const lintAvant = lintFiche(actuel);
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Invité : ${cible.nom}. Fiche actuelle (JSON par section) :\n${JSON.stringify(actuel)}${consignesLint(lintAvant)}` },
  ];
  const compte = (res: Anthropic.Message) => {
    if (!opts.usageOut) return;
    opts.usageOut.tokens_in += res.usage?.input_tokens ?? 0;
    opts.usageOut.tokens_out += res.usage?.output_tokens ?? 0;
  };
  let res = await client.messages.create({ model, max_tokens: 16384, system: SYSTEM, messages });
  compte(res);
  // Signe de vie entre les deux appels modèle (chacun peut durer plusieurs
  // minutes) : le faucheur de jobs ne requalifie pas une passe encore vivante.
  await opts.heartbeat?.().catch(() => {});
  const texteDe = (m: Anthropic.Message) =>
    m.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
  let sortie = extractJson<SortieRedaction>(texteDe(res));
  if (!sortie) {
    // Finisher : une relance unique pour exiger le JSON (même mécanique que la génération).
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: "Réponds maintenant UNIQUEMENT avec l'objet JSON demandé, complet, sans aucun texte autour." });
    res = await client.messages.create({ model, max_tokens: 16384, system: SYSTEM, messages });
    compte(res);
    sortie = extractJson<SortieRedaction>(texteDe(res));
  }
  if (!sortie) throw new Error(`Rédaction sans JSON exploitable (stop: ${res.stop_reason ?? "?"}). Début : ${texteDe(res).slice(0, 260) || "(vide)"}`);

  const filtre = appliquerRedaction(actuel, sortie.sections);
  // Fin du jeu de taupes (04/08) : les questions encore en double après la
  // passe sont retirées des sections réécrites, sans remplacement.
  const { admis, resorbees } = resorbeQuestionsSansRemplacement(actuel, filtre);
  const written: string[] = [];
  for (const [id, contenu] of Object.entries(admis)) {
    await writeSection(sb, fiche.id, id, contenu, REDACTION_AUTHOR);
    written.push(id);
  }

  const apres = { ...actuel, ...admis };
  // Règle 5, verdict : le lint repasse APRÈS la passe ; le résiduel est le
  // critère d'acceptation (« zéro doublon bloquant sur une fiche fraîche »).
  const lintApres = lintFiche(apres);
  const rapport: RapportRedaction = {
    dedoublonnages: Array.isArray(sortie.rapport?.dedoublonnages) ? (sortie.rapport!.dedoublonnages as string[]).slice(0, 30) : [],
    chiffres_reconcilies: Array.isArray(sortie.rapport?.chiffres_reconcilies) ? (sortie.rapport!.chiffres_reconcilies as RapportRedaction["chiffres_reconcilies"]).slice(0, 20) : [],
    sections_reduites: Array.isArray(sortie.rapport?.sections_reduites) ? (sortie.rapport!.sections_reduites as RapportRedaction["sections_reduites"]).slice(0, 20) : [],
    hors_budget_residuel: itemsHorsBudget(apres).slice(0, 20),
    titres_corriges: Array.isArray(sortie.rapport?.titres_corriges) ? (sortie.rapport!.titres_corriges as string[]).slice(0, 10) : [],
    noms_unifies: Array.isArray(sortie.rapport?.noms_unifies) ? (sortie.rapport!.noms_unifies as RapportRedaction["noms_unifies"]).slice(0, 10) : [],
    balisage_nettoye: Array.isArray(sortie.rapport?.balisage_nettoye) ? (sortie.rapport!.balisage_nettoye as string[]).slice(0, 10) : [],
    meta_narratif_nettoye: Array.isArray(sortie.rapport?.meta_narratif_nettoye) ? (sortie.rapport!.meta_narratif_nettoye as string[]).slice(0, 10) : [],
    questions_resorbees: resorbees.slice(0, 20),
    lint_residuel: {
      doublons: lintApres.doublons.slice(0, 10),
      chiffres_repetes: lintApres.chiffres_repetes.slice(0, 10),
      meta_narratif: lintApres.meta_narratif.slice(0, 10),
      questions_doublons: lintApres.questions_doublons.slice(0, 10),
      bloquants: lintApres.bloquants,
    },
  };
  return { sections: written, sources: 0, rapport };
}
