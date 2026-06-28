-- Audit live 28/06 — [C1] score composite & [C4] détection placeholder.
-- Le score se calcule au read-time (aucune colonne stockée), mais il a besoin
-- de distinguer un appui « relais actionnable » (est_relais=true ET au moins une
-- coordonnée) d'un simple appui. On expose ce décompte dans la vue.
--
-- Recréer la vue (c.* figé à la création) en ajoutant nb_relais_actionnables.

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
  (select array_agg(w.key order by w.key)
     from public.cible_watchlists cw
     join public.watchlists w on w.id = cw.watchlist_id
    where cw.cible_id = c.id) as watchlist_keys,
  (select count(*) from public.appuis a where a.cible_id = c.id) as nb_appuis,
  (select count(*) from public.appuis a
     where a.cible_id = c.id
       and a.est_relais = true
       and exists (select 1 from public.contacts ct where ct.appui_id = a.id)) as nb_relais_actionnables
from public.cibles c
left join public.stages st on st.id = c.stage_id
left join lateral (
  select s.type, s.date, s.pertinence
    from public.signals s
   where s.cible_id = c.id
   order by s.date desc
   limit 1
) ls on true;
