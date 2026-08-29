// Génération des fiches structurées par deep research (contrat v2, Bloc A/B).
//
// La génération est découpée en QUATRE groupes de recherche, chacun étant un job
// asynchrone de la file enrichment_jobs (objectif "fiche:<groupe>") : un job = un
// appel de recherche web = quelques sections écrites. La fiche se remplit
// progressivement, dans le budget des fonctions Vercel.
//
// Contrat v3.1 (31/07) :
//   portrait → identite (01, Wikipedia systématique, date de naissance,
//              sous-titre 2 phrases), revue_de_presse (09 : réseaux, palmarès,
//              à lire la veille), sticky_header
//   chiffres → data (04 : KPI sourcés, 1-2 graphiques, marché et comparables)
//   angles   → apprentissages (05 : 5-8 systèmes connu/manque/question),
//              personnel (08 : entourage, données cachées)
//   deroule  → tldr (03, neuf labels), topics (07 : terrain connu + topics à
//              gate time et questions cœur), clips (06), zone grise fusionnée
//              dans personnel
//
// Règles transverses (contrat §3) : filtre « surface vs mécanisme » ; interdits
// (SIREN, immatriculations, numéros professionnels, adresses) ; tout chiffre
// sourcé et daté (sinon pointeur zone grise, jamais de chiffre orphelin) ;
// aucune URL reconstruite, vérification HTTP à la génération.

import { runWebSearchJSONVerbose, type WebSearchUsage } from "../ai/websearch";
import { hasAnthropicKey } from "../copilot/config";
import type { createServiceClient } from "../supabase/service";
import type { CibleEnrichie } from "../types";
import { writeSection, type FicheRow } from "./store";
import { motifIneligibleGeneration, cibleEstTest, type CibleGeneration } from "../qualification";
import { asArray, asString, safeUrl, DEFAULT_PERSONNEL_BANDEAU, BUDGETS_V3, idZoneGrise } from "./schema";

type SB = ReturnType<typeof createServiceClient>;
type Content = Record<string, unknown>;

export const FICHE_JOB_PREFIX = "fiche:";
// Contrat v3 : la cinquième passe « redaction » (rédacteur en chef) s'exécute
// APRÈS les quatre groupes de recherche et consolide la fiche entière
// (déduplication, réconciliation des chiffres, budgets, format scannable).
export const FICHE_GROUPES = ["portrait", "chiffres", "angles", "deroule", "redaction"] as const;
export const FICHE_GROUPES_RECHERCHE = ["portrait", "chiffres", "angles", "deroule"] as const;
export type FicheGroupe = (typeof FICHE_GROUPES)[number];

/** Règle 1, propriété unique des faits (v3.1) : injectée dans chaque prompt. */
const PROPRIETE_FAITS = [
  "PROPRIÉTÉ UNIQUE DES FAITS (principe directeur du contrat v3.1) : chaque fait vit dans UNE seule section, les autres pointent. Elles ne le réécrivent JAMAIS en entier.",
  "- Palmarès et jalons datés (titres, exits, récompenses, records) : propriété de revue_de_presse.palmares, liste exhaustive et datée. Interdiction de reconstruire une frise ailleurs.",
  "- Données chiffrées sourcées (KPI, montants, stats) : propriété de data. Une autre section peut citer UN chiffre inline si le propos l'exige, sans re-citer la source ; jamais plus d'une occurrence hors section propriétaire. Un chiffre NON confirmé porte un pointeur zg, jamais de chiffre orphelin.",
  "- Statuts de vérification, chiffres non tranchés, formulations interdites : propriété de personnel.zone_grise (identifiants stables zg_motcle). Ailleurs, un POINTEUR court « ZG: <mot-clé> » (90 caractères max), jamais le texte complet de l'item.",
  "- Cadrage d'attaque de l'épisode : propriété du tldr (neuf labels). Aucune autre section ne re-justifie le fil rouge.",
  "- Lectures recommandées curées (3 à 5) : propriété de revue_de_presse.a_lire ; la section sources reste exhaustive en base ; aucun lien ne figure dans les deux avec le même apport.",
  "- Personnes de l'écosystème : propriété de personnel.entourage. Un topic cite un nom, jamais la bio.",
  "- Marché et comparables : propriété de data.marche, UN paragraphe plus une ligne par pair. Aucune biographie.",
  "- Les systèmes et décisions structurantes : propriété d'apprentissages, formulés comme des DÉCISIONS et des mécaniques, jamais comme un récit biographique.",
  "- UNE question ne vit qu'à UN endroit de la fiche (topics, clips, terrain connu, apprentissages) : jamais de reprise ni de paraphrase entre ces listes.",
  "- Un fait cité une fois en version longue ; toute reprise est un renvoi court ou une omission.",
].join("\n");

const GENERATION_AUTHOR = "vadim (génération)";

/** Style maison, répété dans chaque prompt (non négociable, brief §5). */
const STYLE = [
  "Style d'écriture impératif : pas d'emoji, pas de tiret cadratin ni de double tiret (virgule, point, parenthèse ou deux-points à la place).",
  "Pas de « on » : sujets explicites. Sujet, verbe, complément. Concis, zéro fluff.",
  "Les questions sont à l'oral, dans la voix de Matthieu : directes, tutoiement, sans guillemets, sans point final, majorité en « comment ».",
].join("\n");

/** Règles transverses du contrat v2 (§0 et §3). */
const REGLES = [
  "Filtre éditorial : le tri n'est pas « connu vs inconnu » mais « surface vs mécanisme ». Couvre le canonique EN PROFONDEUR au lieu de le fuir ; l'obsession est de déconstruire comment l'invité est devenu le meilleur dans son univers. Mécanique avant scoop.",
  "INTERDITS transverses : SIREN, immatriculations, numéros professionnels (toque, RPPS), adresses administratives, données d'annuaire, sauf pertinence narrative explicite.",
  "Règle de vérification ABSOLUE : chaque chiffre porte sa source datée. Un chiffre non confirmé par une source publique fiable n'apparaît PAS. N'invente jamais un chiffre, une date ou une citation.",
  "URLs : uniquement des URLs réellement rencontrées dans tes recherches. AUCUNE URL reconstruite, devinée ou complétée. En cas de doute, omets l'URL.",
  "INTERDICTION DU MÉTA NARRATIF (correctif du 27/07) : le contenu d'une section ne contient JAMAIS l'historique de ses modifications (« RECADRAGE DU... », « la version précédente... », « BLOC NEUF »), ni qui a demandé quoi et quand, ni de commentaire sur la génération elle-même. Ce méta contenu vit dans les commentaires de fiche et le versioning, pas dans le contenu.",
].join("\n");

/** Doctrine de profondeur GDIY (pack Matthieu, v2 juillet 2026) : grille
 *  permanente injectée dans chaque prompt de génération. */
const DOCTRINE = [
  "DOCTRINE DE PROFONDEUR (permanente) :",
  "- Extraire le SYSTÈME, pas l'histoire : le mode opératoire reproductible. La question utile n'est jamais « qu'as-tu fait » mais « comment tu produis ce que tu produis, de façon répétable ».",
  "- Trois familles de mécaniques à chercher chez TOUT invité : action (le geste, l'exécution, la routine concrète), réflexion (comment il décide, arbitre, tranche sous incertitude), innovation (comment il va chercher sa singularité face à ses pairs).",
  "- Trois couches : A la mécanique personnelle (priorité absolue, environ 60 % de l'antenne), B l'état de l'art du domaine (environ 20 %, SUBORDONNÉE : elle arme l'intervieweur et n'existe que pour éclairer une pratique de l'invité, jamais un sujet en soi), C la leçon transférable à un auditeur étranger au domaine (environ 20 %, explicitement nommée, jamais implicite).",
  "- ARCHÉTYPE : identifie-le et calibre les mécaniques. Fondateur/entrepreneur (défaut) : le pari initial, l'allocation du risque, le pivot, la décision de financement. Dirigeant de grand groupe coté (exception) : l'ascension et l'exercice du pouvoir à l'échelle, décider sous contrainte de conseil et d'actionnaires. Artiste : processus créatif, routine d'atelier, source de singularité, rapport à la critique. Sportif : entraînement, routines, préparation mentale, gestion du pic et de la pression. Avocat : construction du dossier, stratégie d'audience, lecture de l'adversaire, incertitude du verdict. Médecin/scientifique : décision sous incertitude, diagnostic, rapport à l'erreur, éthique de la preuve. Politique : conquête et exercice du pouvoir, arbitrage conviction/opinion, NEUTRALITÉ, la méthode et non la polémique. Hybride : croiser les grilles et chercher la tension entre elles, souvent la zone la plus riche.",
  "- DISTINCTION SECTORIELLE : identifie les termes adjacents que le grand public confond (ex. biopharma ≠ MedTech) et pose la distinction dans la fiche, pour que l'intervieweur la formule lui-même au micro.",
  "- Test de qualité d'une question : si la réponse attendue pourrait figurer dans un article déjà publié, la question est faible. Reformuler jusqu'à exiger un critère, un seuil, un arbitrage, un cas précis, que seule la personne assise en face peut donner.",
].join("\n");

function guestIntro(c: CibleEnrichie, ficheDate: string | null): string {
  const bits = [
    c.role ? `${c.role}` : null,
    c.organisation ? `(${c.organisation})` : null,
    c.secteur ? `secteur ${c.secteur}` : null,
  ].filter(Boolean).join(" ");
  const sujets = Array.isArray(c.sujets) && c.sujets.length ? ` Sujets pressentis : ${(c.sujets as string[]).join(", ")}.` : "";
  const date = ficheDate ? ` Enregistrement prévu le ${new Date(ficheDate).toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" })}.` : "";
  return `Invité : ${c.nom}${bits ? `, ${bits}` : ""}.${sujets}${date}\nContexte : préparation d'un épisode de Génération Do It Yourself (GDIY), podcast long format (2 h 30) sur les parcours de ceux qui sont devenus les meilleurs de leur univers. Obsession éditoriale : le COMMENT (les méthodes), pas la légende.`;
}

function systemFor(mission: string): string {
  return [
    "Tu prépares la fiche d'interview d'un invité pour GDIY (Collision Productions). Recherche web approfondie, sources croisées et datées.",
    "Cadre : l'invité a accepté l'interview et sera présent à l'enregistrement. La fiche est un document interne de préparation éditoriale, fondé exclusivement sur des informations publiques le concernant dans son rôle public ou professionnel.",
    mission,
    DOCTRINE,
    PROPRIETE_FAITS,
    "BUDGETS DE LONGUEUR (contrat v3.1, DURS, imposés aussi par le serveur au stockage) : la fiche est scannable en fragments pendant l'enregistrement, tout item de console tient en 3 lignes maximum (environ 240 caractères). Budgets par champ : tldr 1200 caractères au TOTAL, une idée par ligne ; intention de topic 200 ; note tactique de question 200 ; apport d'une lecture 120 ; marché UN paragraphe de 900 ; zone grise 12 items de 400 ; 16 KPI ; 5 à 8 apprentissages ; 1 à 2 graphiques. AUCUN plafond sur le NOMBRE de questions : peu si peu, beaucoup si beaucoup d'exceptionnelles. La concision prime sur l'exhaustivité : un fait fort et court bat trois faits délayés.",
    REGLES,
    STYLE,
    "Réponds UNIQUEMENT en JSON, sans texte autour, au format exact demandé.",
  ].join("\n\n");
}

/** Faits déjà posés par les groupes précédents (les jobs d'une fiche se
 *  traitent dans l'ordre) : le générateur reçoit la liste et a l'interdiction
 *  de les réécrire en entier (règle 1, implémentation attendue du brief). */
async function faitsDejaPoses(sb: SB, ficheId: string): Promise<string> {
  const { data } = await sb
    .from("fiche_sections")
    .select("section_id, content")
    .eq("fiche_id", ficheId)
    .in("section_id", ["revue_de_presse", "data"]);
  const par = new Map(((data ?? []) as { section_id: string; content: Content }[]).map((s) => [s.section_id, s.content ?? {}]));
  const morceaux: string[] = [];
  const palmares = asArray((par.get("revue_de_presse") ?? {}).palmares, (x) => {
    const texte = asString(x.texte);
    return texte ? `${asString(x.date) ?? ""} ${texte}`.trim() : null;
  });
  if (palmares.length) morceaux.push(`Palmarès DÉJÀ POSÉ (propriété de revue_de_presse) :\n${palmares.map((l) => `- ${l}`).join("\n")}`);
  const kpis = asArray((par.get("data") ?? {}).kpis, (x) => {
    const valeur = asString(x.valeur); const libelle = asString(x.libelle);
    return valeur && libelle ? `${libelle} = ${valeur}` : null;
  });
  if (kpis.length) morceaux.push(`Chiffres DÉJÀ POSÉS (propriété de data, réutilise EXACTEMENT ces valeurs, n'en introduis pas de divergentes) :\n${kpis.map((k) => `- ${k}`).join("\n")}`);
  if (!morceaux.length) return "";
  return `\n\nFAITS DÉJÀ ATTRIBUÉS À LEURS SECTIONS PROPRIÉTAIRES. Interdiction de les réécrire en entier ; renvoi court autorisé.\n${morceaux.join("\n")}`;
}

/* ───────────────────────── types des réponses JSON ───────────────────────── */

interface LienJson { date?: string; titre?: string; apport?: string; url?: string; niveau?: string; temps_lecture?: string }

interface PortraitJson {
  sous_titre?: string;
  societe?: string;
  liens?: { label?: string; url?: string }[];
  date_naissance?: string;
  reseaux?: { label?: string; url?: string }[];
  palmares?: { date?: string; texte?: string }[];
  a_lire?: LienJson[];
  sources?: LienJson[];
}

interface ChiffresJson {
  kpis?: { valeur?: string; libelle?: string; source?: string; zg?: string }[];
  barres?: { titre?: string; note?: string; source?: string; valeurs?: { label?: string; affiche?: string; valeur?: number; plein?: boolean }[] };
  comparaison?: { titre?: string; source?: string; valeurs?: { nom?: string; affiche?: string; pct?: number; hero?: boolean }[] };
  marche_texte?: string;
  comparables?: { nom?: string; position?: string }[];
  sources?: LienJson[];
}

interface AnglesJson {
  apprentissages?: { titre?: string; connu?: string; manque?: string; question?: string }[];
  entourage?: { nom?: string; role?: string; eclaire?: string; preconfirmer?: string }[];
  donnees_cachees?: { texte?: string; source?: string; zg?: string }[];
  sources?: LienJson[];
}

interface DerouleJson {
  tldr?: { label?: string; texte?: string }[];
  terrain_connu?: { question?: string; reponse?: string; depassement?: string }[];
  topics?: { titre?: string; debut_min?: number; fin_min?: number; intention?: string; questions?: { num?: string; texte?: string; note?: string; zg?: string }[] }[];
  clips?: { question?: string; ressort?: string; clip?: string; zg?: string; fache?: boolean }[];
  zone_grise?: { id?: string; texte?: string; origine?: string }[];
  sources?: LienJson[];
}

/* ───────────────────────── vérification des URLs ───────────────────────── */

/** Vérifie qu'une URL répond (HEAD puis GET, 4 s). Contrat §3 : URL invérifiable
 *  = exclue, jamais reconstruite. Best-effort : les erreurs excluent le lien. */
async function urlOk(url: string): Promise<boolean> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(url, { method, redirect: "follow", signal: ctrl.signal });
      clearTimeout(t);
      if (res.status < 400) return true;
      if (method === "GET") return false;
      // HEAD refusé (403/405 fréquents) : retenter en GET.
      if (res.status !== 403 && res.status !== 405) return false;
    } catch {
      if (method === "GET") return false;
    }
  }
  return false;
}

function lienList(v: unknown) {
  return asArray(v, (x) => {
    const titre = asString(x.titre);
    if (!titre) return null;
    return {
      date: asString(x.date),
      titre,
      apport: asString(x.apport),
      url: safeUrl(x.url),
      niveau: asString(x.niveau),
      temps_lecture: asString(x.temps_lecture),
    };
  });
}

/** Filtre une liste de liens : URLs vérifiées (HTTP < 400), invalides exclues. */
async function verifiedLinks<T extends { url?: string }>(liens: T[], max = 15): Promise<T[]> {
  const capped = liens.slice(0, max);
  const checks = await Promise.all(capped.map(async (l) => (l.url ? await urlOk(l.url) : false)));
  return capped.filter((_, i) => checks[i]);
}

/** Fusionne des liens vérifiés dans la section sources (dédoublonnés par url/titre). */
async function mergeSources(sb: SB, fiche: FicheRow, liens: ReturnType<typeof lienList>): Promise<void> {
  if (!liens.length) return;
  const ok = await verifiedLinks(liens);
  if (!ok.length) return;
  const { data } = await sb.from("fiche_sections").select("content").eq("fiche_id", fiche.id).eq("section_id", "sources").maybeSingle();
  const current = lienList(((data as { content?: Content } | null)?.content ?? {}).liens);
  const seen = new Set(current.map((l) => l.url ?? l.titre));
  const merged = [...current];
  for (const l of ok) {
    const key = l.url ?? l.titre;
    if (!seen.has(key)) { seen.add(key); merged.push(l); }
  }
  if (merged.length !== current.length) await writeSection(sb, fiche.id, "sources", { liens: merged }, GENERATION_AUTHOR);
}

/** Notes internes non intégrées : matière pour la zone grise et les angles. */
async function pendingNotes(sb: SB, ficheId: string): Promise<{ id: string; text: string; source: string | null }[]> {
  const { data } = await sb.from("fiche_notes").select("id, text, source").eq("fiche_id", ficheId).eq("integrated", false);
  return (data ?? []) as { id: string; text: string; source: string | null }[];
}

/* ── Idées éditoriales (chantier du 27/08, migration 0050) : le backlog posé
      au niveau CIBLE, avant la fiche. Injecté dans les groupes angles et
      deroule ; passé en integree à la réussite du deroule (le groupe des
      questions), JAMAIS ignoré en silence : un deroule qui échoue laisse les
      idées en backlog, elles reviennent au prochain passage. */

export interface IdeeEditoriale { id: string; type: string; texte: string; source_url: string | null }

/** Idées en backlog d'une cible. Défensif : table absente (0050 non
 *  appliquée) = liste vide, la génération tourne comme avant. */
async function ideesBacklog(sb: SB, cibleId: string): Promise<IdeeEditoriale[]> {
  try {
    const { data, error } = await sb
      .from("idees_editoriales")
      .select("id, type, texte, source_url")
      .eq("cible_id", cibleId)
      .eq("statut", "backlog")
      .order("created_at")
      .limit(100);
    if (error) return [];
    return (data ?? []) as IdeeEditoriale[];
  } catch {
    return [];
  }
}

/** Bloc de prompt des idées (PURE, testée) : l'intégration est OBLIGATOIRE,
 *  une idée inutilisable telle quelle finit en zone grise, jamais ignorée. */
export function blocIdees(idees: Pick<IdeeEditoriale, "type" | "texte" | "source_url">[]): string {
  if (!idees.length) return "";
  return `\n\nIDÉES ÉDITORIALES DE L'ÉQUIPE (backlog posé avant la fiche, à INTÉGRER OBLIGATOIREMENT : chaque idée doit se retrouver dans une question, un topic, un clip ou un angle ; une idée inutilisable telle quelle devient un item de zone grise avec son origine, JAMAIS ignorée en silence) :\n${idees
    .map((i) => `- [${i.type}] ${i.texte}${i.source_url ? ` (source : ${i.source_url})` : ""}`)
    .join("\n")}`;
}

/** Passe en integree les idées injectées, à la réussite du deroule. */
async function marqueIdeesIntegrees(sb: SB, idees: IdeeEditoriale[]): Promise<void> {
  if (!idees.length) return;
  try {
    await sb
      .from("idees_editoriales")
      .update({ statut: "integree" })
      .in("id", idees.map((i) => i.id))
      .eq("statut", "backlog");
  } catch {
    /* jamais bloquant : au pire les idées reviennent au prochain passage */
  }
}

// usageOut (chantier 3) : accumulateur de tokens MUTÉ au fil des appels, y
// compris quand le groupe échoue ensuite (les tokens ont été consommés).
export interface FicheJobOpts { model?: string; maxSearches?: number; usageOut?: WebSearchUsage }

/**
 * Traite UN groupe de génération pour une fiche : recherche web, écrit les
 * sections du groupe (celles qui ont de la matière), fusionne les sources.
 * Renvoie la liste des sections écrites.
 */
export async function processFicheGroupe(
  sb: SB,
  groupe: FicheGroupe,
  cible: CibleEnrichie,
  fiche: FicheRow,
  opts: FicheJobOpts = {}
): Promise<{ sections: string[]; sources: number }> {
  if (!hasAnthropicKey()) throw new Error("Clé Anthropic absente : génération impossible (poser ANTHROPIC_API_KEY).");
  const { model, maxSearches = 4 } = opts;
  const intro = guestIntro(cible, fiche.date_enregistrement);
  const written: string[] = [];
  let sourcesCount = 0;
  const compte = (u: WebSearchUsage) => {
    if (!opts.usageOut) return;
    opts.usageOut.tokens_in += u.tokens_in;
    opts.usageOut.tokens_out += u.tokens_out;
  };
  const put = async (id: string, content: Content, hasMatter: boolean) => {
    if (!hasMatter) return;
    await writeSection(sb, fiche.id, id, content, GENERATION_AUTHOR);
    written.push(id);
  };

  if (groupe === "portrait") {
    const r = await runWebSearchJSONVerbose<PortraitJson>(
      systemFor("Mission : l'IDENTITÉ et la REVUE DE PRESSE. Identité : le sous-titre d'épisode en DEUX phrases (une phrase de fait d'armes vérifiable, une phrase de thèse en « le comment de ») ; la date de naissance sourcée ; la page WIKIPEDIA, à chercher SYSTÉMATIQUEMENT (quand elle existe, elle est le PREMIER lien, non négociable), sinon LinkedIn. Revue de presse : les RÉSEAUX SOCIAUX de l'invité (liens directs réellement trouvés : X, Instagram, LinkedIn, YouTube, profils officiels selon l'archétype) ; le PALMARÈS, liste exhaustive et datée des titres, exits, récompenses et records (section PROPRIÉTAIRE des jalons datés : ils vivent là et nulle part ailleurs) ; la liste À LIRE LA VEILLE : 3 entrées MINIMUM, 5 si le détour se justifie, jamais du remplissage mais un vrai travail de mise dans le bain (long format, documentaire, dossier qui apporte du contexte que la fiche ne porte pas) ; la page Wikipedia y figure systématiquement quand elle existe."),
      `${intro}\n\nRenvoie un objet JSON : {\n  "sous_titre": "fait d'armes vérifiable en une phrase. Thèse en « le comment de » en une phrase.",\n  "societe": "sa société ou structure principale",\n  "liens": [{"label": "Wikipedia", "url": "..."} EN PREMIER quand la page existe, {"label": "LinkedIn", "url": "..."}] (seulement si réellement trouvés),\n  "date_naissance": "AAAA-MM-JJ (sourcée, omise si introuvable)",\n  "reseaux": [{"label": "X", "url": "..."}, {"label": "Instagram", "url": "..."}] (liens DIRECTS réellement trouvés, selon l'archétype),\n  "palmares": [{"date": "2024", "texte": "titre, exit, récompense ou record, sans point final"}] (liste exhaustive et datée),\n  "a_lire": [3 à 5 : {"niveau": "indispensable|utile", "titre", "date", "temps_lecture": "12 min", "apport": "l'apport en une ligne de 120 caractères max", "url"}] (Wikipedia inclus quand la page existe),\n  "sources": [tous les liens consultés : {"date", "titre", "apport", "url"}]\n}`,
      maxSearches, model, 8192
    );
    compte(r.usage);
    const raw = r.json;
    if (!raw) throw new Error(`Recherche portrait sans JSON exploitable (stop: ${r.stop ?? "?"}). Début de la réponse : ${r.text.slice(0, 260) || "(vide)"}`);
    const liens = await verifiedLinks(
      asArray(raw.liens, (x) => {
        const label = asString(x.label); const url = safeUrl(x.url);
        return label && url ? { label, url } : null;
      }),
      4
    );
    // Wikipedia d'abord (règle systématique du contrat v3.1).
    liens.sort((a, b) => Number(/wikipedia/i.test(b.url)) - Number(/wikipedia/i.test(a.url)));
    const reseaux = await verifiedLinks(
      asArray(raw.reseaux, (x) => {
        const label = asString(x.label); const url = safeUrl(x.url);
        return label && url ? { label, url } : null;
      }),
      8
    );
    const palmares = asArray(raw.palmares, (x) => {
      const texte = asString(x.texte);
      return texte ? { date: asString(x.date), texte } : null;
    });
    const aLire = await verifiedLinks(lienList(raw.a_lire), BUDGETS_V3.a_lire_max);
    const dateNaissance = asString(raw.date_naissance)?.match(/^\d{4}-\d{2}-\d{2}$/) ? asString(raw.date_naissance) : undefined;

    const { data: idRow } = await sb.from("fiche_sections").select("content").eq("fiche_id", fiche.id).eq("section_id", "identite").maybeSingle();
    const identite = (((idRow as { content?: Content } | null)?.content) ?? {}) as Content;
    const pilules = Array.isArray(identite.pilules) && identite.pilules.length ? identite.pilules : buildPilules(fiche.date_enregistrement);
    // accompagnants et mise_en_relation : saisis à la main, JAMAIS écrasés ici.
    await put("identite", {
      ...identite,
      sous_titre: asString(raw.sous_titre) ?? identite.sous_titre,
      societe: asString(raw.societe) ?? identite.societe,
      liens: liens.length ? liens : identite.liens,
      date_naissance: dateNaissance ?? identite.date_naissance,
      pilules,
    }, true);
    await put("sticky_header", { societe: asString(raw.societe) }, !!asString(raw.societe));
    const { data: rdpRow } = await sb.from("fiche_sections").select("content").eq("fiche_id", fiche.id).eq("section_id", "revue_de_presse").maybeSingle();
    const rdp = (((rdpRow as { content?: Content } | null)?.content) ?? {}) as Content;
    await put("revue_de_presse", {
      ...rdp,
      reseaux: reseaux.length ? reseaux : rdp.reseaux,
      palmares: palmares.length ? palmares : rdp.palmares,
      a_lire: aLire.length ? aLire : rdp.a_lire,
    }, reseaux.length > 0 || palmares.length > 0 || aLire.length > 0);
    const all = lienList(raw.sources);
    await mergeSources(sb, fiche, all);
    sourcesCount = all.length;
  }

  if (groupe === "chiffres") {
    const dejaPose = await faitsDejaPoses(sb, fiche.id);
    const r = await runWebSearchJSONVerbose<ChiffresJson>(
      systemFor("Mission : la section DATA, adaptée à l'archétype (CA, marge ou EBITDA, concurrence et marché pour un dirigeant ; ventes et streams pour un artiste ; scores, titres et records pour un sportif). Cartes KPI : 8 à 15 données clés, chacune avec sa valeur, son libellé et sa SOURCE DATÉE ; un chiffre non confirmé porte un pointeur zg (mot-clé) au lieu d'une source, JAMAIS de chiffre orphelin ; UNE SEULE valeur par fait, si les sources divergent retiens la mieux sourcée. Graphiques : 1 à 2 MAXIMUM, seulement si une trajectoire raconte quelque chose (croissance sur 10 ans, comparaison à un pair) ; aucun graphique décoratif. Marché et comparables : l'essentiel du marché en UN paragraphe (900 caractères max), puis les pairs et concurrents nommés, une ligne chacun avec le positionnement relatif de l'invité."),
      `${intro}${dejaPose}\n\nRenvoie un objet JSON : {\n  "kpis": [8 à 15 : {"valeur": "9,9 Md€", "libelle": "CA groupe 2024", "source": "source, datée", "zg": "motcle (UNIQUEMENT si le chiffre n'est pas confirmé, à la place de source)"}],\n  "barres": {"titre", "note", "source", "valeurs": [{"label": "24", "affiche": "9,9", "valeur": 9.9, "plein": true}]} (seulement si la trajectoire raconte quelque chose),\n  "comparaison": {"titre", "source", "valeurs": [{"nom", "affiche": "+125 %", "pct": 125, "hero": true (l'invité)}]} (seulement si vérifiable ; 2 graphiques MAXIMUM au total),\n  "marche_texte": "l'essentiel du marché en UN paragraphe de 900 caractères max, chiffres sourcés dans le texte",\n  "comparables": [2 à 5 : {"nom": "pair ou concurrent", "position": "positionnement relatif de l'invité, une ligne"}],\n  "sources": [{"date", "titre", "apport", "url"}]\n}`,
      maxSearches, model, 8192
    );
    compte(r.usage);
    const raw = r.json;
    if (!raw) throw new Error(`Recherche data sans JSON exploitable (stop: ${r.stop ?? "?"}). Début de la réponse : ${r.text.slice(0, 260) || "(vide)"}`);
    const kpis = asArray(raw.kpis, (x) => {
      const valeur = asString(x.valeur); const libelle = asString(x.libelle);
      const source = asString(x.source); const zg = asString(x.zg);
      // Jamais de chiffre orphelin : source datée OU pointeur zone grise.
      if (!valeur || !libelle || (!source && !zg)) return null;
      return { valeur, libelle, ...(source ? { source } : {}), ...(zg ? { zg } : {}) };
    });
    const data: Content = {};
    if (kpis.length) data.kpis = kpis.slice(0, BUDGETS_V3.chiffres_kpis);
    if (raw.barres?.titre && Array.isArray(raw.barres.valeurs) && raw.barres.valeurs.length) data.barres = raw.barres;
    if (raw.comparaison && Array.isArray(raw.comparaison.valeurs) && raw.comparaison.valeurs.length) data.comparaison = raw.comparaison;
    const marcheTexte = asString(raw.marche_texte);
    const comparables = asArray(raw.comparables, (x) => {
      const nom = asString(x.nom);
      return nom ? { nom, position: asString(x.position) } : null;
    });
    if (marcheTexte || comparables.length) {
      data.marche = { ...(marcheTexte ? { texte: marcheTexte } : {}), ...(comparables.length ? { comparables } : {}) };
    }
    await put("data", data, Object.keys(data).length > 0);
    const all = lienList(raw.sources);
    await mergeSources(sb, fiche, all);
    sourcesCount = all.length;
  }

  if (groupe === "angles") {
    const notes = await pendingNotes(sb, fiche.id);
    const notesTxt = notes.length
      ? `\n\nNotes internes de l'équipe (NON vérifiées, ne les présente jamais comme des faits, elles peuvent nourrir un angle) :\n${notes.map((n) => `- ${n.text}${n.source ? ` (${n.source})` : ""}`).join("\n")}`
      : "";
    const ideesTxt = blocIdees(await ideesBacklog(sb, cible.id));
    const dejaPose = await faitsDejaPoses(sb, fiche.id);
    const r = await runWebSearchJSONVerbose<AnglesJson>(
      systemFor("Mission : les APPRENTISSAGES (section reine) et le PERSONNEL. Apprentissages : 5 à 8 SYSTÈMES, répartis sur les trois familles de mécaniques (action, réflexion, innovation), calibrés sur l'archétype ; les points de DÉCISION structurants (les décisions datées qui ont fait décrocher sa trajectoire de celle de ses pairs) sont des apprentissages à part entière, formulés comme décisions. Pour chaque système, trois puces COURTES de 2 lignes maximum : ce que les sources établissent, ce qui reste opaque, et la question qui FORCE l'invité à révéler la mécanique (critère, seuil, arbitrage ou cas précis, jamais une réponse d'article). Test de qualité : la réponse change la façon de travailler d'un auditeur dès lundi matin. Personnel, deux sous-blocs : l'ENTOURAGE (mentors, associés, coachs, rencontres pivots, ennemis utiles : pour chaque personne, son rôle, ce qu'elle éclaire, ce qu'il faut pré-confirmer avec elle avant plateau) et les DONNÉES CACHÉES (vieux dossiers, anecdotes introuvables dans les interviews récentes, archives, en bien ou en mal ; chaque item SOURCÉ, ou pointé zg s'il vient d'une note interne non vérifiée)."),
      `${intro}${dejaPose}${notesTxt}${ideesTxt}\n\nRenvoie un objet JSON : {\n  "apprentissages": [5 à 8, couvrant action, réflexion ET innovation, décisions structurantes incluses : {"titre": "le système", "connu": "ce que les sources établissent, 2 lignes max", "manque": "ce qui reste opaque, 2 lignes max", "question": "la question qui force la mécanique (critère, seuil, arbitrage, cas précis), tutoiement, sans point final, 2 lignes max"}],\n  "entourage": [3 à 6 : {"nom", "role", "eclaire": "ce que cette personne éclaire, 2 lignes max", "preconfirmer": "ce qu'il faut pré-confirmer avec elle avant plateau, 1 ligne"}],\n  "donnees_cachees": [3 à 8 : {"texte": "3 lignes max, en bien ou en mal", "source": "où c'est documenté, daté (OBLIGATOIRE sauf zg)", "zg": "motcle (si non sourçable, à faire confirmer)"}],\n  "sources": [{"date", "titre", "apport", "url"}]\n}`,
      maxSearches, model, 8192
    );
    compte(r.usage);
    const raw = r.json;
    if (!raw) throw new Error(`Recherche angles sans JSON exploitable (stop: ${r.stop ?? "?"}). Début de la réponse : ${r.text.slice(0, 260) || "(vide)"}`);
    const apprentissages = asArray(raw.apprentissages, (x) => {
      const titre = asString(x.titre);
      return titre ? { titre, connu: asString(x.connu), manque: asString(x.manque), question: asString(x.question) } : null;
    }).slice(0, BUDGETS_V3.apprentissages_items);
    const entourage = asArray(raw.entourage, (x) => {
      const nom = asString(x.nom);
      return nom ? { nom, role: asString(x.role), eclaire: asString(x.eclaire), preconfirmer: asString(x.preconfirmer) } : null;
    });
    // Données cachées : sourcées ou pointées zg, jamais orphelines.
    const donneesCachees = asArray(raw.donnees_cachees, (x) => {
      const texte = asString(x.texte); const source = asString(x.source); const zg = asString(x.zg);
      if (!texte || (!source && !zg)) return null;
      return { texte, ...(source ? { source } : {}), ...(zg ? { zg } : {}) };
    });
    await put("apprentissages", { items: apprentissages }, apprentissages.length > 0);
    const { data: persoRow } = await sb.from("fiche_sections").select("content").eq("fiche_id", fiche.id).eq("section_id", "personnel").maybeSingle();
    const perso = (((persoRow as { content?: Content } | null)?.content) ?? {}) as Content;
    await put("personnel", {
      ...perso,
      bandeau: asString(perso.bandeau) ?? DEFAULT_PERSONNEL_BANDEAU,
      entourage: entourage.length ? entourage : perso.entourage,
      donnees_cachees: donneesCachees.length ? donneesCachees : perso.donnees_cachees,
    }, entourage.length > 0 || donneesCachees.length > 0);
    const all = lienList(raw.sources);
    await mergeSources(sb, fiche, all);
    sourcesCount = all.length;
  }

  if (groupe === "deroule") {
    const idees = await ideesBacklog(sb, cible.id);
    const ideesTxt = blocIdees(idees);
    const notes = await pendingNotes(sb, fiche.id);
    const notesTxt = notes.length
      ? `\n\nNotes internes NON vérifiées (chacune doit finir en zone grise avec son origine, formulée « à faire dire par l'invité ») :\n${notes.map((n) => `- ${n.text}${n.source ? ` (origine : ${n.source})` : ""}`).join("\n")}`
      : "";
    const { data: appRow } = await sb.from("fiche_sections").select("content").eq("fiche_id", fiche.id).eq("section_id", "apprentissages").maybeSingle();
    const app = (((appRow as { content?: Content } | null)?.content ?? {}) as { items?: { titre?: string; question?: string }[] }).items ?? [];
    const appTxt = app.length ? `\n\nApprentissages déjà identifiés (à faire vivre dans les topics) : ${app.map((p) => p.titre).filter(Boolean).join(" · ")}` : "";
    // Anti-doublon : les questions des apprentissages sont interdites de
    // reprise dans les topics et les clips (une question vit à UN endroit).
    const dejaQuestions: string[] = app.map((p) => p.question).filter((q): q is string => !!q);
    const dejaQTxt = dejaQuestions.length
      ? `\n\nQuestions DÉJÀ posées dans les apprentissages : INTERDICTION de les reprendre ou de les paraphraser dans les topics ou les clips :\n${dejaQuestions.map((q) => `- ${q}`).join("\n")}`
      : "";
    const dejaPose = await faitsDejaPoses(sb, fiche.id);
    const r = await runWebSearchJSONVerbose<DerouleJson>(
      systemFor("Mission : le TL;DR, les TOPICS et les CLIPS. TL;DR : le brief d'attaque lisible en 60 secondes (1200 caractères au TOTAL), phrases courtes, une idée par ligne, NEUF labels dans cet ordre exact : Qui, Fait d'armes, Fil rouge, Le comment, Polémique, Pourquoi maintenant, Piège, Levier, État d'esprit. TOPICS : la conversation reste NATURELLE, jamais scriptée ; ouvre sur le TERRAIN CONNU (les questions qu'il a déjà eues partout : la réponse rodée en une ligne ET le dépassement prévu, « tu racontes souvent X, mais qu'est-ce qui s'est passé juste avant ») ; puis 5 à 8 topics, chacun avec son titre, son gate time (début et fin en minutes sur un épisode de 150), son intention en UNE ligne de 200 caractères, ses questions cœur NUMÉROTÉES EN CONTINU sur toute la fiche (01, 02, 03... d'un topic à l'autre, pas de plafond : peu si peu, beaucoup si beaucoup d'exceptionnelles) et ses sous-notes tactiques (RELANCE, CHIFFRE À EXIGER, TERRAIN GLISSANT, 200 caractères max). Chaque question en comment va AU FOND : elle exige le mode opératoire répétable (critère de décision, seuil chiffré, arbitrage vécu, cas précis), jamais une réponse qui tiendrait dans un article. Dosage : 60 % mécanique personnelle, 20 % domaine SUBORDONNÉ à l'individu, 20 % leçons transférables nommées ; au plus 3 questions sur 10 sur le domaine ; toute réponse philosophique attendue = prévoir la relance mécanisme + date. Une tension entre deux faits publics vérifiés rattachable à un topic devient son intention ou une relance. CLIPS : une dizaine de questions courtes, frontales, fun et partageables (ressorts : argent, échec, contre_pied, confession) ; les QUESTIONS QUI FÂCHENT (adossées à une polémique publique documentée, jamais une insinuation) ferment la liste. AUCUNE question ne vit à deux endroits (topics, clips, terrain connu, apprentissages). ZONE GRISE : chaque élément non vérifié (notes internes, chiffres non tranchés) porte un identifiant court zg_motcle ; les notes et cartes POINTENT cet identifiant (« ZG: motcle, consigne en moins de 90 caractères »), elles ne recopient JAMAIS le texte complet."),
      `${intro}${dejaPose}${appTxt}${dejaQTxt}${notesTxt}${ideesTxt}\n\nRenvoie un objet JSON : {\n  "tldr": [NEUF, dans cet ordre : {"label": "Qui|Fait d'armes|Fil rouge|Le comment|Polémique|Pourquoi maintenant|Piège|Levier|État d'esprit", "texte": "une idée, phrases courtes"}] (1200 caractères au total),\n  "terrain_connu": [3 à 6 : {"question": "déjà posée partout", "reponse": "sa réponse rodée en une ligne", "depassement": "le dépassement prévu"}],\n  "topics": [5 à 8 : {"titre", "debut_min": 0, "fin_min": 25, "intention": "une ligne, 200 caractères max", "questions": [{"num": "01 (continu sur toute la fiche)", "texte": "courte, tutoiement, sans point final, adossée à un fait", "note": "RELANCE : ... · CHIFFRE À EXIGER : ... (200 caractères max)", "zg": "motcle (si un point non tranché)"}]}],\n  "clips": [{"question": "courte, frontale, partageable, tutoiement", "ressort": "argent|echec|contre_pied|confession", "clip": "la réaction visée", "zg": "motcle (si point non tranché)", "fache": true pour une question qui fâche (adossée à une polémique documentée)}] (les questions qui fâchent EN FIN de liste),\n  "zone_grise": [{"id": "zg_motcle (court, stable, snake_case)", "texte": "à faire confirmer par l'invité, 400 caractères max", "origine": "note Matthieu / écho non recoupé / chiffre non tranché"}],\n  "sources": [{"date", "titre", "apport", "url"}]\n}`,
      maxSearches, model, 8192
    );
    compte(r.usage);
    const raw = r.json;
    if (!raw) throw new Error(`Recherche déroulé sans JSON exploitable (stop: ${r.stop ?? "?"}). Début de la réponse : ${r.text.slice(0, 260) || "(vide)"}`);
    const tldr = asArray(raw.tldr, (x) => {
      const label = asString(x.label); const texte = asString(x.texte);
      return label && texte ? { label, texte } : null;
    });
    const terrain = asArray(raw.terrain_connu, (x) => {
      const question = asString(x.question);
      return question ? { question, reponse: asString(x.reponse), depassement: asString(x.depassement) } : null;
    });
    const topics = asArray(raw.topics, (x) => {
      const titre = asString(x.titre);
      if (!titre) return null;
      const questions = asArray(x.questions, (q) => {
        const texte = asString(q.texte);
        return texte ? { num: asString(q.num), texte, note: asString(q.note), zg: asString(q.zg) } : null;
      });
      const debut = Number(x.debut_min); const fin = Number(x.fin_min);
      return {
        titre,
        ...(Number.isFinite(debut) ? { debut_min: debut } : {}),
        ...(Number.isFinite(fin) ? { fin_min: fin } : {}),
        intention: asString(x.intention),
        questions,
      };
    });
    const clips = asArray(raw.clips, (x) => {
      const question = asString(x.question);
      if (!question) return null;
      return { question, ressort: asString(x.ressort), clip: asString(x.clip), zg: asString(x.zg), ...(x.fache === true ? { fache: true } : {}) };
    });
    // Les questions qui fâchent ferment la liste (contrat v3.1).
    clips.sort((a, b) => Number(a.fache === true) - Number(b.fache === true));
    // Identifiant court par item de zone grise, unique dans la fiche ; la zone
    // grise vit dans personnel (fusion : les items existants sont conservés).
    const { data: persoRow } = await sb.from("fiche_sections").select("content").eq("fiche_id", fiche.id).eq("section_id", "personnel").maybeSingle();
    const perso = (((persoRow as { content?: Content } | null)?.content) ?? {}) as Content;
    const existants = asArray(perso.zone_grise, (x) => {
      const texte = asString(x.texte);
      return texte ? { id: asString(x.id), texte, origine: asString(x.origine) } : null;
    });
    const idsZg = new Set<string>(existants.map((z) => z.id).filter((i): i is string => !!i));
    const nouveaux = asArray(raw.zone_grise, (x) => {
      const texte = asString(x.texte);
      if (!texte) return null;
      const brut = asString(x.id)?.toLowerCase().replace(/[^a-z0-9_]/g, "");
      const id = brut && !idsZg.has(brut) ? brut : idZoneGrise(texte, idsZg);
      idsZg.add(id);
      return { id, texte, origine: asString(x.origine) };
    });
    await put("tldr", { items: tldr }, tldr.length > 0);
    await put("topics", { terrain_connu: terrain, topics }, terrain.length > 0 || topics.length > 0);
    await put("clips", { questions: clips }, clips.length > 0);
    await put("personnel", {
      ...perso,
      bandeau: asString(perso.bandeau) ?? DEFAULT_PERSONNEL_BANDEAU,
      zone_grise: [...existants, ...nouveaux],
    }, nouveaux.length > 0);
    if (nouveaux.length && notes.length) {
      await sb.from("fiche_notes").update({ integrated: true }).in("id", notes.map((n) => n.id));
    }
    // Idées éditoriales : passées en integree SEULEMENT ici, après l'écriture
    // des sections du deroule (le groupe des questions). Un échec plus haut a
    // déjà lancé : les idées restent en backlog et reviennent au prochain
    // passage, jamais d'oubli silencieux.
    await marqueIdeesIntegrees(sb, idees);
    const all = lienList(raw.sources);
    await mergeSources(sb, fiche, all);
    sourcesCount = all.length;
  }

  return { sections: written, sources: sourcesCount };
}

/** Met en file les jobs de génération d'une cible (sans doublon sur les jobs
 *  déjà en attente ou en cours). Renvoie le nombre de jobs ajoutés.
 *  Porte de qualification (chantier 3 du 27/07) : une cible de test, un
 *  placeholder ou une cible non qualifiée (archétype vide) ne déclenche
 *  aucune génération de fiche : l'erreur dit quoi faire. */
export async function enqueueFicheGeneration(
  sb: SB,
  cibleId: string,
  groupes: readonly FicheGroupe[] = FICHE_GROUPES
): Promise<number> {
  const { data: cibleRow } = await sb
    .from("cibles_enrichies")
    .select("nom, role, organisation, archetype")
    .eq("id", cibleId)
    .maybeSingle();
  if (cibleRow) {
    const motif = motifIneligibleGeneration(cibleRow as CibleGeneration, {
      test: await cibleEstTest(sb, cibleId),
      pourFiche: true,
    });
    if (motif) throw new Error(`Génération de fiche refusée : ${motif}.`);
  }
  const { data: encours } = await sb
    .from("enrichment_jobs")
    .select("objectif")
    .eq("cible_id", cibleId)
    .in("statut", ["pending", "running"]);
  const deja = new Set(((encours ?? []) as { objectif: string }[]).map((j) => j.objectif));
  const nouveaux = Array.from(new Set(groupes)).map((g) => `${FICHE_JOB_PREFIX}${g}`).filter((o) => !deja.has(o));
  if (nouveaux.length) {
    const { error } = await sb.from("enrichment_jobs").insert(nouveaux.map((objectif) => ({ cible_id: cibleId, objectif, apply: false })));
    if (error) throw new Error(error.message);
  }
  return nouveaux.length;
}

/** Pilules logistiques par défaut depuis la date (Europe/Paris) + studio GDIY. */
export function buildPilules(dateEnr: string | null): string[] {
  const pilules: string[] = [];
  if (dateEnr) {
    const label = new Date(dateEnr)
      .toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
      .toUpperCase()
      .replace(",", " ·");
    pilules.push(label);
  }
  pilules.push("STUDIO 71 · RDC SUR RUE", "2H30");
  return pilules;
}
