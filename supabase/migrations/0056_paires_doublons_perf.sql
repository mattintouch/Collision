-- 0056 — la passe rétroactive de doublons tenait dans l'éditeur SQL, pas dans
-- l'API (25/09).
--
-- Constat : audit_doublons répondait « canceling statement due to statement
-- timeout ». La même requête aboutit dans l'éditeur Supabase, dont le délai de
-- garde est plus large. La cause n'est pas le volume de résultats mais le
-- nombre d'appels : l'auto-jointure évaluait norm_nom sur CHAQUE paire, soit le
-- carré du nombre de cibles, pour une fonction qui enchaîne unaccent, deux
-- expressions régulières et un tri de jetons.
--
-- Correction : normaliser UNE fois par cible dans une CTE materialized, puis
-- joindre sur le résultat. Le nombre d'évaluations de norm_nom passe du carré
-- au simple. La fonction porte en plus son propre délai de garde, pour ne plus
-- dépendre de celui de l'appelant.
--
-- Aucun changement de sémantique : mêmes paires, mêmes seuils, même tri.
-- Rejouable (create or replace).

create or replace function public.paires_doublons(p_seuil real default 0.55, p_limite int default 500)
returns table (a_id uuid, a_nom text, b_id uuid, b_nom text, champ text, sim real, lev int, show_id uuid)
language sql stable
set search_path = public, extensions
set statement_timeout = '120s'
as $$
  with n as materialized (
    select c.id, c.show_id, c.nom,
           public.norm_nom(c.nom) as nn,
           c.organisation,
           public.norm_nom(c.organisation) as no
    from public.cibles c
  ),
  a as materialized (
    select al.cible_id, al.alias_norm from public.cible_alias al where al.alias_norm <> ''
  )
  select * from (
    select c1.id, c1.nom, c2.id, c2.nom, 'nom'::text,
           similarity(c1.nn, c2.nn),
           levenshtein(left(c1.nn, 120), left(c2.nn, 120)),
           c1.show_id
    from n c1 join n c2 on c1.show_id = c2.show_id and c1.id < c2.id
    where c1.nn <> c2.nn -- les identiques relèvent du P1 existant
      and similarity(c1.nn, c2.nn) >= p_seuil
    union all
    select c1.id, c1.nom, c2.id, c2.nom, 'alias',
           similarity(c1.nn, al.alias_norm),
           levenshtein(left(c1.nn, 120), left(al.alias_norm, 120)),
           c1.show_id
    from n c1
    join a al on true
    join n c2 on c2.id = al.cible_id and c2.show_id = c1.show_id and c1.id <> c2.id
    where similarity(c1.nn, al.alias_norm) >= p_seuil
    union all
    select c1.id, c1.nom, c2.id, c2.nom, 'organisation',
           similarity(c1.nn, c2.no),
           levenshtein(left(c1.nn, 120), left(c2.no, 120)),
           c1.show_id
    from n c1 join n c2 on c1.show_id = c2.show_id and c1.id <> c2.id
    where c2.organisation is not null
      and similarity(c1.nn, c2.no) >= p_seuil
  ) t (a_id, a_nom, b_id, b_nom, champ, sim, lev, show_id)
  order by t.sim desc
  limit p_limite
$$;

-- Même traitement pour la recherche à la création : elle passe par l'API à
-- chaque create_cible, c'est le chemin le plus sensible au délai de garde.
-- L'opérateur % reste indexé (GIN trigramme sur norm_nom(nom)), donc cette
-- fonction ne scanne pas toute la table ; le délai explicite la protège d'une
-- base qui grossit.
create or replace function public.candidats_doublon(p_show uuid, p_nom text, p_limite int default 10)
returns table (cible_id uuid, nom text, champ text, valeur text, sim real, lev int, organisation text, role text, archive boolean)
language sql stable
set search_path = public, extensions
set statement_timeout = '20s'
as $$
  with q as (select public.norm_nom(p_nom) as n)
  select t.cible_id, t.nom, t.champ, t.valeur, t.sim, t.lev, t.organisation, t.role, t.archive
  from (
    select c.id as cible_id, c.nom, 'nom'::text as champ, public.norm_nom(c.nom) as valeur,
           similarity(public.norm_nom(c.nom), q.n) as sim,
           levenshtein(left(public.norm_nom(c.nom), 120), left(q.n, 120)) as lev,
           c.organisation, c.role, c.archive
    from public.cibles c, q
    where c.show_id = p_show and public.norm_nom(c.nom) % q.n
    union all
    select c.id, c.nom, 'alias', al.alias_norm,
           similarity(al.alias_norm, q.n),
           levenshtein(left(al.alias_norm, 120), left(q.n, 120)),
           c.organisation, c.role, c.archive
    from public.cible_alias al join public.cibles c on c.id = al.cible_id, q
    where c.show_id = p_show and al.alias_norm % q.n
    union all
    select c.id, c.nom, 'organisation', public.norm_nom(c.organisation),
           similarity(public.norm_nom(c.organisation), q.n),
           levenshtein(left(public.norm_nom(c.organisation), 120), left(q.n, 120)),
           c.organisation, c.role, c.archive
    from public.cibles c, q
    where c.show_id = p_show and c.organisation is not null and public.norm_nom(c.organisation) % q.n
    union all
    select c.id, c.nom, 'role', public.norm_nom(c.role),
           similarity(public.norm_nom(c.role), q.n),
           levenshtein(left(public.norm_nom(c.role), 120), left(q.n, 120)),
           c.organisation, c.role, c.archive
    from public.cibles c, q
    where c.show_id = p_show and c.role is not null and public.norm_nom(c.role) % q.n
  ) t
  order by t.sim desc
  limit p_limite
$$;
