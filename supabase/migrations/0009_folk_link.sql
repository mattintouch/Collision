-- Lien Folk : on stocke l'id de la personne Folk sur la cible, pour pouvoir
-- resynchroniser coordonnées et lire la dernière interaction (Folk = source de
-- vérité). Renseigné à l'import Folk.

alter table public.cibles add column if not exists folk_id text;
create index if not exists cibles_folk_id_idx on public.cibles(folk_id);

-- La vue fige `c.*` à sa création : il faut la recréer pour exposer folk_id.
-- (create or replace refuse d'insérer une colonne au milieu, d'où le drop.)
drop view if exists public.cibles_enrichies;
create view public.cibles_enrichies
with (security_invoker = true) as
select
  c.*,
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
  (select count(*) from public.appuis a where a.cible_id = c.id) as nb_appuis
from public.cibles c
left join public.stages st on st.id = c.stage_id
left join lateral (
  select s.type, s.date, s.pertinence
    from public.signals s
   where s.cible_id = c.id
   order by s.date desc
   limit 1
) ls on true;
