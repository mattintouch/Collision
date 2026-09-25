// La Martingale, brief 2.4 : exécution des automatisations quotidiennes.
//
// La DÉCISION vit dans automatisations.ts et reste pure. Ce module fait deux
// choses seulement : lire l'état, puis appliquer. Le cadre du brief (point 0.4)
// impose une phase de simulation avant toute écriture large : `simulation: true`
// parcourt exactement le même calcul et renvoie le même rapport, sans écrire
// une seule ligne.
//
// Mode d'envoi (brief 2.5) : le show est en `validation`, donc rien ne part.
// Les relances et les alertes sont déposées en BROUILLON dans email_brouillons
// et attendent un clic. En mode `veto`, ce module ne crée aucun brouillon : le
// comportement de GDIY n'est pas modifié par ce chantier.

import type { createServiceClient } from "../supabase/service";
import { decisionsDuJour, etapeCible, type ActionMartingale, type CibleMartingale } from "./automatisations";

type SB = ReturnType<typeof createServiceClient>;

export const SLUG_MARTINGALE = "la-martingale";

export interface RapportAutomatisations {
  show: string;
  simulation: boolean;
  cibles_examinees: number;
  actions: ActionMartingale[];
  appliquees: number;
  brouillons_crees: number;
  erreurs: string[];
  /** Migration 0055 absente : le rapport le dit et rien ne tourne. */
  indisponible?: string;
}

interface LigneCible {
  id: string;
  nom: string;
  stage_id: string | null;
  priorite: string | null;
  statut_sortie: string | null;
  relances_envoyees: number | null;
  date_derniere_touche: string | null;
  date_diffusion: string | null;
  date_tournage: string | null;
}

/** Charge l'état nécessaire aux quatre règles, en quatre requêtes bornées. */
async function chargeEtat(sb: SB, showId: string): Promise<{ cibles: CibleMartingale[]; etapes: Map<string, string> }> {
  const { data: stages } = await sb.from("stages").select("id, key").eq("show_id", showId);
  const parId = new Map(((stages ?? []) as { id: string; key: string }[]).map((s) => [s.id, s.key]));
  const parCle = new Map(((stages ?? []) as { id: string; key: string }[]).map((s) => [s.key, s.id]));

  const { data: brut } = await sb
    .from("cibles")
    .select("id, nom, stage_id, priorite, statut_sortie, relances_envoyees, date_derniere_touche, date_diffusion, date_tournage")
    .eq("show_id", showId)
    .eq("archive", false)
    .limit(2000);
  const lignes = (brut ?? []) as LigneCible[];
  if (!lignes.length) return { cibles: [], etapes: parCle };

  const ids = lignes.map((l) => l.id);
  const { data: fiches } = await sb.from("fiches").select("cible_id").in("cible_id", ids);
  const avecFiche = new Set(((fiches ?? []) as { cible_id: string | null }[]).map((f) => f.cible_id).filter(Boolean) as string[]);

  const { data: calls } = await sb.from("cible_calls").select("cible_id, statut").in("cible_id", ids);
  const faits = new Map<string, number>();
  for (const c of ((calls ?? []) as { cible_id: string; statut: string }[])) {
    if (c.statut === "fait") faits.set(c.cible_id, (faits.get(c.cible_id) ?? 0) + 1);
  }

  // Date de publication : le passage en `publie` est journalisé par une touche
  // de canal `publication`. À défaut, la date de diffusion fait foi.
  const { data: touches } = await sb
    .from("touches")
    .select("cible_id, date, canal")
    .in("cible_id", ids)
    .eq("canal", "publication")
    .order("date", { ascending: false })
    .limit(500);
  const publication = new Map<string, string>();
  for (const t of ((touches ?? []) as { cible_id: string; date: string }[])) {
    if (!publication.has(t.cible_id)) publication.set(t.cible_id, t.date);
  }

  return {
    etapes: parCle,
    cibles: lignes.map((l) => ({
      id: l.id,
      nom: l.nom,
      etape: l.stage_id ? parId.get(l.stage_id) ?? null : null,
      priorite: l.priorite,
      statut_sortie: l.statut_sortie,
      relances_envoyees: l.relances_envoyees ?? 0,
      date_derniere_touche: l.date_derniere_touche,
      date_diffusion: l.date_diffusion,
      date_tournage: l.date_tournage,
      date_publication: publication.get(l.id) ?? null,
      a_une_fiche: avecFiche.has(l.id),
      calls_faits: faits.get(l.id) ?? 0,
    })),
  };
}

/** Corps du brouillon de relance. Volontairement sobre et court : il sera relu
 *  et réécrit par Lhou avant envoi, ce n'est pas une lettre finie. */
function brouillonRelance(nom: string, motif: string): { sujet: string; corps: string } {
  return {
    sujet: `La Martingale, suite à mon message`,
    corps: [
      `Bonjour ${nom.split(" ")[0]},`,
      "",
      "Je me permets de revenir vers vous au sujet de votre participation à La Martingale.",
      "Le format reste le même : un entretien d'environ une heure, enregistré à Paris, sur votre spécialité.",
      "",
      "Dites-moi si le sujet vous intéresse, même à une échéance lointaine.",
      "",
      "Lhou",
      "",
      `[Brouillon créé automatiquement : ${motif}. À relire et à valider avant envoi.]`,
    ].join("\n"),
  };
}

function brouillonAlerte(nom: string, manques: string[], motif: string): { sujet: string; corps: string } {
  return {
    sujet: `Tournage ${nom} : ${manques.length} point${manques.length > 1 ? "s" : ""} à traiter`,
    corps: [
      `Le tournage avec ${nom} approche (${motif}).`,
      "",
      ...manques.map((m) => `Point ouvert : ${m}.`),
      "",
      "Cette alerte est automatique. Elle se ferme d'elle même quand les points sont traités.",
    ].join("\n"),
  };
}

/**
 * Passe quotidienne. Ne lance JAMAIS : le cron ne doit pas échouer pour une
 * table absente ou une ligne fautive. Chaque erreur est rapportée, le reste
 * continue.
 */
export async function passeMartingale(
  sb: SB,
  opts: { simulation?: boolean; maintenant?: Date } = {}
): Promise<RapportAutomatisations> {
  const simulation = opts.simulation ?? false;
  const maintenant = opts.maintenant ?? new Date();
  const vide: RapportAutomatisations = {
    show: SLUG_MARTINGALE,
    simulation,
    cibles_examinees: 0,
    actions: [],
    appliquees: 0,
    brouillons_crees: 0,
    erreurs: [],
  };

  const { data: showRow } = await sb.from("shows").select("id, slug, mode_envoi").eq("slug", SLUG_MARTINGALE).maybeSingle();
  const show = showRow as { id: string; slug: string; mode_envoi?: string } | null;
  if (!show) {
    return { ...vide, indisponible: "Show la-martingale absent : appliquer la migration 0055, puis réessayer." };
  }

  let etat: Awaited<ReturnType<typeof chargeEtat>>;
  try {
    etat = await chargeEtat(sb, show.id);
  } catch (e) {
    return { ...vide, indisponible: `Lecture impossible (migration 0055 incomplète ?) : ${e instanceof Error ? e.message : String(e)}` };
  }

  const actions = decisionsDuJour(etat.cibles, maintenant);
  const rapport: RapportAutomatisations = { ...vide, cibles_examinees: etat.cibles.length, actions };
  if (simulation || !actions.length) return rapport;

  // Le mode `validation` (La Martingale) n'envoie rien : les courriers partent
  // en brouillon. Le mode `veto` (GDIY) ne crée pas de brouillon ici.
  const enBrouillon = (show.mode_envoi ?? "veto") === "validation";

  for (const action of actions) {
    try {
      const cleEtape = etapeCible(action);
      if (cleEtape) {
        const stageId = etat.etapes.get(cleEtape);
        if (stageId) await sb.from("cibles").update({ stage_id: stageId }).eq("id", action.cible_id);
      }
      if (action.type === "relancer") {
        const { data } = await sb.from("cibles").select("relances_envoyees").eq("id", action.cible_id).maybeSingle();
        const actuel = (data as { relances_envoyees?: number } | null)?.relances_envoyees ?? 0;
        await sb.from("cibles").update({ relances_envoyees: actuel + 1 }).eq("id", action.cible_id);
        if (enBrouillon) {
          const { sujet, corps } = brouillonRelance(action.nom, action.motif);
          const { error } = await sb.from("email_brouillons").insert({
            show_id: show.id, cible_id: action.cible_id, type: "relance",
            sujet, corps, origine: "automatisation quotidienne",
          });
          if (!error) rapport.brouillons_crees += 1;
        }
      }
      if (action.type === "abandonner") {
        await sb.from("cibles").update({ statut_sortie: "no_ok" }).eq("id", action.cible_id);
      }
      if (action.type === "publier") {
        await sb.from("touches").insert({
          cible_id: action.cible_id, canal: "publication", contenu: `Passage en publié (${action.motif}).`, source: "saisie",
        });
      }
      if (action.type === "alerte_tournage" && enBrouillon) {
        const { sujet, corps } = brouillonAlerte(action.nom, action.manques, action.motif);
        const { error } = await sb.from("email_brouillons").insert({
          show_id: show.id, cible_id: action.cible_id, type: "alerte",
          sujet, corps, origine: "alerte J-7 tournage",
        });
        if (!error) rapport.brouillons_crees += 1;
      }
      rapport.appliquees += 1;
    } catch (e) {
      rapport.erreurs.push(`${action.type} sur ${action.nom} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return rapport;
}
