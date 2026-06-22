-- Magellan — un appui peut être relié à la FICHE d'un allié (cible↔cible),
-- pas seulement à un nom. Ex : Patrick Sayer (cible) = allié pour closer JMM (cible).

alter table public.appuis
  add column if not exists ally_cible_id uuid references public.cibles(id) on delete set null;

create index if not exists appuis_ally_idx on public.appuis(ally_cible_id);
