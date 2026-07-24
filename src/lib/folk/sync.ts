// Tâche 2 (handoff 24/07) — synchro CONTINUE Magellan vers Folk.
//
// Décision actée : Magellan est SOURCE DE VÉRITÉ sur les champs qu'il possède
// (organisation vers société, rôle vers intitulé, secteur, pays, ville, emails,
// téléphones). Règles non négociables :
//   1. Une valeur Magellan NON VIDE écrase la valeur Folk. Un champ vide de
//      Magellan ne touche JAMAIS Folk (aucune mise à vide).
//   2. Les champs propres à Folk (tags, notes saisies à la main, coordonnées
//      manuelles) ne sont jamais retirés : emails et téléphones sont UNIONNÉS,
//      la description ne voit remplacée que SA ligne gérée (préfixe Magellan ·).
//   3. Match ou création, jamais de doublon : folk_id persisté d'abord, sinon
//      email (haute confiance, clé d'attach_resolved_contacts), sinon nom
//      normalisé via le miroir. Nom ambigu (plusieurs fiches) : NI match NI
//      création, on signale. Aucun match partiel.
//   4. Déclenchement sur le chemin d'écriture (kickFolkSync, waitUntil), pas
//      en synchro manuelle. Best-effort : n'interrompt jamais l'écriture
//      Magellan.
//   5. Photos : AUCUNE photo n'est poussée vers Folk (le modèle Person de
//      l'API ne l'expose pas) ; a fortiori jamais un lien direct de recherche
//      web. Si un jour le champ existe, réhéberger dans Supabase Storage
//      d'abord.
//
// Périmètre : cibles de kind personne (le pipe invité). Les entreprises ne
// sont pas synchronisées.

import { waitUntil } from "@vercel/functions";
import { createServiceClient } from "../supabase/service";
import { hasFolkKey, type FolkPerson } from "./client";
import { folkFindById, folkCreatePerson, folkUpdatePerson } from "./write";
import { normName } from "../contacts/resolve";
import type { CibleEnrichie } from "../types";

type SB = ReturnType<typeof createServiceClient>;

const LIGNE_PREFIXE = "Magellan · ";

/** Ligne gérée par Magellan dans la description Folk : remplacée à chaque
 *  synchro, le reste de la description (notes à la main) est intouché. */
export function descriptionAvecLigneMagellan(description: string | null | undefined, ligne: string | null): string | null {
  const lignes = (description ?? "").split("\n").filter((l) => !l.startsWith(LIGNE_PREFIXE));
  if (ligne) lignes.push(LIGNE_PREFIXE + ligne);
  const out = lignes.join("\n").trim();
  return out || null;
}

export interface ChampsCible {
  role?: string | null;
  organisation?: string | null;
  secteur?: string | null;
  pays?: string | null;
  ville?: string | null;
}

/** Construit le patch Folk depuis la cible (PURE, testée). Applique la règle
 *  source de vérité : non vide écrase, vide ne touche pas, union des
 *  coordonnées, ligne de description gérée. Renvoie aussi la liste des champs
 *  réellement modifiés (patch vide = rien à écrire). */
export function construirePatchFolk(
  cible: ChampsCible,
  coordonnees: { emails: string[]; telephones: string[] },
  personne: Pick<FolkPerson, "jobTitle" | "description" | "emails" | "phones" | "companies">
): { patch: Record<string, unknown>; champs: string[] } {
  const patch: Record<string, unknown> = {};
  const champs: string[] = [];
  const propre = (v?: string | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const role = propre(cible.role);
  if (role && role !== (personne.jobTitle ?? "").trim()) {
    patch.jobTitle = role;
    champs.push("jobTitle");
  }

  const organisation = propre(cible.organisation);
  const societeActuelle = (personne.companies ?? [])
    .map((c) => (typeof c === "string" ? c : c.name ?? ""))
    .filter(Boolean);
  if (organisation && !societeActuelle.some((s) => s.trim().toLowerCase() === organisation.toLowerCase())) {
    patch.companies = [{ name: organisation }];
    champs.push("companies");
  }

  // secteur / pays / ville : pas de champ standard Person chez Folk, portés
  // par la ligne gérée de la description (jamais les notes à la main).
  const morceaux = [
    propre(cible.secteur) ? `secteur : ${propre(cible.secteur)}` : null,
    propre(cible.pays) ? `pays : ${propre(cible.pays)}` : null,
    propre(cible.ville) ? `ville : ${propre(cible.ville)}` : null,
  ].filter(Boolean);
  if (morceaux.length) {
    const description = descriptionAvecLigneMagellan(personne.description, morceaux.join(" · "));
    if ((description ?? "") !== (personne.description ?? "").trim()) {
      patch.description = description;
      champs.push("description (ligne Magellan)");
    }
  }

  const unionne = (existants: string[] | undefined, ajouts: string[]) => {
    const vus = new Set((existants ?? []).map((v) => v.trim().toLowerCase()));
    const nouveaux = ajouts.map((v) => v.trim()).filter((v) => v && !vus.has(v.toLowerCase()));
    return nouveaux.length ? [...(existants ?? []), ...nouveaux] : null;
  };
  const emails = unionne(personne.emails, coordonnees.emails);
  if (emails) {
    patch.emails = emails;
    champs.push("emails");
  }
  const phones = unionne(personne.phones, coordonnees.telephones);
  if (phones) {
    patch.phones = phones;
    champs.push("phones");
  }

  return { patch, champs };
}

export interface ResultatSync {
  ok: boolean;
  detail: string;
  folk_id?: string;
  champs?: string[];
}

/** Retrouve la fiche Folk de la cible sans jamais créer de doublon :
 *  folk_id persisté, sinon email via le miroir, sinon nom normalisé UNIQUE. */
async function trouverPersonneFolk(
  sb: SB,
  cible: CibleEnrichie,
  emails: string[]
): Promise<{ personne: FolkPerson | null; ambigu: boolean }> {
  if (cible.folk_id) {
    const p = await folkFindById(cible.folk_id);
    if (p) return { personne: p, ambigu: false };
  }
  for (const email of emails) {
    const { data } = await sb.from("folk_people").select("id").contains("emails", [email]).limit(2);
    const ids = (data ?? []) as { id: string }[];
    if (ids.length === 1) {
      const p = await folkFindById(ids[0].id);
      if (p) return { personne: p, ambigu: false };
    }
  }
  const { data: parNom } = await sb.from("folk_people").select("id").eq("nom_normalise", normName(cible.nom)).limit(2);
  const ids = (parNom ?? []) as { id: string }[];
  if (ids.length === 1) {
    const p = await folkFindById(ids[0].id);
    if (p) return { personne: p, ambigu: false };
  }
  return { personne: null, ambigu: ids.length > 1 };
}

/** Synchronise UNE cible vers Folk (upsert non destructif). Best-effort. */
export async function syncCibleToFolk(sb: SB, cibleId: string): Promise<ResultatSync> {
  try {
    if (!hasFolkKey()) return { ok: false, detail: "Pas de clé Folk." };
    const { data: row } = await sb.from("cibles_enrichies").select("*").eq("id", cibleId).maybeSingle();
    const cible = row as CibleEnrichie | null;
    if (!cible) return { ok: false, detail: "Cible introuvable." };
    if (cible.kind !== "personne") return { ok: true, detail: "Cible entreprise : hors périmètre de la synchro Folk." };
    if (cible.archive) return { ok: true, detail: "Cible archivée : pas de synchro." };

    const { data: cs } = await sb.from("contacts").select("kind, valeur").eq("cible_id", cibleId).in("kind", ["email", "telephone"]);
    const contacts = (cs ?? []) as { kind: string; valeur: string }[];
    const emails = contacts.filter((c) => c.kind === "email").map((c) => c.valeur);
    const telephones = contacts.filter((c) => c.kind === "telephone").map((c) => c.valeur);

    const { personne, ambigu } = await trouverPersonneFolk(sb, cible, emails);
    if (ambigu) return { ok: false, detail: `Nom ambigu dans Folk (plusieurs fiches « ${cible.nom} ») : ni match ni création, à trancher à la main.` };

    if (!personne) {
      const { patch } = construirePatchFolk(cible, { emails, telephones }, {});
      const cree = await folkCreatePerson({ fullName: cible.nom, ...patch });
      if (!cree) return { ok: false, detail: "Création Folk impossible." };
      await sb.from("cibles").update({ folk_id: cree.id }).eq("id", cibleId);
      return { ok: true, folk_id: cree.id, detail: `Fiche Folk créée pour ${cible.nom}.`, champs: Object.keys(patch) };
    }

    const { patch, champs } = construirePatchFolk(cible, { emails, telephones }, personne);
    if (!cible.folk_id) await sb.from("cibles").update({ folk_id: personne.id }).eq("id", cibleId);
    if (!champs.length) return { ok: true, folk_id: personne.id, detail: "Folk déjà à jour.", champs: [] };
    const ok = await folkUpdatePerson(personne.id, patch);
    return { ok, folk_id: personne.id, detail: ok ? `Fiche Folk de ${cible.nom} mise à jour (${champs.join(", ")}).` : "Échec de mise à jour Folk.", champs };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Erreur Folk" };
  }
}

/** Déclenchement sur le chemin d'écriture : en tâche de fond après la réponse
 *  (waitUntil), n'interrompt jamais l'écriture Magellan. */
export function kickFolkSync(cibleId: string): void {
  const work = (async () => {
    const sb = createServiceClient();
    await syncCibleToFolk(sb, cibleId);
  })().catch(() => {});
  try {
    waitUntil(work);
  } catch {
    /* hors runtime Vercel : fire-and-forget */
  }
}
