// /fiches/{slug} : rendu de la fiche de préparation structurée (contrat v3.1).
// Lecture via service role (page derrière l'auth de l'app). Le serveur coerce
// le JSON de chaque section vers le contrat de rendu ; toute section vide ou
// non applicable est absente de la page. L'ordre des sections par fiche
// (colonne position) est respecté, défaut au catalogue. Les sections des
// contrats précédents restent rendues (fallback) tant que la fiche n'est pas
// migrée : une fiche verrouillée non migrée reste lisible.

import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient as createAuthClient } from "@/lib/supabase/server";
import { kickQueue } from "@/lib/enrichment/jobs";
import type { ConsoleEvent, RecSession } from "@/lib/fiche/console";
import { FICHE_JOB_PREFIX } from "@/lib/fiche/generation";
import { resolveFiche, ficheSections, seedSections } from "@/lib/fiche/store";
import {
  asArray, asNumber, asString, asStringArray, safeUrl, isEmptyContent,
  DEFAULT_CHECKLIST, DEFAULT_FOOTER, DEFAULT_PERSONNEL_BANDEAU,
  type LienDate,
} from "@/lib/fiche/schema";
import { SECTIONS_OBLIGATOIRES } from "@/lib/fiche/sections";
import FicheView, { type FicheViewData, type FicheQuestion, type ALireLien } from "./FicheView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La page draine la file (kickQueue/waitUntil) : la fonction doit vivre au-delà
// de la réponse pour finir les jobs.
export const maxDuration = 300;

type Content = Record<string, unknown>;
const pad2 = (n: number) => String(n).padStart(2, "0");

function liens(v: unknown): LienDate[] {
  return asArray(v, (x) => {
    const titre = asString(x.titre) ?? asString(x.title);
    if (!titre) return null;
    return { titre, date: asString(x.date), apport: asString(x.apport) ?? asString(x.why), url: safeUrl(x.url) };
  });
}

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

  // Semis idempotent : les sections ajoutées au catalogue depuis la création
  // de la fiche existent, l'ordre suit le catalogue, les retirées ne sont
  // jamais semées.
  await seedSections(sb, fiche.id);
  const sections = await ficheSections(sb, fiche.id);
  const c = new Map<string, Content>(sections.map((s) => [s.section_id, (s.content ?? {}) as Content]));
  const get = (id: string): Content => c.get(id) ?? {};
  // Ordre par fiche (réordonnable, contrat §4) : l'ordre de ficheSections.
  const ordre = sections.map((s) => s.section_id);

  // Gate anti fiche vide : une section obligatoire (v3.1) vide rend la fiche
  // non présentable, SAUF si la fiche porte encore du contenu des contrats
  // précédents (fiche non migrée : elle reste lisible via le fallback).
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
  const sticky = get("sticky_header");
  const titreLignes = asStringArray(identite.titre_lignes);
  const dateNaissance = asString(identite.date_naissance);

  // data (04) : KPI + graphiques + marché. Les visuels des fiches non migrées
  // vivent encore dans univers : repli champ par champ.
  const dataSec = get("data");
  const universLegacy = get("univers");
  const barres = (dataSec.barres ?? universLegacy.barres ?? null) as Content | null;
  const comparaison = (dataSec.comparaison ?? universLegacy.comparaison ?? null) as Content | null;
  const rentabilite = (dataSec.rentabilite ?? universLegacy.rentabilite ?? null) as Content | null;
  const timeline = (universLegacy.timeline ?? null) as Content | null;
  const marche = (dataSec.marche ?? null) as Content | null;

  const mec = get("mecanique_succes");
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
      return { num: asString(q.num) ?? pad2(numCourant), texte, note: asString(q.note), zg: asString(q.zg) };
    });
    const debut = asNumber(x.debut_min);
    const fin = asNumber(x.fin_min);
    return { titre, debut_min: debut, fin_min: fin, intention: asString(x.intention), questions };
  });

  // Questions legacy (dix_questions) : rendues par le fallback tant que la
  // fiche n'est pas migrée.
  const questionsLegacy: FicheQuestion[] = asArray(get("dix_questions").questions, (x) => {
    const texte = asString(x.texte) ?? asString(x.question);
    if (!texte) return null;
    return { num: asString(x.num) ?? "", texte, note: asString(x.note) };
  }).map((q, i) => ({ ...q, num: q.num || pad2(i + 1) }));

  const rdp = get("revue_de_presse");
  const sourcesListe = liens(get("sources").liens);

  const data: FicheViewData = {
    slug: fiche.slug,
    fiche_id: fiche.id,
    viewer_email: viewerEmail,
    console_events: consoleEvents,
    rec_sessions: recSessions,
    invite_nom: fiche.invite_nom,
    statut: fiche.statut,
    version: fiche.version,
    ordre,
    generation,
    incompletes: [...incompletes],
    identite: {
      numero: asString(identite.numero),
      titre_lignes: titreLignes.length ? titreLignes : fiche.invite_nom.split(/\s+/),
      societe: asString(sticky.societe) ?? asString(identite.societe),
      sous_titre: asString(identite.sous_titre),
      pilules: asStringArray(identite.pilules),
      liens: asArray(identite.liens, (x) => {
        const label = asString(x.label);
        const url = safeUrl(x.url);
        return label && url ? { label, url } : null;
      }),
      date_naissance: dateNaissance,
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
      // v3.1 : cinq items fixes, identiques sur toutes les fiches.
      const items = asStringArray(get("checklist_prerec").items);
      return items.length === DEFAULT_CHECKLIST.length ? items : DEFAULT_CHECKLIST;
    })(),
    tldr: asArray(get("tldr").items, (x) => {
      const texte = asString(x.texte);
      const label = asString(x.label);
      return texte && label ? { label, texte } : null;
    }),
    tldr_legacy: asStringArray(get("tldr").items),
    kpis: asArray(dataSec.kpis, (x) => {
      const valeur = asString(x.valeur);
      const libelle = asString(x.libelle);
      return valeur && libelle ? { valeur, libelle, source: asString(x.source), zg: asString(x.zg) } : null;
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
    apprentissages: {
      intro: asString(get("apprentissages").intro),
      items: asArray(get("apprentissages").items, (x) => {
        const titre = asString(x.titre);
        return titre
          ? { titre, connu: asString(x.connu), manque: asString(x.manque), question: asString(x.question) }
          : null;
      }),
    },
    clips: asArray(get("clips").questions, (x) => {
      const question = asString(x.question);
      if (!question) return null;
      const meta =
        asString(x.meta) ??
        [asString(x.ressort)?.replace("_", "-").toUpperCase(), asString(x.clip)].filter(Boolean).join(" · ");
      return { question, meta: meta || undefined, zg: asString(x.zg), fache: x.fache === true };
    }),
    terrain_connu: asArray(topicsSec.terrain_connu, (x) => {
      const question = asString(x.question);
      return question ? { question, reponse: asString(x.reponse), depassement: asString(x.depassement) } : null;
    }),
    topics,
    personnel: {
      bandeau: asString(perso.bandeau) ?? DEFAULT_PERSONNEL_BANDEAU,
      entourage: asArray(perso.entourage, (x) => {
        const nom = asString(x.nom);
        return nom ? { nom, role: asString(x.role), eclaire: asString(x.eclaire), preconfirmer: asString(x.preconfirmer) } : null;
      }),
      donnees_cachees: asArray(perso.donnees_cachees, (x) => {
        const texte = asString(x.texte);
        return texte ? { texte, source: asString(x.source), zg: asString(x.zg) } : null;
      }),
      zone_grise: asArray(perso.zone_grise, (x) => {
        const texte = asString(x.texte);
        return texte ? { id: asString(x.id), texte, origine: asString(x.origine) } : null;
      }),
      items_legacy: asArray(perso.items, (x) => {
        const texte = asString(x.texte);
        const source = asString(x.source);
        return texte && source ? { texte, source } : null;
      }),
    },
    revue_de_presse: {
      reseaux: asArray(rdp.reseaux, (x) => {
        const label = asString(x.label);
        const url = safeUrl(x.url);
        return label && url ? { label, url } : null;
      }),
      palmares: asArray(rdp.palmares, (x) => {
        const texte = asString(x.texte);
        return texte ? { date: asString(x.date), texte } : null;
      }),
      a_lire: aLireLiens(rdp.a_lire),
      sources_total: sourcesListe.length,
    },

    // ── Contrats précédents : fallback de rendu tant que la fiche n'est pas
    // migrée (une verrouillée non migrée reste lisible telle quelle). ──
    enjeu: asString(get("enjeu").texte),
    lecon: asString(get("enjeu").lecon),
    recit: asStringArray(get("recit_canonique").paragraphes),
    mecanique: (() => {
      const definition = asString(mec.definition);
      const pairs = asArray(mec.pairs, (x) => {
        const nom = asString(x.nom);
        return nom ? { nom, position: asString(x.position) } : null;
      });
      const divergences = asArray(mec.divergences, (x) => {
        const date = asString(x.date);
        const decision = asString(x.decision);
        return date && decision ? { date, decision, effet: asString(x.effet) } : null;
      });
      const contrefactuel = asString(mec.contrefactuel);
      if (!definition && !pairs.length && !divergences.length && !contrefactuel) return null;
      return { definition, pairs, divergences, contrefactuel };
    })(),
    univers_intro: asStringArray(universLegacy.intro),
    distinctions: asStringArray(universLegacy.distinctions),
    a_lire: aLireLiens(get("a_lire").liens),
    trente_secondes: asArray(get("trente_secondes").items, (x) => {
      const label = asString(x.label);
      const texte = asString(x.texte);
      return label && texte ? { label, texte } : null;
    }),
    anecdotes: asArray(get("anecdotes").items, (x) => {
      const texte = asString(x.texte);
      return texte ? { texte, source: asString(x.source), cachee: x.cachee === true } : null;
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
      timeline: timeline && asString(timeline.titre)
        ? {
            titre: asString(timeline.titre)!,
            jalons: asArray(timeline.jalons, (x) => {
              const annee = asString(x.annee);
              const titre = asString(x.titre);
              return annee && titre ? { annee, titre, texte: asString(x.texte), cle: x.cle === true } : null;
            }),
          }
        : undefined,
    },
    parcours: asArray(get("parcours").lignes, (x) => {
      const annee = asString(x.annee);
      const texte = asString(x.texte);
      return annee && texte ? { annee, texte } : null;
    }),
    entourage_legacy: asArray(get("entourage").personnes, (x) => {
      const nom = asString(x.nom);
      return nom ? { nom, role: asString(x.role), texte: asString(x.texte) } : null;
    }),
    tensions: asArray(get("tensions").cartes, (x) => {
      const a = asString(x.a);
      const b = asString(x.b);
      return a && b ? { a, b, angle: asString(x.angle) } : null;
    }),
    polemiques: asArray(get("polemiques").items, (x) => {
      const texte = asString(x.texte);
      return texte ? { texte, source: asString(x.source), question: asString(x.question) } : null;
    }),
    recurrentes: {
      intro: asString(get("questions_recurrentes").intro),
      items: asArray(get("questions_recurrentes").items, (x) => {
        const question = asString(x.question);
        return question ? { question, reponse: asString(x.reponse) } : null;
      }),
    },
    questions: questionsLegacy,
    zone_grise: asArray(get("zone_grise").items, (x) => {
      const texte = asString(x.texte);
      return texte ? { id: asString(x.id), texte, origine: asString(x.origine) } : null;
    }),
    sources: sourcesListe,
    footer: asString(get("footer").texte) ?? DEFAULT_FOOTER,
  };

  return <FicheView data={data} />;
}
