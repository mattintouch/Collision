// /fiches/{slug} : rendu de la fiche de préparation, template v4 (maquette
// Clémence validée le 31/08, Fiche_Prepa_GDIY_Dimitri_Rassam_v3.html).
// Lecture via service role (page derrière l'auth de l'app). Le serveur coerce
// le JSON de chaque section vers le contrat de rendu ; toute section vide ou
// non applicable est absente de la page. Compatibilité descendante : une
// fiche v3.1 se rend sans erreur (blocs v4 absents ou en repli), une fiche
// d'un contrat antérieur non migrée reste lisible via un bloc compact.

import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { kickQueue } from "@/lib/enrichment/jobs";
import type { ConsoleEvent, RecSession } from "@/lib/fiche/console";
import { FICHE_JOB_PREFIX } from "@/lib/fiche/generation";
import { resolveFiche, ficheSections, seedSections } from "@/lib/fiche/store";
import {
  asArray, asNumber, asString, asStringArray, safeUrl, isEmptyContent,
  DEFAULT_CHECKLIST, DEFAULT_CHECKLIST_POST,
} from "@/lib/fiche/schema";
import { SECTIONS_OBLIGATOIRES } from "@/lib/fiche/sections";
import FicheView, { type FicheViewData, type FicheQuestion, type ALireLien, type MarcheGraphView } from "./FicheView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La page draine la file (kickQueue/waitUntil) : la fonction doit vivre au-delà
// de la réponse pour finir les jobs.
export const maxDuration = 300;

type Content = Record<string, unknown>;
const pad2 = (n: number) => String(n).padStart(2, "0");

function aLireLiens(v: unknown): ALireLien[] {
  return asArray(v, (x) => {
    const titre = asString(x.titre);
    if (!titre) return null;
    const niveau = asString(x.niveau);
    return {
      niveau: niveau === "indispensable" || niveau === "utile" || niveau === "optionnel" ? niveau : undefined,
      titre,
      date: asString(x.date),
      temps_lecture: asString(x.temps_lecture),
      apport: asString(x.apport),
      url: safeUrl(x.url),
      embargo: x.embargo === true,
    } as ALireLien;
  });
}

/** Âge à la date d'enregistrement (sinon aujourd'hui), depuis une date ISO. */
function ageA(dateNaissance?: string, dateRef?: string | null): number | undefined {
  if (!dateNaissance) return undefined;
  const naissance = new Date(dateNaissance);
  if (isNaN(naissance.getTime())) return undefined;
  const ref = dateRef ? new Date(dateRef) : new Date();
  if (isNaN(ref.getTime())) return undefined;
  let age = ref.getFullYear() - naissance.getFullYear();
  const anniversairePasse =
    ref.getMonth() > naissance.getMonth() ||
    (ref.getMonth() === naissance.getMonth() && ref.getDate() >= naissance.getDate());
  if (!anniversairePasse) age -= 1;
  return age >= 0 && age < 130 ? age : undefined;
}

/** Coercition des graphs marché v4 (barres CSS pures, sourcées). */
function marcheGraphs(v: unknown): MarcheGraphView[] {
  return asArray(v, (x) => {
    const titre = asString(x.titre);
    const valeurs = asArray(x.valeurs, (b) => {
      const label = asString(b.label);
      const valeur = asNumber(b.valeur);
      if (!label || valeur === undefined) return null;
      return {
        label,
        valeur,
        affiche: asString(b.affiche) ?? String(valeur),
        valeur2: asNumber(b.valeur2),
        affiche2: asString(b.affiche2),
        accent: asString(b.accent),
        legende: asString(b.legende),
      };
    });
    if (!titre || !valeurs.length) return null;
    const legende = x.legende && typeof x.legende === "object" ? (x.legende as Content) : null;
    return {
      titre,
      sous_titre: asString(x.sous_titre),
      type: asString(x.type) === "barres_jumelees" ? "barres_jumelees" as const : "barres" as const,
      valeurs,
      legende: legende ? { serie1: asString(legende.serie1), serie2: asString(legende.serie2) } : undefined,
      callout: asString(x.callout),
      source: asString(x.source),
    };
  });
}

export default async function FichePage({ params }: { params: { slug: string } }) {
  const sb = createServiceClient();
  const fiche = await resolveFiche(sb, params.slug);
  if (!fiche) notFound();
  kickQueue(); // lecture chaude : recharger la fiche draine la génération en cours

  // Console partagée (lot A, migration 0041) : événements + sessions REC.
  // Défensif : tables absentes → console vide, la fiche se rend quand même.
  let consoleEvents: ConsoleEvent[] = [];
  let recSessions: RecSession[] = [];
  try {
    const { data: evs } = await sb
      .from("fiche_console_events")
      .select("id, session_id, created_at, author_email, kind, timecode, payload")
      .eq("fiche_id", fiche.id)
      .order("created_at")
      .limit(2000);
    consoleEvents = (evs ?? []) as ConsoleEvent[];
    const { data: ss } = await sb
      .from("fiche_rec_sessions")
      .select("id, started_at, ended_at, started_by, ended_by, email_envoye_at")
      .eq("fiche_id", fiche.id)
      .order("started_at");
    recSessions = (ss ?? []) as RecSession[];
  } catch {
    /* migration 0041 non appliquée */
  }
  // Identité du lecteur : résolue côté serveur depuis la session (A1.1).
  const { data: auth } = await createAuthClient().auth.getUser();
  const viewerEmail = auth.user?.email ?? "";

  // Multi-show latent (contrainte 4) : l'eyebrow porte le show de la fiche.
  let showLabel = "GDIY";
  if (fiche.show_id) {
    const { data: show } = await sb.from("shows").select("slug, nom").eq("id", fiche.show_id).maybeSingle();
    const s = show as { slug?: string; nom?: string } | null;
    showLabel = (s?.slug ?? s?.nom ?? "GDIY").toUpperCase();
  }

  // Semis idempotent : les sections ajoutées au catalogue depuis la création
  // de la fiche existent, l'ordre suit le catalogue, les retirées ne sont
  // jamais semées.
  await seedSections(sb, fiche.id);
  const sections = await ficheSections(sb, fiche.id);
  const c = new Map<string, Content>(sections.map((s) => [s.section_id, (s.content ?? {}) as Content]));
  const get = (id: string): Content => c.get(id) ?? {};

  // Gate anti fiche vide : une section obligatoire (v3.1) vide rend la fiche
  // non présentable, SAUF si la fiche porte encore du contenu des contrats
  // précédents (fiche non migrée : elle reste lisible via le repli compact).
  const contenuLegacy = ["mecanique_succes", "chiffres", "dix_questions", "recit_canonique"]
    .some((id) => !isEmptyContent(c.get(id)));
  const incompletes = contenuLegacy ? [] : SECTIONS_OBLIGATOIRES.filter((id) => isEmptyContent(c.get(id)));

  // Journal de génération (contrat §3.6) : dernier état par groupe.
  let generation: { groupe: string; statut: string; error?: string; quand?: string }[] = [];
  if (fiche.cible_id) {
    const { data: jobs } = await sb
      .from("enrichment_jobs")
      .select("objectif, statut, error, updated_at")
      .eq("cible_id", fiche.cible_id)
      .like("objectif", `${FICHE_JOB_PREFIX}%`)
      .order("updated_at", { ascending: false })
      .limit(20);
    const derniers = new Map<string, { groupe: string; statut: string; error?: string; quand?: string }>();
    for (const j of ((jobs ?? []) as { objectif: string; statut: string; error: string | null; updated_at: string }[])) {
      const groupe = j.objectif.slice(FICHE_JOB_PREFIX.length);
      if (!derniers.has(groupe)) derniers.set(groupe, { groupe, statut: j.statut, error: j.error ?? undefined, quand: j.updated_at });
    }
    generation = Array.from(derniers.values());
  }

  const identite = get("identite");
  const dateNaissance = asString(identite.date_naissance);

  // data (04) : KPI, graphs v3.1, marché, et v4 (marche_graphs, lexique).
  // Les visuels des fiches non migrées vivent encore dans univers : repli.
  const dataSec = get("data");
  const universLegacy = get("univers");
  const barres = (dataSec.barres ?? universLegacy.barres ?? null) as Content | null;
  const comparaison = (dataSec.comparaison ?? universLegacy.comparaison ?? null) as Content | null;
  const rentabilite = (dataSec.rentabilite ?? universLegacy.rentabilite ?? null) as Content | null;
  const marche = (dataSec.marche ?? null) as Content | null;

  const perso = get("personnel");
  const topicsSec = get("topics");

  // Questions cœur des topics : numérotation continue si la génération l'a
  // omise (le tap raye avec timecode, l'état partagé est indexé par num).
  let numCourant = 0;
  const topics = asArray(topicsSec.topics, (x) => {
    const titre = asString(x.titre);
    if (!titre) return null;
    const questions: FicheQuestion[] = asArray(x.questions, (q) => {
      const texte = asString(q.texte);
      if (!texte) return null;
      numCourant += 1;
      // v4 : la note tactique et le zg sont TOLÉRÉS en lecture, jamais rendus.
      return { num: asString(q.num) ?? pad2(numCourant), texte, clip: q.clip === true };
    });
    const extras = x.extras && typeof x.extras === "object" ? (x.extras as Content) : null;
    const hero = x.hero && typeof x.hero === "object" ? (x.hero as Content) : null;
    const heroValeur = hero ? asString(hero.valeur) : undefined;
    return {
      titre,
      intention: asString(x.intention),
      contexte: asString(x.contexte),
      dates: asStringArray(x.dates),
      citations: asStringArray(x.citations),
      hero: heroValeur ? { valeur: heroValeur, libelle: asString(hero!.libelle) } : undefined,
      extras: extras ? { titre: asString(extras.titre), items: asStringArray(extras.items) } : undefined,
      reflexions: asStringArray(x.reflexions),
      pleine_largeur: x.pleine_largeur === true,
      questions,
    };
  });

  const rdp = get("revue_de_presse");
  const clipsSec = get("clips");
  const piquantes = asStringArray(clipsSec.piquantes);
  const cbApprentissages = asStringArray(clipsSec.apprentissages);

  // Sources complètes (fold « Toutes les sources consultées ») : titres seuls.
  const sourcesTitres = asArray(get("sources").liens, (x) => asString(x.titre) ?? asString(x.title) ?? null);

  // Zones grises : v3.1 (personnel.zone_grise) + éventuel reliquat de la
  // section retirée zone_grise (fiches non migrées), fusionnés au rendu.
  const zonesGrises = [
    ...asArray(perso.zone_grise, (x) => {
      const texte = asString(x.texte);
      return texte ? { sujet: asString(x.sujet), id: asString(x.id), texte, origine: asString(x.origine) } : null;
    }),
    ...asArray(get("zone_grise").items, (x) => {
      const texte = asString(x.texte);
      return texte ? { sujet: asString(x.sujet), id: asString(x.id), texte, origine: asString(x.origine) } : null;
    }),
  ];

  const data: FicheViewData = {
    slug: fiche.slug,
    fiche_id: fiche.id,
    viewer_email: viewerEmail,
    console_events: consoleEvents,
    rec_sessions: recSessions,
    invite_nom: fiche.invite_nom,
    statut: fiche.statut,
    version: fiche.version,
    show_label: showLabel,
    generation,
    incompletes: [...incompletes],
    identite: {
      numero: asString(identite.numero),
      societe: asString(get("sticky_header").societe) ?? asString(identite.societe),
      sous_titre: asString(identite.sous_titre),
      pilules: asStringArray(identite.pilules),
      liens: asArray(identite.liens, (x) => {
        const label = asString(x.label);
        const url = safeUrl(x.url);
        return label && url ? { label, url } : null;
      }),
      age: ageA(dateNaissance, fiche.date_enregistrement),
      accompagnants: asArray(identite.accompagnants, (x) => {
        const nom = asString(x.nom);
        return nom ? { nom, fonction: asString(x.fonction) } : null;
      }),
      mise_en_relation: (() => {
        const m = identite.mise_en_relation;
        if (!m || typeof m !== "object") return undefined;
        const qui = asString((m as Content).qui);
        const canal = asString((m as Content).canal);
        return qui || canal ? { qui, canal } : undefined;
      })(),
    },
    checklist: (() => {
      // v4 : sept gestes fixes ; une liste stockée d'une autre longueur
      // (fiches v3.1 à cinq items) retombe sur le défaut du contrat.
      const items = asStringArray(get("checklist_prerec").items);
      return items.length === DEFAULT_CHECKLIST.length ? items : DEFAULT_CHECKLIST;
    })(),
    checklist_post: DEFAULT_CHECKLIST_POST,
    tldr: asArray(get("tldr").items, (x) => {
      const texte = asString(x.texte);
      const label = asString(x.label);
      return texte && label ? { label, texte } : null;
    }),
    timeline: asArray(rdp.palmares, (x) => {
      const texte = asString(x.texte);
      return texte ? { date: asString(x.date), texte } : null;
    }),
    kpis: asArray(dataSec.kpis, (x) => {
      const valeur = asString(x.valeur);
      const libelle = asString(x.libelle);
      return valeur && libelle ? { valeur, libelle, source: asString(x.source), zg: asString(x.zg) } : null;
    }),
    visuels: {
      barres: barres && asString(barres.titre)
        ? {
            titre: asString(barres.titre)!,
            note: asString(barres.note),
            source: asString(barres.source),
            valeurs: asArray(barres.valeurs, (x) => {
              const label = asString(x.label);
              const valeur = asNumber(x.valeur);
              return label && valeur !== undefined
                ? { label, affiche: asString(x.affiche) ?? String(valeur), valeur, plein: x.plein === true }
                : null;
            }),
          }
        : undefined,
      comparaison: comparaison
        ? {
            titre: asString(comparaison.titre),
            source: asString(comparaison.source),
            valeurs: asArray(comparaison.valeurs, (x) => {
              const nom = asString(x.nom);
              const pct = asNumber(x.pct);
              return nom && pct !== undefined
                ? { nom, affiche: asString(x.affiche) ?? `${pct > 0 ? "+" : ""}${pct} %`, pct, hero: x.hero === true }
                : null;
            }),
          }
        : undefined,
      rentabilite: rentabilite
        ? {
            titre: asString(rentabilite.titre),
            note: asString(rentabilite.note),
            source: asString(rentabilite.source),
            valeurs: asArray(rentabilite.valeurs, (x) => {
              const label = asString(x.label);
              const pct = asNumber(x.pct);
              return label && pct !== undefined ? { label, affiche: asString(x.affiche) ?? `${pct} %`, pct } : null;
            }),
          }
        : undefined,
    },
    marche_graphs: marcheGraphs(dataSec.marche_graphs),
    lexique: asArray(dataSec.lexique, (x) => {
      const terme = asString(x.terme);
      const definition = asString(x.definition);
      return terme && definition ? { terme, definition } : null;
    }),
    marche: marche
      ? {
          texte: asString(marche.texte),
          comparables: asArray(marche.comparables, (x) => {
            const nom = asString(x.nom);
            return nom ? { nom, position: asString(x.position) } : null;
          }),
        }
      : null,
    terrain_connu: asArray(topicsSec.terrain_connu, (x) => {
      const question = asString(x.question);
      return question ? { question, reponse: asString(x.reponse), depassement: asString(x.depassement) } : null;
    }),
    topics,
    clickbait: piquantes.length || cbApprentissages.length ? { piquantes, apprentissages: cbApprentissages } : null,
    clips_legacy: asArray(clipsSec.questions, (x) => {
      const question = asString(x.question);
      if (!question) return null;
      const meta =
        asString(x.meta) ??
        [asString(x.ressort)?.replace("_", "-").toUpperCase(), asString(x.clip)].filter(Boolean).join(" · ");
      return { question, meta: meta || undefined, fache: x.fache === true };
    }),
    apprentissages: {
      intro: asString(get("apprentissages").intro),
      items: asArray(get("apprentissages").items, (x) => {
        const titre = asString(x.titre);
        return titre
          ? { titre, connu: asString(x.connu), manque: asString(x.manque), question: asString(x.question) }
          : null;
      }),
    },
    personnel: {
      entourage: asArray(perso.entourage, (x) => {
        const nom = asString(x.nom);
        return nom ? { nom, role: asString(x.role), eclaire: asString(x.eclaire), preconfirmer: asString(x.preconfirmer) } : null;
      }),
      donnees_cachees: asArray(perso.donnees_cachees, (x) => {
        const texte = asString(x.texte);
        return texte ? { texte, source: asString(x.source) } : null;
      }),
      zone_grise: zonesGrises,
    },
    revue_de_presse: {
      reseaux: asArray(rdp.reseaux, (x) => {
        const label = asString(x.label);
        const url = safeUrl(x.url);
        return label && url ? { label, url } : null;
      }),
      a_lire: aLireLiens(rdp.a_lire),
    },
    sources_titres: sourcesTitres,
    // Repli compact des fiches d'un contrat antérieur à v3.1 (non migrées).
    legacy: {
      enjeu: asString(get("enjeu").texte),
      recit: asStringArray(get("recit_canonique").paragraphes),
      questions: asArray(get("dix_questions").questions, (x) => {
        const texte = asString(x.texte) ?? asString(x.question);
        if (!texte) return null;
        return { num: asString(x.num) ?? "", texte };
      }).map((q, i) => ({ ...q, num: q.num || pad2(i + 1), clip: false })),
    },
  };

  return <FicheView data={data} />;
}
