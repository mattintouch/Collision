// /fiches/{slug} : rendu de la fiche de préparation structurée (tables 0034).
// Lecture via service role (la page est derrière l'auth de l'app, middleware).
// Le serveur coerce le JSON de chaque section vers le contrat de rendu ; toute
// section vide ou non applicable est absente de la page (règle du brief).

import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { kickQueue } from "@/lib/enrichment/jobs";
import { resolveFiche, ficheSections } from "@/lib/fiche/store";
import {
  asArray, asNumber, asString, asStringArray, safeUrl,
  DEFAULT_CHECKLIST, DEFAULT_FOOTER,
  type LienDate,
} from "@/lib/fiche/schema";
import FicheView, { type FicheViewData, type FicheBloc, type FicheQuestion } from "./FicheView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const entreprise = get("entreprise");
  const barres = (entreprise.barres ?? null) as Content | null;
  const comparaison = (entreprise.comparaison ?? null) as Content | null;
  const rentabilite = (entreprise.rentabilite ?? null) as Content | null;
  const timeline = (entreprise.timeline ?? null) as Content | null;

  const data: FicheViewData = {
    slug: fiche.slug,
    invite_nom: fiche.invite_nom,
    statut: fiche.statut,
    version: fiche.version,
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
    sources_rapides: liens(get("sources_rapides").liens),
    trente_secondes: asArray(get("trente_secondes").items, (x) => {
      const label = asString(x.label);
      const texte = asString(x.texte);
      return label && texte ? { label, texte } : null;
    }),
    presentation: asStringArray(get("presentation").paragraphes),
    anecdotes: asArray(get("anecdotes").items, (x) => {
      const texte = asString(x.texte);
      return texte ? { texte, source: asString(x.source), cachee: x.cachee === true } : null;
    }),
    kpis: asArray(get("chiffres").kpis, (x) => {
      const valeur = asString(x.valeur);
      const libelle = asString(x.libelle);
      return valeur && libelle ? { valeur, libelle, source: asString(x.source) } : null;
    }),
    entreprise: {
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
