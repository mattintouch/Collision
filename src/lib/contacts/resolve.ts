// Chantier B — résolution de coordonnées : Folk d'abord (source de vérité),
// Google Contacts en repli. Lecture seule, partagée par resolve_contact,
// get_dossier (bloc contacts_externes) et l'auto-rattachement (create/add_appui).
// Aucune clé n'est exposée : seules les données du compte authentifié reviennent.

import { fetchFolkPeople, hasFolkKey } from "../folk/client";
import { googleAccessToken, searchGoogleContact, hasGoogleSync } from "../google/contacts";

export type MatchConfidence = "haute" | "moyenne" | "ambigu" | "aucun";

export interface ResolvedCandidate {
  nom: string;
  emails: string[];
  telephones: string[];
  folk_id?: string;
}

export interface ResolvedContact {
  source: "folk" | "google" | null;
  match_confidence: MatchConfidence;
  email: string[];
  telephone: string[];
  /** id de la personne Folk sur un match confiant (haute/moyenne) — pour lier la fiche. */
  folk_id?: string;
  candidats?: ResolvedCandidate[];
}

/** Normalise un nom pour le rapprochement (minuscules, sans accents, espaces compactés). */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Résout les coordonnées d'une personne par son nom. Folk d'abord (match sur nom
 * complet normalisé), Google en repli. Ne choisit jamais en silence : plusieurs
 * correspondances → match_confidence "ambigu" + liste de candidats.
 */
export async function resolveContact(nom: string): Promise<ResolvedContact> {
  const empty: ResolvedContact = { source: null, match_confidence: "aucun", email: [], telephone: [] };
  const q = normName(nom);
  if (!q) return empty;

  // 1) Folk (source de vérité).
  if (hasFolkKey()) {
    try {
      const people = await fetchFolkPeople();
      const scored = people
        .map((p) => {
          const name = normName(p.fullName || [p.firstName, p.lastName].filter(Boolean).join(" "));
          const conf = !name ? 0 : name === q ? 1 : name.includes(q) || q.includes(name) ? 0.6 : 0;
          return { p, name, conf };
        })
        .filter((x) => x.conf > 0)
        .sort((x, y) => y.conf - x.conf);
      const exacts = scored.filter((x) => x.conf === 1);
      if (exacts.length === 1) {
        const p = exacts[0].p;
        return { source: "folk", match_confidence: "haute", email: p.emails ?? [], telephone: p.phones ?? [], folk_id: p.id };
      }
      if (exacts.length > 1 || scored.length > 1) {
        return {
          source: "folk",
          match_confidence: "ambigu",
          email: [],
          telephone: [],
          candidats: scored.slice(0, 8).map((x) => ({
            nom: x.p.fullName ?? x.name,
            emails: x.p.emails ?? [],
            telephones: x.p.phones ?? [],
            folk_id: x.p.id,
          })),
        };
      }
      if (scored.length === 1) {
        const p = scored[0].p;
        return { source: "folk", match_confidence: "moyenne", email: p.emails ?? [], telephone: p.phones ?? [], folk_id: p.id };
      }
    } catch {
      // Folk indisponible → on tente Google.
    }
  }

  // 2) Google Contacts (repli).
  if (hasGoogleSync()) {
    try {
      const token = await googleAccessToken();
      if (token) {
        const hit = await searchGoogleContact(token, nom);
        if (hit && (hit.emails.length || hit.phones.length)) {
          return { source: "google", match_confidence: "haute", email: hit.emails, telephone: hit.phones };
        }
      }
    } catch {
      /* repli silencieux : on renvoie vide */
    }
  }

  return empty;
}
