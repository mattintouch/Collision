#!/usr/bin/env node
// S1b / décision #2 — générateur de la vue `cibles_enrichies`.
//
// Fin du `c.*` figé : les colonnes de la cible exposées par la vue sont
// ÉNUMÉRÉES ici, source de vérité unique. Quand une colonne est ajoutée à la
// table `cibles`, on l'ajoute à CIBLE_COLUMNS puis on régénère la migration :
//
//     npm run gen:view
//
// Le fichier produit (supabase/migrations/0028_view_explicite.sql) est comparé
// à cette sortie par un test (test/view.test.ts) : toute dérive entre la liste
// et la migration commit fait échouer la CI, donc le déploiement (S1a).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Colonnes de public.cibles, dans l'ordre de déclaration (0001 puis ALTER).
// Doit refléter EXACTEMENT le schéma ; sinon la vue perd/masque des colonnes.
export const CIBLE_COLUMNS = [
  "id",
  "show_id",
  "kind",
  "nom",
  "stage_id",
  "priorite",
  "voie",
  "sujets",
  "canal_reel",
  "via_qui",
  "date_derniere_touche",
  "role",
  "organisation",
  "archetype",
  "secteur",
  "pays",
  "envergure",
  "raison_de_selection",
  "etat_recherche",
  "created_by",
  "created_at",
  "updated_at",
  "photo_url",
  "ville",
  "archive",
  "playbook",
  "folk_id",
  "google_resource_name",
  "google_etag",
  "note",
  "note_priorite",
];

// Types de contact qui rendent un relais JOIGNABLE (cf. migration 0027).
export const ACTIONABLE_CONTACT_KINDS = ["email", "telephone", "reseau", "portier", "agence"];

export const VIEW_MIGRATION_FILENAME = "0028_view_explicite.sql";

/** Construit le texte complet de la migration de recréation de la vue. */
export function buildViewMigration() {
  const cols = CIBLE_COLUMNS.map((c) => `  c.${c}`).join(",\n");
  const kinds = ACTIONABLE_CONTACT_KINDS.map((k) => `'${k}'`).join(", ");
  return `-- S1b / décision #2 — vue \`cibles_enrichies\` à COLONNES EXPLICITES (fin du select-étoile figé).
-- Fichier GÉNÉRÉ par \`npm run gen:view\` (scripts/gen-view.mjs). Ne pas éditer à
-- la main : modifier CIBLE_COLUMNS dans le script puis régénérer. Un test de
-- dérive (test/view.test.ts) garantit que ce fichier reste synchrone.
--
-- Recréation à l'identique fonctionnel de 0027 (mêmes colonnes calculées, même
-- décompte nb_relais_actionnables), colonnes de la cible désormais énumérées.

drop view if exists public.cibles_enrichies;
create view public.cibles_enrichies
with (security_invoker = true) as
select
${cols},
  st.key   as stage_key,
  st.label as stage_label,
  st.position as stage_position,
  case
    when c.date_derniere_touche is null then null
    else extract(day from now() - c.date_derniere_touche)::int
  end as jours_depuis_touche,
  ls.type as dernier_signal_type,
  ls.date as dernier_signal_date,
  ls.pertinence as dernier_signal_pertinence,
  case
    when ls.date is null then false
    else ls.date > now() - interval '30 days'
  end as signal_frais,
  (select array_agg(w.key order by w.key)
     from public.cible_watchlists cw
     join public.watchlists w on w.id = cw.watchlist_id
    where cw.cible_id = c.id) as watchlist_keys,
  (select count(*) from public.appuis a where a.cible_id = c.id) as nb_appuis,
  (select count(*) from public.appuis a
     where a.cible_id = c.id
       and a.est_relais = true
       and exists (
         select 1 from public.contacts ct
          where ct.appui_id = a.id
            and ct.kind::text in (${kinds})
       )) as nb_relais_actionnables
from public.cibles c
left join public.stages st on st.id = c.stage_id
left join lateral (
  select s.type, s.date, s.pertinence
    from public.signals s
   where s.cible_id = c.id
   order by s.date desc
   limit 1
) ls on true;
`;
}

// Exécution directe : (ré)écrit la migration.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "migrations", VIEW_MIGRATION_FILENAME);
  writeFileSync(out, buildViewMigration());
  console.log(`Vue régénérée → supabase/migrations/${VIEW_MIGRATION_FILENAME} (${CIBLE_COLUMNS.length} colonnes cible).`);
}
