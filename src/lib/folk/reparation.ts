// P2 du chantier doublons (25/08) : réparation des folk_id orphelins. Quand
// deux fiches Folk fusionnent CÔTÉ FOLK, l'id absorbé disparaît et la cible
// Magellan qui le portait ne résout plus : le rattachement cassait en silence.
// Ce job, exécuté dans la fenêtre quotidienne du cron (après le
// rafraîchissement du miroir folk_people) :
//   1. détecte les cibles actives dont le folk_id n'existe plus au miroir ;
//   2. répare automatiquement quand UN SEUL candidat porte le même nom
//      normalisé (le survivant de la fusion Folk), et rattache ses
//      coordonnées manquantes (source de vérité Folk : vérifié, confiance 5) ;
//   3. consigne les cas ambigus (zéro ou plusieurs candidats) dans
//      system_state, exposés par l'outil MCP list_folk_ambigus que le digest
//      quotidien de Vadim (19h) consulte, au lieu de casser en silence.
// Best-effort : aucune exception ne sort d'ici, le cron continue.

import { normName } from "../contacts/resolve";
import { hasFolkKey } from "./client";
import { folkFindById } from "./write";
import type { createServiceClient } from "../supabase/service";

type SB = ReturnType<typeof createServiceClient>;

export const CLE_FOLK_REPARATION = "folk_reparation";

export interface FolkAmbigu {
  cible_id: string;
  nom: string;
  folk_id_orphelin: string;
  candidats: { id: string; nom: string }[];
}

export interface RapportReparation {
  verifie_le: string;
  cibles_verifiees: number;
  orphelins: number;
  repares: { cible_id: string; nom: string; ancien_folk_id: string; nouveau_folk_id: string; coordonnees_rattachees: number }[];
  ambigus: FolkAmbigu[];
  erreur?: string;
}

/** Rattache à la cible les emails et téléphones de sa fiche Folk qui lui
 *  manquent (dédoublonnés par valeur). Folk est la source de vérité :
 *  vérifié, confiance 5. Renvoie le nombre de coordonnées ajoutées. */
async function rattacheCoordonnees(sb: SB, cibleId: string, folkId: string): Promise<number> {
  if (!hasFolkKey()) return 0;
  const personne = await folkFindById(folkId);
  if (!personne) return 0;
  const { data: existants } = await sb.from("contacts").select("valeur").eq("cible_id", cibleId);
  const connues = new Set(((existants ?? []) as { valeur: string }[]).map((c) => c.valeur.trim().toLowerCase()));
  const rows: Record<string, unknown>[] = [];
  for (const email of personne.emails ?? []) {
    if (email && !connues.has(email.trim().toLowerCase())) rows.push({ cible_id: cibleId, kind: "email", valeur: email, source: "folk", confiance: 5, verifie: true });
  }
  for (const tel of personne.phones ?? []) {
    if (tel && !connues.has(tel.trim().toLowerCase())) rows.push({ cible_id: cibleId, kind: "telephone", valeur: tel, source: "folk", confiance: 5, verifie: true });
  }
  if (rows.length) await sb.from("contacts").insert(rows);
  return rows.length;
}

export async function reparerFolkOrphelins(sb: SB): Promise<RapportReparation> {
  const rapport: RapportReparation = {
    verifie_le: new Date().toISOString(),
    cibles_verifiees: 0,
    orphelins: 0,
    repares: [],
    ambigus: [],
  };
  try {
    const { data: cibles } = await sb
      .from("cibles")
      .select("id, nom, folk_id")
      .not("folk_id", "is", null)
      .eq("archive", false)
      .limit(3000);
    const rows = ((cibles ?? []) as { id: string; nom: string; folk_id: string }[]);
    rapport.cibles_verifiees = rows.length;
    if (!rows.length) return rapport;

    // Existence au miroir, par lots.
    const vivants = new Set<string>();
    const folkIds = [...new Set(rows.map((r) => r.folk_id))];
    for (let i = 0; i < folkIds.length; i += 200) {
      const { data } = await sb.from("folk_people").select("id").in("id", folkIds.slice(i, i + 200));
      for (const p of ((data ?? []) as { id: string }[])) vivants.add(p.id);
    }

    for (const cible of rows.filter((r) => !vivants.has(r.folk_id))) {
      rapport.orphelins += 1;
      const { data: cands } = await sb
        .from("folk_people")
        .select("id, nom")
        .eq("nom_normalise", normName(cible.nom))
        .limit(5);
      const candidats = ((cands ?? []) as { id: string; nom: string }[]);
      if (candidats.length === 1) {
        await sb.from("cibles").update({ folk_id: candidats[0].id }).eq("id", cible.id);
        const coordonnees_rattachees = await rattacheCoordonnees(sb, cible.id, candidats[0].id).catch(() => 0);
        rapport.repares.push({
          cible_id: cible.id,
          nom: cible.nom,
          ancien_folk_id: cible.folk_id,
          nouveau_folk_id: candidats[0].id,
          coordonnees_rattachees,
        });
      } else {
        rapport.ambigus.push({ cible_id: cible.id, nom: cible.nom, folk_id_orphelin: cible.folk_id, candidats });
      }
    }
  } catch (e) {
    rapport.erreur = e instanceof Error ? e.message : String(e);
  }
  // État persistant pour le digest de Vadim (list_folk_ambigus), best-effort.
  try {
    await sb.from("system_state").upsert({ key: CLE_FOLK_REPARATION, value: rapport as unknown as Record<string, unknown>, updated_at: new Date().toISOString() });
  } catch { /* table 0038 absente : le rapport vit dans la réponse du cron */ }
  return rapport;
}
