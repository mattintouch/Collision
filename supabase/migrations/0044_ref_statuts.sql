-- Intégration du schéma de référence (séminaire IA, GO Matthieu du 28/07),
-- pièce 1/4 : la table des valeurs de statut.
--
-- Exigence de conception (Matthieu) : créer et modifier des valeurs de statut
-- SANS migration lourde. Les enums Postgres du schéma de Louis deviennent une
-- table de référence unique : ajouter une valeur = un INSERT. Les colonnes de
-- statut restent en text ; la validation est applicative (console et MCP
-- lisent ref_statuts). Valeurs seed : celles de Louis, verbatim (28/07).

create table if not exists public.ref_statuts (
  domaine    text not null,             -- contact_statut, production_statut, media_statut, genre, niveau_priorite
  valeur     text not null,
  position   int  not null default 0,   -- ordre d'affichage dans les listes
  actif      boolean not null default true, -- retirer une valeur = actif=false, jamais de DELETE
  created_at timestamptz not null default now(),
  primary key (domaine, valeur)
);

alter table public.ref_statuts enable row level security;
create policy ref_statuts_read on public.ref_statuts for select using (auth.uid() is not null);
-- Écriture via service role uniquement (outillage admin) : pas de policy d'écriture.

-- Statut contact (valeurs exactes de Louis, 28/07).
insert into public.ref_statuts (domaine, valeur, position) values
  ('contact_statut', 'À valider', 1),
  ('contact_statut', 'Idée à creuser', 2),
  ('contact_statut', 'À contacter', 3),
  ('contact_statut', 'Contacté', 4),
  ('contact_statut', 'À suivre', 5),
  ('contact_statut', 'À relancer', 6),
  ('contact_statut', 'En discussion', 7),
  ('contact_statut', 'À recontacter plus tard', 8),
  ('contact_statut', 'En cours de booking', 9),
  ('contact_statut', 'À rebooker', 10),
  ('contact_statut', 'Booké', 11),
  ('contact_statut', 'Enregistré', 12),
  ('contact_statut', 'No go invité', 13),
  ('contact_statut', 'No go GDIY', 14)
on conflict (domaine, valeur) do nothing;

-- Statut de production (script, montage, illustration).
insert into public.ref_statuts (domaine, valeur, position) values
  ('production_statut', 'à faire', 1),
  ('production_statut', 'en cours', 2),
  ('production_statut', 'à revoir', 3),
  ('production_statut', 'en review', 4),
  ('production_statut', 'validé', 5)
on conflict (domaine, valeur) do nothing;

-- Statut des médias courts (shorts, teasers) : mêmes valeurs que production
-- (réponse de Louis du 28/07), domaine séparé pour pouvoir diverger sans
-- toucher la production.
insert into public.ref_statuts (domaine, valeur, position) values
  ('media_statut', 'à faire', 1),
  ('media_statut', 'en cours', 2),
  ('media_statut', 'à revoir', 3),
  ('media_statut', 'en review', 4),
  ('media_statut', 'validé', 5)
on conflict (domaine, valeur) do nothing;

insert into public.ref_statuts (domaine, valeur, position) values
  ('genre', 'homme', 1),
  ('genre', 'femme', 2),
  ('genre', 'autre', 3)
on conflict (domaine, valeur) do nothing;

insert into public.ref_statuts (domaine, valeur, position) values
  ('niveau_priorite', 'haute', 1),
  ('niveau_priorite', 'moyenne', 2),
  ('niveau_priorite', 'basse', 3)
on conflict (domaine, valeur) do nothing;
