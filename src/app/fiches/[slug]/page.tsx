// /fiches/{slug} : rendu de la fiche de préparation structurée (contrat v2,
// Bloc A / Bloc B). Lecture via service role (page derrière l'auth de l'app).
// Le serveur coerce le JSON de chaque section vers le contrat de rendu ; toute
// section vide ou non applicable est absente de la page. L'ordre des sections
// par fiche (colonne position) est respecté, défaut au catalogue.

import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { kickQueue } from "@/lib/enrichment/jobs";
import { FICHE_JOB_PREFIX } from "@/lib/fiche/generation";
import { resolveFiche, ficheSections } from "@/lib/fiche/store";
import {
  asArray, asNumber, asString, asStringArray, safeUrl,
  DEFAULT_CHECKLIST, DEFAULT_FOOTER, DEFAULT_PERSONNEL_BANDEAU,
  type LienDate,
} from "@/lib/fiche/schema";
import FicheView, { type FicheViewData, type FicheBloc, type FicheQuestion, type ALireLien } from "./FicheView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// La page draine la file (kickQueue/waitUntil) : la fonction doit vivre au-delà
// de la réponse pour finir les jobs. Plafond Hobby avec Fluid compute.
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

export default async function FichePage({ params }: { params: { slug: string } }) {
  const sb = createServiceClient();
  const fiche = await resolveFiche(sb, params.slug);
  if (!fiche) notFound();
  kickQueue(); // lecture chaude : recharger la fiche draine la génération en cours

  const sections = await ficheSections(sb, fiche.id);
  const c = new Map<string, Content>(sections.map((s) => [s.section_id, (s.content ?? {}) as Content]));
  const get = (id: string): Content => c.get(id) ?? {};
  // Ordre par fiche (réordonnable, contrat §4) : l'ordre de ficheSections.
  const ordre = sections.map((s) => s.section_id);

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

  const entete = get("entete");
  const sticky = get("sticky_header");
  const titreLignes = asStringArray(entete.titre_lignes);
  const enBlocs: FicheBloc[] = asArray(get("sequencage").blocs, (x) => {
    const titre = asString(x.titre);
    if (!titre) return null;
    return {
      debut_min: asNumber(x.debut_min) ?? 0,
      fin_min: asNumber(x.fin_min) ?? 150,
      court: asString(x.court) ?? titre,
      titre,
      intention: asString(x.intention),
      mode: asString(x.mode),
      rappel_label: asString(x.rappel_label),
      rappel: asString(x.rappel),
    };
  });
  const questions: FicheQuestion[] = asArray(get("dix_questions").questions, (x) => {
    const texte = asString(x.texte) ?? asString(x.question);
    if (!texte) return null;
    return { num: asString(x.num) ?? "", bloc: asNumber(x.bloc) ?? -1, texte, note: asString(x.note) };
  }).map((q, i) => ({ ...q, num: q.num || pad2(i + 1) }));

  const univers = get("univers");
  const barres = (univers.barres ?? null) as Content | null;
  const comparaison = (univers.comparaison ?? null) as Content | null;
  const rentabilite = (univers.rentabilite ?? null) as Content | null;
  const timeline = (univers.timeline ?? null) as Content | null;
  const mec = get("mecanique_succes");
  const perso = get("personnel");

  const data: FicheViewData = {
    slug: fiche.slug,
    invite_nom: fiche.invite_nom,
    statut: fiche.statut,
    version: fiche.version,
    ordre,
    generation,
    entete: {
      numero: asString(entete.numero),
      titre_lignes: titreLignes.length ? titreLignes : fiche.invite_nom.split(/\s+/),
      societe: asString(sticky.societe) ?? asString(entete.societe),
      sous_titre: asString(entete.sous_titre),
      pilules: asStringArray(entete.pilules),
      liens: asArray(entete.liens, (x) => {
        const label = asString(x.label);
        const url = safeUrl(x.url);
        return label && url ? { label, url } : null;
      }),
    },
    checklist: (() => {
      const items = asStringArray(get("checklist_prerec").items);
      return items.length ? items : DEFAULT_CHECKLIST;
    })(),
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
    univers_intro: asStringArray(univers.intro),
    distinctions: asStringArray(univers.distinctions),
    personnel: (() => {
      const items = asArray(perso.items, (x) => {
        const texte = asString(x.texte);
        const source = asString(x.source);
        return texte && source ? { texte, source } : null;
      });
      if (!items.length) return null;
      return { bandeau: asString(perso.bandeau) ?? DEFAULT_PERSONNEL_BANDEAU, items };
    })(),
    a_lire: asArray(get("a_lire").liens, (x) => {
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
    }),
    trente_secondes: asArray(get("trente_secondes").items, (x) => {
      const label = asString(x.label);
      const texte = asString(x.texte);
      return label && texte ? { label, texte } : null;
    }),
    anecdotes: asArray(get("anecdotes").items, (x) => {
      const texte = asString(x.texte);
      return texte ? { texte, source: asString(x.source), cachee: x.cachee === true } : null;
    }),
    kpis: asArray(get("chiffres").kpis, (x) => {
      const valeur = asString(x.valeur);
      const libelle = asString(x.libelle);
      return valeur && libelle ? { valeur, libelle, source: asString(x.source) } : null;
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
    playbook: {
      intro: asString(get("playbook").intro),
      items: asArray(get("playbook").items, (x) => {
        const titre = asString(x.titre);
        return titre
          ? { titre, connu: asString(x.connu), manque: asString(x.manque), question: asString(x.question) }
          : null;
      }),
    },
    entourage: asArray(get("entourage").personnes, (x) => {
      const nom = asString(x.nom);
      return nom ? { nom, role: asString(x.role), texte: asString(x.texte) } : null;
    }),
    tensions: asArray(get("tensions").cartes, (x) => {
      const a = asString(x.a);
      const b = asString(x.b);
      return a && b ? { a, b, angle: asString(x.angle) } : null;
    }),
    recurrentes: {
      intro: asString(get("questions_recurrentes").intro),
      items: asArray(get("questions_recurrentes").items, (x) => {
        const question = asString(x.question);
        return question ? { question, reponse: asString(x.reponse) } : null;
      }),
    },
    reseaux: asArray(get("questions_reseaux").questions, (x) => {
      const question = asString(x.question);
      if (!question) return null;
      const meta =
        asString(x.meta) ??
        [asString(x.ressort)?.replace("_", "-").toUpperCase(), asString(x.clip)].filter(Boolean).join(" · ");
      return { question, meta: meta || undefined };
    }),
    blocs: enBlocs,
    questions,
    zone_grise: asArray(get("zone_grise").items, (x) => {
      const texte = asString(x.texte);
      return texte ? { texte, origine: asString(x.origine) } : null;
    }),
    sources: liens(get("sources").liens),
    footer: asString(get("footer").texte) ?? DEFAULT_FOOTER,
  };

  return <FicheView data={data} />;
}
