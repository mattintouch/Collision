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
import { writeSection, type FicheRow } from "./store";
import type { createServiceClient } from "../supabase/service";
import type { CibleEnrichie } from "../types";

type SB = ReturnType<typeof createServiceClient>;
type Content = Record<string, unknown>;

const REDACTION_AUTHOR = "vadim (rédaction)";

/** Modèle de la passe de rédaction : consolidation de fond, sans recherche
 *  web. Recalibrable par l'env (décision Haiku/Sonnet sur données, §4.4). */
const REDACTION_MODEL = () => process.env.REDACTION_MODEL ?? "claude-sonnet-4-6";

/** Sections que la passe a le droit de réécrire. Hors périmètre : la
 *  checklist, le footer, les questions réseaux (challengées par l'équipe) et
 *  les sources (liste de liens vérifiés). L'entête et le bandeau sont admis
 *  depuis v3.1 mais SEULS leurs champs de titre sont modifiables (cf.
 *  CHAMPS_TITRE) : jamais le numéro, les pilules ni les liens. */
export const SECTIONS_REDACTIBLES = [
  "enjeu", "recit_canonique", "mecanique_succes", "univers", "personnel", "a_lire",
  "trente_secondes", "chiffres", "parcours", "playbook", "entourage", "anecdotes",
  "tensions", "questions_recurrentes", "sequencage", "dix_questions", "zone_grise",
  "entete", "sticky_header",
] as const;

/** v3.1 item 3 : sur les sections de titre, la passe ne peut corriger QUE ces
 *  champs (cohérence titres contre corps), le reste est préservé tel quel. */
export const CHAMPS_TITRE: Record<string, readonly string[]> = {
  entete: ["sous_titre", "societe"],
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
}

const SYSTEM = [
  "Tu es le RÉDACTEUR EN CHEF des fiches de préparation GDIY (Collision Productions). Quatre rédacteurs exhaustifs ont écrit la fiche en parallèle : ton travail est la passe de consolidation que personne n'a faite. Tu reçois la fiche entière en JSON, tu renvoies les sections CORRIGÉES.",
  "Objectif : à information constante, réduire le volume de 40 à 50 pour cent, rendre la fiche scannable en fragments pendant l'enregistrement, supprimer toute contradiction chiffrée. Aucune perte de fait vérifié : tu condenses et tu déplaces, tu n'inventes rien et tu ne supprimes un fait que s'il est répété ailleurs.",
  [
    "RÈGLE 1, propriété unique des faits :",
    "- La chronologie datée vit dans parcours (12 lignes max) et NULLE PART ailleurs. Toute frise ou liste de jalons datés hors parcours est à supprimer ou à réduire en renvoi court.",
    "- recit_canonique : un paragraphe d'ouverture (5 lignes max) puis 7 temps maximum, une ligne chacun. Aucune prose longue.",
    "- univers : marché, fédérations, économie, distinctions uniquement, 4 points max hors graphiques. Retire toute timeline ou biographie. Les graphiques (barres, comparaison, rentabilite) restent tels quels.",
    "- mecanique_succes : les divergences sont des DÉCISIONS, pas un récit biographique.",
    "- Un fait n'apparaît qu'UNE fois en version longue dans toute la fiche. Les reprises deviennent un renvoi court (« cf. parcours 2015 ») ou disparaissent.",
  ].join("\n"),
  [
    "RÈGLE 2, budgets durs : recit = 1 ouverture + 7 temps ; parcours = 12 lignes max ; playbook = 6 leviers max, champs connu/manque/question en 2 lignes max chacun ; univers = 4 points max ; a_lire = 3 sources max (garde les meilleures).",
    "RÈGLE 3, format scannable : le Bloc B (trente_secondes, chiffres, parcours, playbook, entourage, anecdotes, tensions, questions_recurrentes, sequencage, dix_questions, zone_grise) est lu en studio. AUCUN item de plus de 3 lignes (environ 240 caractères) : découpe ou raccourcis.",
  ].join("\n"),
  [
    "RÈGLE DES CHIFFRES : construis mentalement la liste des valeurs chiffrées de la fiche. Pour chaque fait cité avec des valeurs divergentes, impose UNE valeur avec sa source (la mieux sourcée), partout. Si tu ne peux pas trancher, retire les valeurs divergentes des sections et ajoute un item en zone_grise : « {fait} : valeurs divergentes ({valeurs}), ne pas citer un chiffre unique à l'antenne », origine « rédaction (chiffre non tranché) ».",
    "zone_grise : conserve les items existants, ajoute les tiens.",
  ].join("\n"),
  [
    "CONTRÔLE DES TITRES (v3.1) : vérifie les champs de titre (sticky_header.societe, entete.sous_titre, entete.societe) contre les faits consolidés du corps. Toute divergence numérique ou qualificatif contredit par le corps (exemple : « Septuple champion » dans le sous-titre quand le corps établit 8 titres) se corrige SUR LE CHAMP DE TITRE, aligné sur la valeur retenue dans le corps. Tu ne peux modifier QUE sous_titre et societe : jamais le numéro, les titre_lignes, les pilules ni les liens.",
    "CONTRÔLE DES NOMS PROPRES (v3.1) : construis la liste des personnes et entités citées dans TOUTE la fiche, détecte les variantes orthographiques proches d'un même référent (exemple : Yacine Berrabah contre Yannick Berrabah), impose UNE graphie unique partout, celle des sources les plus fiables. Si le doute n'est pas tranchable, garde la graphie majoritaire et ajoute un item zone_grise « orthographe à vérifier : {variante A} ou {variante B} », origine « rédaction (nom à vérifier) ».",
  ].join("\n"),
  "Style : pas d'emoji, pas de tiret cadratin, pas de « on », sujet verbe complément. Les questions restent à l'oral, tutoiement, sans point final.",
  [
    "Réponds UNIQUEMENT en JSON : {",
    '  "sections": { "<section_id>": <contenu complet corrigé, MÊME structure que le contenu reçu> } (uniquement les sections que tu modifies ; une section déjà conforme est absente),',
    '  "rapport": {',
    '    "dedoublonnages": ["fait X : gardé dans parcours, retiré de recit_canonique et univers", ...],',
    '    "chiffres_reconcilies": [{"fait": "délai défaite-reconquête", "valeur_retenue": "15 mois", "source": "...", "valeurs_ecartees": ["12 mois", "14 mois"]}, ...],',
    '    "sections_reduites": [{"section": "playbook", "avant": "8 items, ~40 lignes", "apres": "6 items, ~18 lignes"}, ...],',
    '    "titres_corriges": ["sous_titre : Septuple champion corrigé en Octuple champion (8 titres établis par le corps)", ...],',
    '    "noms_unifies": [{"retenu": "Yannick Berrabah", "ecartes": ["Yacine Berrabah"]}, ...]',
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

const BLOC_B = new Set(["trente_secondes", "chiffres", "parcours", "playbook", "entourage", "anecdotes", "tensions", "questions_recurrentes", "sequencage", "dix_questions", "zone_grise"]);

/** Items du Bloc B encore hors budget 3 lignes (contrôle final, règle 4.4). */
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
  if (id === "recit_canonique") clampArr("paragraphes", BUDGETS_V3.recit_ouverture + BUDGETS_V3.recit_temps);
  if (id === "parcours") clampArr("lignes", BUDGETS_V3.parcours_lignes);
  if (id === "playbook") clampArr("items", BUDGETS_V3.playbook_items);
  if (id === "univers") clampArr("intro", BUDGETS_V3.univers_points);
  if (id === "a_lire") clampArr("liens", BUDGETS_V3.a_lire_sources);
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
    let c = clampContenu(id, contenu as Content);
    if (id === "univers") { const { timeline: _t, ...reste } = c; c = reste; }
    // La passe condense, elle ne vide jamais : refus si l'existant avait du contenu.
    if (isEmptyContent(c) && !isEmptyContent(actuel[id] ?? {})) continue;
    admis[id] = c;
  }
  return admis;
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
  opts: { model?: string; usageOut?: WebSearchUsage } = {}
): Promise<{ sections: string[]; sources: number; rapport: RapportRedaction }> {
  if (!hasAnthropicKey()) throw new Error("Clé Anthropic absente : rédaction impossible (poser ANTHROPIC_API_KEY).");

  const { data } = await sb
    .from("fiche_sections")
    .select("section_id, content")
    .eq("fiche_id", fiche.id)
    .in("section_id", [...SECTIONS_REDACTIBLES]);
  const actuel: Record<string, Content> = {};
  for (const s of ((data ?? []) as { section_id: string; content: Content }[])) {
    if (!isEmptyContent(s.content)) actuel[s.section_id] = s.content ?? {};
  }
  if (!Object.keys(actuel).length) throw new Error("Fiche vide : rien à rédiger (lancer les groupes de recherche d'abord).");

  const client = new Anthropic();
  const model = REDACTION_MODEL();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Invité : ${cible.nom}. Fiche actuelle (JSON par section) :\n${JSON.stringify(actuel)}` },
  ];
  const compte = (res: Anthropic.Message) => {
    if (!opts.usageOut) return;
    opts.usageOut.tokens_in += res.usage?.input_tokens ?? 0;
    opts.usageOut.tokens_out += res.usage?.output_tokens ?? 0;
  };
  let res = await client.messages.create({ model, max_tokens: 16384, system: SYSTEM, messages });
  compte(res);
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

  const admis = appliquerRedaction(actuel, sortie.sections);
  const written: string[] = [];
  for (const [id, contenu] of Object.entries(admis)) {
    await writeSection(sb, fiche.id, id, contenu, REDACTION_AUTHOR);
    written.push(id);
  }

  const apres = { ...actuel, ...admis };
  const rapport: RapportRedaction = {
    dedoublonnages: Array.isArray(sortie.rapport?.dedoublonnages) ? (sortie.rapport!.dedoublonnages as string[]).slice(0, 30) : [],
    chiffres_reconcilies: Array.isArray(sortie.rapport?.chiffres_reconcilies) ? (sortie.rapport!.chiffres_reconcilies as RapportRedaction["chiffres_reconcilies"]).slice(0, 20) : [],
    sections_reduites: Array.isArray(sortie.rapport?.sections_reduites) ? (sortie.rapport!.sections_reduites as RapportRedaction["sections_reduites"]).slice(0, 20) : [],
    hors_budget_residuel: itemsHorsBudget(apres).slice(0, 20),
    titres_corriges: Array.isArray(sortie.rapport?.titres_corriges) ? (sortie.rapport!.titres_corriges as string[]).slice(0, 10) : [],
    noms_unifies: Array.isArray(sortie.rapport?.noms_unifies) ? (sortie.rapport!.noms_unifies as RapportRedaction["noms_unifies"]).slice(0, 10) : [],
  };
  return { sections: written, sources: 0, rapport };
}
