-- Intégration du schéma de référence, pièce 3/4 : le domaine PUBLICATION sur
-- episodes. Intégralité de la table episodes du schéma de Louis, en additif :
-- colonnes nullable ou avec défaut, rien de modifié, rien de supprimé.
-- Écart assumé au DDL de Louis (rapport de phase 1, avis critique 1) : pas de
-- NOT NULL DEFAULT '' (la chaîne vide comme faux null fausse les comptages) ;
-- les champs texte sont nullable, les listes ont un défaut vide.

alter table public.episodes
  -- Identité de publication
  add column if not exists numero                 integer,
  add column if not exists titre                  text,
  add column if not exists description_site      text,
  add column if not exists description_youtube   text,
  add column if not exists description_rss       text,
  -- Visuels
  add column if not exists miniature_v1          text,
  add column if not exists miniature_v2          text,
  add column if not exists miniature_v3          text,
  add column if not exists visuel_public_ecoute  text,
  add column if not exists visuel_public_instagram text,
  add column if not exists photo_post_linkedin   text,
  -- Contenus
  add column if not exists date_publication      date,
  add column if not exists transcript            text,
  add column if not exists notes_clemence        text,
  add column if not exists fiche_prepa           text, -- lien externe ; la fiche Magellan native est projetée par l'applicatif
  add column if not exists liens_livres          text[] not null default '{}',
  add column if not exists episodes_mentionnes   text[] not null default '{}',
  add column if not exists seo_liens             text[] not null default '{}',
  add column if not exists chapitres             jsonb  not null default '[]'::jsonb,
  add column if not exists contenu_linkedin      text,
  -- Médias courts
  add column if not exists shorts_script         text,
  add column if not exists shorts_statut         text,
  add column if not exists shorts_lien           text,
  add column if not exists teaser_reseaux_script text,
  add column if not exists teaser_reseaux_statut text,
  add column if not exists teaser_reseaux_lien   text,
  add column if not exists teaser_youtube_script text,
  add column if not exists teaser_youtube_statut text,
  add column if not exists teaser_youtube_lien   text,
  add column if not exists extraits              jsonb not null default '[]'::jsonb,
  add column if not exists sponsors              text,
  add column if not exists timestamp_hr          jsonb not null default '[]'::jsonb,
  -- Liens plateformes
  add column if not exists lien_youtube          text,
  add column if not exists lien_apple_podcast    text,
  add column if not exists lien_spotify          text,
  add column if not exists lien_amazon_music     text,
  add column if not exists lien_deezer           text,
  -- Statuts de production (valeurs : ref_statuts, domaine production_statut)
  add column if not exists statut_script         text not null default 'à faire',
  add column if not exists statut_montage        text not null default 'à faire',
  add column if not exists statut_illustration   text not null default 'à faire',
  -- Verrou de publication (règle 3 du brief) : une fois posé, les champs de
  -- publication passent en lecture seule côté applicatif, sauf profil admin.
  -- Verrou applicatif, pas de contrainte base.
  add column if not exists published_locked_at   timestamptz;

-- Le numero de Louis est UNIQUE NOT NULL ; les épisodes Magellan existants
-- n'ont pas encore de numéro (backfill éditorial de phase 2, spot check).
-- Unicité garantie dès qu'un numéro est posé, sans casser l'existant.
create unique index if not exists episodes_numero_unique
  on public.episodes (numero) where numero is not null;

-- L'ancien statut fourre-tout est remplacé par les trois statuts fins.
-- Conservé (aucune suppression), plus jamais écrit après rebranchement.
comment on column public.episodes.statut_prod is
  'DEPRECATED (28/07/2026, intégration du schéma de référence) : remplacé par statut_script, statut_montage, statut_illustration. Conservé pour historique, ne plus écrire.';
