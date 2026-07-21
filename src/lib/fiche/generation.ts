// Génération des fiches structurées par deep research (contrat v2, Bloc A/B).
//
// La génération est découpée en QUATRE groupes de recherche, chacun étant un job
// asynchrone de la file enrichment_jobs (objectif "fiche:<groupe>") : un job = un
// appel de recherche web = quelques sections écrites. La fiche se remplit
// progressivement, dans le budget des fonctions Vercel.
//
//   portrait → entête, récit canonique (A2), 30 secondes (B1), parcours (B3), à lire (A6)
//   chiffres → mécanique du succès (A3), univers/marché (A4), en chiffres (B2)
//   angles   → entourage, anecdotes, tensions, questions récurrentes, personnel (A5)
//   deroule  → enjeu (A1), séquençage, 10 questions, zone grise
//
// Règles transverses (contrat §3) : filtre « surface vs mécanisme » ; interdits
// (SIREN, immatriculations, numéros professionnels, adresses) ; tout chiffre
// sourcé et daté (sinon zone grise) ; aucune URL reconstruite, vérification HTTP
// à la génération.

import { runWebSearchJSONVerbose, type WebSearchUsage } from "../ai/websearch";
import { hasAnthropicKey } from "../copilot/config";
import type { createServiceClient } from "../supabase/service";
import type { CibleEnrichie } from "../types";
import { writeSection, type FicheRow } from "./store";
import { asArray, asString, safeUrl, DEFAULT_PERSONNEL_BANDEAU, BUDGETS_V3 } from "./schema";

type SB = ReturnType<typeof createServiceClient>;
type Content = Record<string, unknown>;

export const FICHE_JOB_PREFIX = "fiche:";
// Contrat v3 : la cinquième passe « redaction » (rédacteur en chef) s'exécute
// APRÈS les quatre groupes de recherche et consolide la fiche entière
// (déduplication, réconciliation des chiffres, budgets, format scannable).
export const FICHE_GROUPES = ["portrait", "chiffres", "angles", "deroule", "redaction"] as const;
export const FICHE_GROUPES_RECHERCHE = ["portrait", "chiffres", "angles", "deroule"] as const;
export type FicheGroupe = (typeof FICHE_GROUPES)[number];

/** Règle 1 du contrat v3 : propriété unique des faits, injectée dans chaque
 *  prompt de recherche. */
const PROPRIETE_FAITS = [
  "PROPRIÉTÉ UNIQUE DES FAITS (contrat v3, règle 1) : chaque type de fait a UNE section propriétaire ; les autres y renvoient en une phrase courte, elles ne le réécrivent JAMAIS en entier.",
  "- Chronologie datée : propriété EXCLUSIVE de la section parcours. Interdiction de reconstruire une frise ou une liste de jalons datés ailleurs (ni dans le récit, ni dans l'univers, ni ailleurs).",
  "- Récit canonique : un paragraphe d'ouverture (5 lignes max) puis un récit en 7 temps maximum, chaque temps en UNE ligne. Aucune prose longue.",
  "- Univers : marché, fédérations, économie, distinctions UNIQUEMENT (4 points max hors graphiques). Aucune biographie.",
  "- Divergences de la mécanique : des DÉCISIONS structurantes, formulées comme décisions, jamais comme récit biographique.",
  "- Un fait cité une fois en version longue ; toute reprise est un renvoi court (« cf. parcours 2015 ») ou une omission.",
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
    "BUDGETS DE LONGUEUR (contrat v3, règle 2, DURS) : la fiche cible est scannable en fragments pendant l'enregistrement. Tout item destiné au Bloc B (console) tient en 3 lignes maximum (environ 240 caractères) : au delà, c'est un échec de génération, découpe ou raccourcis. La concision prime sur l'exhaustivité : un fait fort et court bat trois faits délayés.",
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
    .in("section_id", ["parcours", "chiffres"]);
  const par = new Map(((data ?? []) as { section_id: string; content: Content }[]).map((s) => [s.section_id, s.content ?? {}]));
  const morceaux: string[] = [];
  const lignes = asArray((par.get("parcours") ?? {}).lignes, (x) => {
    const annee = asString(x.annee); const texte = asString(x.texte);
    return annee && texte ? `${annee} ${texte}` : null;
  });
  if (lignes.length) morceaux.push(`Chronologie DÉJÀ POSÉE (propriété de la section parcours) :\n${lignes.map((l) => `- ${l}`).join("\n")}`);
  const kpis = asArray((par.get("chiffres") ?? {}).kpis, (x) => {
    const valeur = asString(x.valeur); const libelle = asString(x.libelle);
    return valeur && libelle ? `${libelle} = ${valeur}` : null;
  });
  if (kpis.length) morceaux.push(`Chiffres DÉJÀ POSÉS (propriété de la section chiffres, réutilise EXACTEMENT ces valeurs, n'en introduis pas de divergentes) :\n${kpis.map((k) => `- ${k}`).join("\n")}`);
  if (!morceaux.length) return "";
  return `\n\nFAITS DÉJÀ ATTRIBUÉS À LEURS SECTIONS PROPRIÉTAIRES. Interdiction de les réécrire en entier ; renvoi court autorisé.\n${morceaux.join("\n")}`;
}

/* ───────────────────────── types des réponses JSON ───────────────────────── */

interface LienJson { date?: string; titre?: string; apport?: string; url?: string; niveau?: string; temps_lecture?: string }

interface PortraitJson {
  sous_titre?: string;
  societe?: string;
  liens?: { label?: string; url?: string }[];
  recit?: string[];
  trente_secondes?: { label?: string; texte?: string }[];
  parcours?: { annee?: string; texte?: string }[];
  a_lire?: LienJson[];
  sources?: LienJson[];
}

interface ChiffresJson {
  mecanique?: {
    definition?: string;
    pairs?: { nom?: string; position?: string }[];
    divergences?: { date?: string; decision?: string; effet?: string }[];
    contrefactuel?: string;
  };
  univers_intro?: string[];
  distinctions?: string[];
  barres?: { titre?: string; note?: string; source?: string; valeurs?: { label?: string; affiche?: string; valeur?: number; plein?: boolean }[] };
  comparaison?: { titre?: string; source?: string; valeurs?: { nom?: string; affiche?: string; pct?: number; hero?: boolean }[] };
  rentabilite?: { titre?: string; note?: string; source?: string; valeurs?: { label?: string; affiche?: string; pct?: number }[] };
  timeline?: { titre?: string; jalons?: { annee?: string; titre?: string; texte?: string; cle?: boolean }[] };
  kpis?: { valeur?: string; libelle?: string; source?: string }[];
  sources?: LienJson[];
}

interface AnglesJson {
  playbook?: { titre?: string; connu?: string; manque?: string; question?: string }[];
  entourage?: { nom?: string; role?: string; texte?: string }[];
  anecdotes?: { texte?: string; source?: string; cachee?: boolean }[];
  tensions?: { a?: string; b?: string; angle?: string }[];
  questions_recurrentes?: { question?: string; reponse?: string }[];
  personnel?: { texte?: string; source?: string }[];
  sources?: LienJson[];
}

interface DerouleJson {
  enjeu?: string;
  lecon?: string;
  sequencage?: { debut_min?: number; fin_min?: number; court?: string; titre?: string; intention?: string; mode?: string; rappel_label?: string; rappel?: string }[];
  dix_questions?: { num?: string; bloc?: number; texte?: string; note?: string }[];
  zone_grise?: { texte?: string; origine?: string }[];
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
      systemFor("Mission : le RÉCIT CANONIQUE et la matière de lecture, format v3. Le récit : UN paragraphe d'ouverture (5 lignes max) pour la lecture de préparation, puis le récit en 7 TEMPS maximum, chaque temps en UNE ligne : le lecteur reformule la trajectoire de mémoire à partir de ces temps, pas d'une prose longue. Le PARCOURS daté (12 lignes max) est la section PROPRIÉTAIRE de toute la chronologie : les dates vivent là et nulle part ailleurs. Plus les 30 secondes avant d'entrer, et la liste À LIRE limitée aux 3 MEILLEURES sources (pas huit)."),
      `${intro}\n\nRenvoie un objet JSON : {\n  "sous_titre": "une phrase : qui il est, pourquoi maintenant",\n  "societe": "sa société ou structure principale",\n  "liens": [{"label": "LinkedIn", "url": "..."}, {"label": "Wikipedia", "url": "..."}] (seulement si réellement trouvés),\n  "recit": ["paragraphe d'ouverture, 5 lignes max", "temps 1, une ligne", "temps 2, une ligne", ...] (1 ouverture + 7 temps MAXIMUM, AUCUNE donnée d'annuaire, AUCUNE frise datée : les dates vont dans parcours),\n  "trente_secondes": [{"label": "Qui", "texte": "..."}, {"label": "Fait d'armes", "texte": "..."}, {"label": "Pourquoi maintenant", "texte": "..."}, {"label": "État d'esprit", "texte": "..."}] (chaque texte : 3 lignes max),\n  "parcours": [{"annee": "1999", "texte": "ligne sans point final, sans donnée d'annuaire"}] (12 lignes MAXIMUM, section propriétaire de la chronologie),\n  "a_lire": [3 MAXIMUM : {"niveau": "indispensable|utile|optionnel", "titre", "date", "temps_lecture": "12 min", "apport": "en une phrase", "url"}],\n  "sources": [tous les liens consultés : {"date", "titre", "apport", "url"}]\n}`,
      maxSearches, model, 8192
    );
    compte(r.usage);
    const raw = r.json;
    if (!raw) throw new Error(`Recherche portrait sans JSON exploitable (stop: ${r.stop ?? "?"}). Début de la réponse : ${r.text.slice(0, 260) || "(vide)"}`);
    // Budget v3 : 1 ouverture + 7 temps maximum (clamp dur au parsing).
    const recit = (raw.recit ?? [])
      .filter((p): p is string => typeof p === "string" && !!p.trim())
      .slice(0, BUDGETS_V3.recit_ouverture + BUDGETS_V3.recit_temps);
    const trente = asArray(raw.trente_secondes, (x) => {
      const label = asString(x.label); const texte = asString(x.texte);
      return label && texte ? { label, texte } : null;
    });
    const parcours = asArray(raw.parcours, (x) => {
      const annee = asString(x.annee); const texte = asString(x.texte);
      return annee && texte ? { annee, texte } : null;
    }).slice(0, BUDGETS_V3.parcours_lignes);
    const aLire = await verifiedLinks(lienList(raw.a_lire), BUDGETS_V3.a_lire_sources);
    const liens = await verifiedLinks(
      asArray(raw.liens, (x) => {
        const label = asString(x.label); const url = safeUrl(x.url);
        return label && url ? { label, url } : null;
      }),
      4
    );
    const { data: entRow } = await sb.from("fiche_sections").select("content").eq("fiche_id", fiche.id).eq("section_id", "entete").maybeSingle();
    const entete = (((entRow as { content?: Content } | null)?.content) ?? {}) as Content;
    const pilules = Array.isArray(entete.pilules) && entete.pilules.length ? entete.pilules : buildPilules(fiche.date_enregistrement);
    await put("entete", { ...entete, sous_titre: asString(raw.sous_titre) ?? entete.sous_titre, societe: asString(raw.societe) ?? entete.societe, liens: liens.length ? liens : entete.liens, pilules }, true);
    await put("sticky_header", { societe: asString(raw.societe) }, !!asString(raw.societe));
    await put("recit_canonique", { paragraphes: recit }, recit.length > 0);
    await put("trente_secondes", { items: trente }, trente.length > 0);
    await put("parcours", { lignes: parcours }, parcours.length > 0);
    await put("a_lire", { liens: aLire }, aLire.length > 0);
    const all = lienList(raw.sources);
    await mergeSources(sb, fiche, all);
    sourcesCount = all.length;
  }

  if (groupe === "chiffres") {
    const dejaPose = await faitsDejaPoses(sb, fiche.id);
    const r = await runWebSearchJSONVerbose<ChiffresJson>(
      systemFor("Mission : la MÉCANIQUE DU SUCCÈS (cœur de la fiche), l'UNIVERS et les CHIFFRES. Mécanique : en quoi il est le meilleur de son univers avec une métrique explicite, ses pairs et concurrents nommés avec positionnement relatif, 3 à 5 points de divergence datés formulés comme DÉCISIONS (les décisions structurantes qui ont fait décrocher sa trajectoire de celle de ses pairs, jamais un récit biographique), et un contrefactuel signalé comme raisonnement. Univers (couche B, SUBORDONNÉE à la mécanique personnelle) : marché, fédérations, économie et distinctions UNIQUEMENT, en 4 POINTS MAXIMUM hors graphiques ; AUCUNE timeline biographique, la chronologie appartient au parcours. Les graphiques chiffrés (barres, comparaisons) sont la valeur de la section. Chiffres : 8 à 15 données clés sourcées et datées, mélange invité + univers, JAMAIS vide, et UNE SEULE valeur par fait : si les sources divergent, retiens la mieux sourcée et n'en cite qu'une."),
      `${intro}${dejaPose}\n\nRenvoie un objet JSON : {\n  "mecanique": {\n    "definition": "en quoi il est le meilleur, métrique explicite (taux, palmarès, part de marché, influence mesurable)",\n    "pairs": [2 à 5 : {"nom": "pair ou concurrent", "position": "positionnement relatif de l'invité"}],\n    "divergences": [3 à 5 : {"date": "2012", "decision": "la DÉCISION structurante, formulée comme décision", "effet": "ce qu'elle a produit"}],\n    "contrefactuel": "ce qui serait arrivé sans ces décisions (raisonnement, pas un fait)"\n  },\n  "univers_intro": ["4 points MAXIMUM, une à deux lignes chacun : marché, économie, acteurs, tendances (chiffres sourcés dans le texte). AUCUNE biographie."],\n  "distinctions": ["0 à 3 : distinction sectorielle à tenir, ex. la biopharma n'est pas la MedTech : dispositifs vs molécules, cycle court vs dix ans"],\n  "barres": {"titre", "note", "source", "valeurs": [{"label": "24", "affiche": "9,9", "valeur": 9.9, "plein": true}]} (si données chiffrées multi-années disponibles),\n  "comparaison": {"titre", "source", "valeurs": [{"nom", "affiche": "+125 %", "pct": 125, "hero": true (l'invité)}]} (si comparaison vérifiable),\n  "rentabilite": {"titre", "note", "source", "valeurs": [{"label": "2024", "affiche": "37 %", "pct": 37}]} (si pertinent),\n  "kpis": [8 à 15 : {"valeur": "9,9 Md€", "libelle": "CA groupe 2024", "source": "source, datée"}] (mélange invité + univers, source OBLIGATOIRE, une seule valeur par fait),\n  "sources": [{"date", "titre", "apport", "url"}]\n}`,
      maxSearches, model, 8192
    );
    compte(r.usage);
    const raw = r.json;
    if (!raw) throw new Error(`Recherche mécanique/chiffres sans JSON exploitable (stop: ${r.stop ?? "?"}). Début de la réponse : ${r.text.slice(0, 260) || "(vide)"}`);
    const mecanique: Content = {};
    if (raw.mecanique) {
      const m = raw.mecanique;
      const pairs = asArray(m.pairs, (x) => {
        const nom = asString(x.nom);
        return nom ? { nom, position: asString(x.position) } : null;
      });
      const divergences = asArray(m.divergences, (x) => {
        const date = asString(x.date); const decision = asString(x.decision);
        return date && decision ? { date, decision, effet: asString(x.effet) } : null;
      });
      if (asString(m.definition)) mecanique.definition = asString(m.definition);
      if (pairs.length) mecanique.pairs = pairs;
      if (divergences.length) mecanique.divergences = divergences;
      if (asString(m.contrefactuel)) mecanique.contrefactuel = asString(m.contrefactuel);
    }
    await put("mecanique_succes", mecanique, Object.keys(mecanique).length > 0);

    const univers: Content = {};
    // Budget v3 : 4 points de marché maximum ; la timeline biographique est
    // RETIRÉE de la section (la chronologie appartient au parcours, règle 1).
    const intro2 = (raw.univers_intro ?? [])
      .filter((p): p is string => typeof p === "string" && !!p.trim())
      .slice(0, BUDGETS_V3.univers_points);
    if (intro2.length) univers.intro = intro2;
    const distinctions = (raw.distinctions ?? []).filter((p): p is string => typeof p === "string" && !!p.trim());
    if (distinctions.length) univers.distinctions = distinctions;
    if (raw.barres?.titre && Array.isArray(raw.barres.valeurs) && raw.barres.valeurs.length) univers.barres = raw.barres;
    if (raw.comparaison && Array.isArray(raw.comparaison.valeurs) && raw.comparaison.valeurs.length) univers.comparaison = raw.comparaison;
    if (raw.rentabilite && Array.isArray(raw.rentabilite.valeurs) && raw.rentabilite.valeurs.length) univers.rentabilite = raw.rentabilite;
    await put("univers", univers, Object.keys(univers).length > 0);

    const kpis = asArray(raw.kpis, (x) => {
      const valeur = asString(x.valeur); const libelle = asString(x.libelle); const source = asString(x.source);
      // Pas de chiffre sans source hors zone grise : carte sans source écartée.
      return valeur && libelle && source ? { valeur, libelle, source } : null;
    });
    await put("chiffres", { kpis: kpis.slice(0, 15) }, kpis.length > 0);
    const all = lienList(raw.sources);
    await mergeSources(sb, fiche, all);
    sourcesCount = all.length;
  }

  if (groupe === "angles") {
    const notes = await pendingNotes(sb, fiche.id);
    const notesTxt = notes.length
      ? `\n\nNotes internes de l'équipe (NON vérifiées, ne les présente jamais comme des faits, elles peuvent nourrir un angle) :\n${notes.map((n) => `- ${n.text}${n.source ? ` (${n.source})` : ""}`).join("\n")}`
      : "";
    const dejaPose = await faitsDejaPoses(sb, fiche.id);
    const r = await runWebSearchJSONVerbose<AnglesJson>(
      systemFor("Mission : la matière éditoriale de l'interview, format SCANNABLE (Bloc B, lu en studio : listes courtes, jamais de pavés, aucun item de plus de 3 lignes). Le PLAYBOOK est la section reine : 6 LEVIERS MAXIMUM, répartis sur les trois familles de mécaniques (action, réflexion, innovation), calibrés sur l'archétype. Pour chaque levier, trois puces COURTES de 2 lignes maximum chacune : ce que les sources établissent, ce qui reste opaque, et la question qui FORCE l'invité à révéler la mécanique (critère, seuil, arbitrage ou cas précis, jamais une réponse d'article). Plus l'entourage professionnel (mentors, associés, rencontres pivots), les anecdotes publiques peu connues (à faire raconter de vive voix), les axes de conversation qui mettent en regard deux faits publics vérifiés, les questions qu'il a déjà eues partout (pour ne pas les reposer), et le PERSONNEL : situation familiale, épreuves, passions, UNIQUEMENT si publiquement raconté, avec la source publique pour CHAQUE élément (élément sans source = exclu)."),
      `${intro}${dejaPose}${notesTxt}\n\nRenvoie un objet JSON : {\n  "playbook": [6 MAXIMUM, couvrant action, réflexion ET innovation : {"titre": "le levier", "connu": "ce que les sources établissent, 2 lignes max", "manque": "ce qui reste opaque, 2 lignes max", "question": "la question qui force la mécanique (critère, seuil, arbitrage, cas précis), tutoiement, sans point final, 2 lignes max"}],\n  "entourage": [3 à 5 : {"nom", "role", "texte": "pourquoi il compte, la question à en tirer, 3 lignes max"}],\n  "anecdotes": [3 à 6 : {"texte": "3 lignes max", "source": "où elle a été racontée, datée", "cachee": true si peu connue}],\n  "tensions": [2 à 4 : {"a": "Position exprimée : ...", "b": "Fait public : ...", "angle": "comment mettre les deux en regard avec bienveillance"}],\n  "questions_recurrentes": [4 à 6 : {"question": "déjà posée partout", "reponse": "sa réponse habituelle en une ligne"}],\n  "personnel": [0 à 5 : {"texte": "élément personnel PUBLIC (famille, épreuve, passion)", "source": "source publique datée, OBLIGATOIRE"}],\n  "sources": [{"date", "titre", "apport", "url"}]\n}`,
      maxSearches, model, 8192
    );
    compte(r.usage);
    const raw = r.json;
    if (!raw) throw new Error(`Recherche angles sans JSON exploitable (stop: ${r.stop ?? "?"}). Début de la réponse : ${r.text.slice(0, 260) || "(vide)"}`);
    const playbook = asArray(raw.playbook, (x) => {
      const titre = asString(x.titre);
      return titre ? { titre, connu: asString(x.connu), manque: asString(x.manque), question: asString(x.question) } : null;
    }).slice(0, BUDGETS_V3.playbook_items);
    const entourage = asArray(raw.entourage, (x) => {
      const nom = asString(x.nom);
      return nom ? { nom, role: asString(x.role), texte: asString(x.texte) } : null;
    });
    const anecdotes = asArray(raw.anecdotes, (x) => {
      const texte = asString(x.texte);
      return texte ? { texte, source: asString(x.source), cachee: x.cachee === true } : null;
    });
    const tensions = asArray(raw.tensions, (x) => {
      const a = asString(x.a); const b = asString(x.b);
      return a && b ? { a, b, angle: asString(x.angle) } : null;
    });
    const recurrentes = asArray(raw.questions_recurrentes, (x) => {
      const question = asString(x.question);
      return question ? { question, reponse: asString(x.reponse) } : null;
    });
    // A5 Personnel : source publique OBLIGATOIRE par élément (sinon exclu).
    const personnel = asArray(raw.personnel, (x) => {
      const texte = asString(x.texte); const source = asString(x.source);
      return texte && source ? { texte, source } : null;
    });
    await put("playbook", { items: playbook }, playbook.length > 0);
    await put("entourage", { personnes: entourage }, entourage.length > 0);
    await put("anecdotes", { items: anecdotes }, anecdotes.length > 0);
    await put("tensions", { cartes: tensions }, tensions.length > 0);
    await put("questions_recurrentes", { items: recurrentes }, recurrentes.length > 0);
    await put("personnel", { bandeau: DEFAULT_PERSONNEL_BANDEAU, items: personnel }, personnel.length > 0);
    const all = lienList(raw.sources);
    await mergeSources(sb, fiche, all);
    sourcesCount = all.length;
  }

  if (groupe === "deroule") {
    const notes = await pendingNotes(sb, fiche.id);
    const notesTxt = notes.length
      ? `\n\nNotes internes NON vérifiées (chacune doit finir en zone grise avec son origine, formulée « à faire dire par l'invité ») :\n${notes.map((n) => `- ${n.text}${n.source ? ` (origine : ${n.source})` : ""}`).join("\n")}`
      : "";
    const { data: pbRow } = await sb.from("fiche_sections").select("content").eq("fiche_id", fiche.id).eq("section_id", "playbook").maybeSingle();
    const pb = (((pbRow as { content?: Content } | null)?.content ?? {}) as { items?: { titre?: string }[] }).items ?? [];
    const pbTxt = pb.length ? `\n\nPlaybook déjà identifié (à faire vivre dans le déroulé) : ${pb.map((p) => p.titre).filter(Boolean).join(" · ")}` : "";
    const dejaPose = await faitsDejaPoses(sb, fiche.id);
    const r = await runWebSearchJSONVerbose<DerouleJson>(
      systemFor("Mission : le DÉROULÉ de l'épisode, structuré par les trois couches. L'enjeu : la promesse de DYNAMIQUE (pas le sujet de domaine), le risque principal (souvent le jargon ou le pitch défensif), et la LEÇON TRANSFÉRABLE explicitement nommée (ce qu'un auditeur étranger au domaine emporte et applique). Le séquençage : 6 à 8 blocs sur 150 minutes, environ 60 % du temps sur la mécanique personnelle, alterner récit et extraction, placer UN bloc de pédagogie courte au milieu, ancré sur un cas concret (jamais abstrait), monter en intimité vers la fin, clore sur la leçon transférable. Les 10 questions : majorité en comment, chacune rattachée à son bloc ; AU PLUS 3 sur 10 portent sur le domaine, les autres sur la personne (arbitrage de densité). La zone grise : les éléments issus des notes internes, à faire confirmer de vive voix."),
      `${intro}${dejaPose}${pbTxt}${notesTxt}\n\nRenvoie un objet JSON : {\n  "enjeu": "5 lignes max : la promesse de dynamique, le risque principal",\n  "lecon": "la leçon transférable, une à deux phrases, explicite",\n  "sequencage": [6 à 8 blocs : {"debut_min": 0, "fin_min": 20, "court": "chip court", "titre": "titre du bloc", "intention": "...", "mode": "RÉCIT · ÉMOTION | EXTRACTION · LE COMMENT | PÉDAGOGIE · ANCRÉE | PROFONDEUR · INTIMITÉ | EXTRACTION · CLOSE", "rappel_label": "ZONE GRISE | CHIFFRE | DISTINCTION | REGARD CROISÉ (optionnel)", "rappel": "texte du rappel (optionnel)"}],\n  "dix_questions": [10, au plus 3 sur le domaine : {"num": "01", "bloc": index du bloc (0-based), "texte": "question courte, tutoiement, sans point final", "note": "RELANCE : ... · CHIFFRE À DEMANDER : ... · AVEC TACT : ..."}],\n  "zone_grise": [{"texte": "à faire confirmer par l'invité", "origine": "note Matthieu / écho non recoupé"}],\n  "sources": [{"date", "titre", "apport", "url"}]\n}`,
      maxSearches, model, 8192
    );
    compte(r.usage);
    const raw = r.json;
    if (!raw) throw new Error(`Recherche déroulé sans JSON exploitable (stop: ${r.stop ?? "?"}). Début de la réponse : ${r.text.slice(0, 260) || "(vide)"}`);
    const blocs = asArray(raw.sequencage, (x) => {
      const titre = asString(x.titre);
      if (!titre) return null;
      return {
        debut_min: typeof x.debut_min === "number" ? x.debut_min : 0,
        fin_min: typeof x.fin_min === "number" ? x.fin_min : 150,
        court: asString(x.court) ?? titre,
        titre,
        intention: asString(x.intention),
        mode: asString(x.mode),
        rappel_label: asString(x.rappel_label),
        rappel: asString(x.rappel),
      };
    });
    const questions = asArray(raw.dix_questions, (x) => {
      const texte = asString(x.texte);
      if (!texte) return null;
      return { num: asString(x.num), bloc: typeof x.bloc === "number" ? x.bloc : undefined, texte, note: asString(x.note) };
    });
    const zone = asArray(raw.zone_grise, (x) => {
      const texte = asString(x.texte);
      return texte ? { texte, origine: asString(x.origine) } : null;
    });
    await put("enjeu", { texte: asString(raw.enjeu), lecon: asString(raw.lecon) }, !!asString(raw.enjeu) || !!asString(raw.lecon));
    await put("sequencage", { blocs }, blocs.length > 0);
    await put("dix_questions", { questions }, questions.length > 0);
    await put("zone_grise", { items: zone }, zone.length > 0);
    if (zone.length && notes.length) {
      await sb.from("fiche_notes").update({ integrated: true }).in("id", notes.map((n) => n.id));
    }
    const all = lienList(raw.sources);
    await mergeSources(sb, fiche, all);
    sourcesCount = all.length;
  }

  return { sections: written, sources: sourcesCount };
}

/** Met en file les jobs de génération d'une cible (sans doublon sur les jobs
 *  déjà en attente ou en cours). Renvoie le nombre de jobs ajoutés. */
export async function enqueueFicheGeneration(
  sb: SB,
  cibleId: string,
  groupes: readonly FicheGroupe[] = FICHE_GROUPES
): Promise<number> {
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
