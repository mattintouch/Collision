-- Priorité 1 + Complément 1 — rendre les appuis réellement actionnables.
--  • type de contact « portier » (assistant / gardien d'agenda) pour loger un
--    intermédiaire joignable (ex. l'assistante d'un relais) en donnée structurée,
--    plus jamais en note libre.
--  • lien Folk porté par l'appui (folk_id) : un relais nommé est rattaché à sa
--    fiche Folk existante (fin du « lie:false »).
--  • nb_relais_actionnables raffiné : un relais compte dès qu'il a une coordonnée
--    JOIGNABLE — directe (email/téléphone/réseau) OU un portier/agence — au lieu
--    de n'importe quel contact (un « site » ou un « autre » ne rendait pas
--    actionnable, mais surtout un numéro en note ne comptait pas du tout).

-- 1) Nouveau type de contact. IF NOT EXISTS = migration rejouable.
alter type contact_kind add value if not exists 'portier';

-- 2) Lien Folk sur l'appui.
alter table public.appuis add column if not exists folk_id text;
create index if not exists appuis_folk_id_idx on public.appuis(folk_id);

-- 3) Recréer la vue (c.* figé à la création) avec le décompte raffiné.
-- NB : on compare ct.kind::text à des littéraux texte — on ne référence donc pas
-- la valeur d'enum 'portier' comme enum, ce qui reste sûr même si l'ajout ci-dessus
-- est exécuté dans la même transaction que ce CREATE VIEW.
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
       and exists (
         select 1 from public.contacts ct
          where ct.appui_id = a.id
            and ct.kind::text in ('email', 'telephone', 'reseau', 'portier', 'agence')
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
