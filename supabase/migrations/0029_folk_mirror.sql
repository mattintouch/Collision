-- S4 — miroir local du carnet Folk. L'API Folk n'a pas de recherche serveur
-- (fetchFolkPeople pagine tout le carnet), donc resolve_contact tirait tout à
-- chaque appel. Ce miroir, rafraîchi par le cron, permet une résolution rapide
-- (index) et tolérante aux accents (nom_normalise) sans accès réseau à Folk.
--
-- Zéro régression avant peuplement : resolveContact interroge le miroir en
-- priorité et retombe sur le fetch live si le miroir est absent ou vide.

create extension if not exists pg_trgm;

create table if not exists public.folk_people (
  id            text primary key,           -- id de la personne Folk
  nom           text,
  nom_normalise text,                        -- minuscule, sans accents (normName)
  emails        jsonb not null default '[]',
  phones        jsonb not null default '[]',
  updated_at    timestamptz not null default now()
);

-- Index trgm pour la recherche floue / contains sur le nom normalisé.
create index if not exists folk_people_nom_norm_trgm
  on public.folk_people using gin (nom_normalise gin_trgm_ops);

alter table public.folk_people enable row level security;
-- Lecture pour tout utilisateur authentifié ; l'écriture passe par le service
-- role (cron / MCP), qui contourne la RLS.
create policy folk_people_read on public.folk_people
  for select using (auth.uid() is not null);
