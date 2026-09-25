-- 0054 — anti-doublon à la création et résorption rétroactive (brief du 21/09).
-- Constat : « Major Movement » créé face à « Grégoire Gibault » (Major
-- Mouvement déjà en organisation) et « Neil Zghidour » face à « Neil
-- Zeghidour » (distance d'édition 1). Le contrôle P1 ne compare que le nom
-- normalisé EXACT : ces deux cas repasseraient.
--
-- Pose : extensions (pg_trgm pour le blocking indexé GIN, fuzzystrmatch pour
-- levenshtein en second filtre, unaccent pour la normalisation ; la
-- phonétique anglophone soundex/metaphone est ÉCARTÉE, elle dégrade sur les
-- patronymes non anglophones), fonction de normalisation norm_nom, table
-- d'alias par cible (alimentée par les fusions et l'enrichissement), drapeau
-- doublon_suspect sur cibles, et deux fonctions de recherche : candidats à la
-- création, paires pour la passe rétroactive.
--
-- Rejouable sans risque (if not exists / or replace). Le code applicatif est
-- défensif dans les deux sens : sans cette migration, le contrôle P1 actuel
-- (nom normalisé exact) continue de fonctionner seul.

create extension if not exists unaccent;
create extension if not exists pg_trgm;
create extension if not exists fuzzystrmatch;

-- unaccent est STABLE (dictionnaire), les index exigent IMMUTABLE : wrapper
-- figé sur le dictionnaire unaccent (pratique standard).
--
-- CORRECTION DU 25/09, constatée à l'application : Supabase installe les
-- extensions dans le schéma `extensions`, pas dans `public`. Qualifier
-- `public.unaccent` échouait donc. Les fonctions portent désormais leur propre
-- search_path, ce qui les rend insensibles au schéma d'installation ET au
-- search_path de l'appelant (un cron, un connecteur, l'éditeur SQL).
create or replace function public.f_unaccent(text) returns text
language sql immutable parallel safe strict
set search_path = public, extensions
as $$ select unaccent('unaccent'::regdictionary, $1) $$;

-- Normalisation de comparaison : minuscules, accents retirés, contenu entre
-- parenthèses retiré, ponctuation en espace, particules retirées, tokens
-- TRIÉS (l'ordre prénom/nom ou nom de scène inversé ne compte plus).
create or replace function public.norm_nom(text) returns text
language sql immutable parallel safe
set search_path = public, extensions
as $$
  select coalesce((
    select string_agg(t, ' ' order by t)
    from unnest(string_to_array(
      regexp_replace(
        regexp_replace(lower(public.f_unaccent(coalesce($1, ''))), '\(.*?\)', ' ', 'g'),
        '[^a-z0-9]+', ' ', 'g'
      ), ' ')) as t
    where t <> ''
      and t not in ('de','du','des','la','le','les','von','van','der','den','ter','el','al','di','da','del','della','dos','das','do','bin','ben','ibn')
  ), '')
$$;

-- Alias par cible : le nom de l'absorbée à chaque fusion, les pseudos posés
-- par l'enrichissement, les ajouts manuels.
create table if not exists cible_alias (
  id uuid primary key default gen_random_uuid(),
  cible_id uuid not null references cibles(id) on delete cascade,
  alias text not null,
  alias_norm text generated always as (norm_nom(alias)) stored,
  source text not null default 'manuel', -- fusion | enrichissement | manuel
  created_at timestamptz not null default now()
);
create unique index if not exists cible_alias_unq on cible_alias (cible_id, alias_norm);
create index if not exists cible_alias_trgm on cible_alias using gin (alias_norm gin_trgm_ops);

-- Blocking indexé : trigrammes sur le nom, l'organisation et le rôle normalisés.
create index if not exists cibles_nom_norm_trgm on cibles using gin (norm_nom(nom) gin_trgm_ops);
create index if not exists cibles_org_norm_trgm on cibles using gin (norm_nom(organisation) gin_trgm_ops);
create index if not exists cibles_role_norm_trgm on cibles using gin (norm_nom(role) gin_trgm_ops);

-- Drapeau de création en zone grise : la cible est créée (jamais bloquée à
-- tort, le faux négatif prime) mais versée à la file d'arbitrage. Le champ
-- porte les candidats et le verdict LLM ; null = rien à arbitrer.
alter table cibles add column if not exists doublon_suspect jsonb;

-- Candidats de doublon d'un nom sur un show (création) : blocking pg_trgm via
-- l'opérateur % (indexé GIN) sur {nom, alias, organisation, rôle}, similarité
-- et levenshtein remontés pour le second filtre côté code. Les archivées
-- comptent (une absorbée reste un signal).
create or replace function candidats_doublon(p_show uuid, p_nom text, p_limite int default 10)
returns table (cible_id uuid, nom text, champ text, valeur text, sim real, lev int, organisation text, role text, archive boolean)
language sql stable
set search_path = public, extensions
as $$
  with q as (select norm_nom(p_nom) as n)
  select t.cible_id, t.nom, t.champ, t.valeur, t.sim, t.lev, t.organisation, t.role, t.archive
  from (
    select c.id as cible_id, c.nom, 'nom'::text as champ, norm_nom(c.nom) as valeur,
           similarity(norm_nom(c.nom), q.n) as sim,
           levenshtein(left(norm_nom(c.nom), 120), left(q.n, 120)) as lev,
           c.organisation, c.role, c.archive
    from cibles c, q
    where c.show_id = p_show and norm_nom(c.nom) % q.n
    union all
    select c.id, c.nom, 'alias', a.alias_norm,
           similarity(a.alias_norm, q.n),
           levenshtein(left(a.alias_norm, 120), left(q.n, 120)),
           c.organisation, c.role, c.archive
    from cible_alias a join cibles c on c.id = a.cible_id, q
    where c.show_id = p_show and a.alias_norm % q.n
    union all
    select c.id, c.nom, 'organisation', norm_nom(c.organisation),
           similarity(norm_nom(c.organisation), q.n),
           levenshtein(left(norm_nom(c.organisation), 120), left(q.n, 120)),
           c.organisation, c.role, c.archive
    from cibles c, q
    where c.show_id = p_show and c.organisation is not null and norm_nom(c.organisation) % q.n
    union all
    select c.id, c.nom, 'role', norm_nom(c.role),
           similarity(norm_nom(c.role), q.n),
           levenshtein(left(norm_nom(c.role), 120), left(q.n, 120)),
           c.organisation, c.role, c.archive
    from cibles c, q
    where c.show_id = p_show and c.role is not null and norm_nom(c.role) % q.n
  ) t
  order by t.sim desc
  limit p_limite
$$;

-- Paires candidates pour la passe RÉTROACTIVE (une fois, sortie en file
-- d'arbitrage, aucune fusion automatique) : auto-jointure par show sur
-- nom contre nom, nom contre alias et nom contre organisation. Volume actuel
-- (moins de mille cibles) : le scan est acceptable pour une passe unique.
create or replace function paires_doublons(p_seuil real default 0.55, p_limite int default 500)
returns table (a_id uuid, a_nom text, b_id uuid, b_nom text, champ text, sim real, lev int, show_id uuid)
language sql stable
set search_path = public, extensions
as $$
  select * from (
    select c1.id, c1.nom, c2.id, c2.nom, 'nom'::text,
           similarity(norm_nom(c1.nom), norm_nom(c2.nom)),
           levenshtein(left(norm_nom(c1.nom), 120), left(norm_nom(c2.nom), 120)),
           c1.show_id
    from cibles c1 join cibles c2 on c1.show_id = c2.show_id and c1.id < c2.id
    where similarity(norm_nom(c1.nom), norm_nom(c2.nom)) >= p_seuil
      and norm_nom(c1.nom) <> norm_nom(c2.nom) -- les identiques relèvent du P1 existant
    union all
    select c1.id, c1.nom, c2.id, c2.nom, 'alias',
           similarity(norm_nom(c1.nom), a.alias_norm),
           levenshtein(left(norm_nom(c1.nom), 120), left(a.alias_norm, 120)),
           c1.show_id
    from cibles c1
    join cible_alias a on a.alias_norm <> ''
    join cibles c2 on c2.id = a.cible_id and c2.show_id = c1.show_id and c1.id <> c2.id
    where similarity(norm_nom(c1.nom), a.alias_norm) >= p_seuil
    union all
    select c1.id, c1.nom, c2.id, c2.nom, 'organisation',
           similarity(norm_nom(c1.nom), norm_nom(c2.organisation)),
           levenshtein(left(norm_nom(c1.nom), 120), left(norm_nom(c2.organisation), 120)),
           c1.show_id
    from cibles c1 join cibles c2 on c1.show_id = c2.show_id and c1.id <> c2.id
    where c2.organisation is not null
      and similarity(norm_nom(c1.nom), norm_nom(c2.organisation)) >= p_seuil
  ) t (a_id, a_nom, b_id, b_nom, champ, sim, lev, show_id)
  order by t.sim desc
  limit p_limite
$$;
