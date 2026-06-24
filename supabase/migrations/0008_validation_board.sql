-- Magellan — détails d'enregistrement sur l'épisode + ordre des colonnes du board.

-- Détails capturés à la validation (lieu, participants invités).
alter table public.episodes
  add column if not exists lieu text,
  add column if not exists attendees text[] not null default '{}';

-- Ordre personnalisé des colonnes d'archétype du board (par show).
alter table public.shows
  add column if not exists archetype_order text[];
