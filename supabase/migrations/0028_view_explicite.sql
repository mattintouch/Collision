-- S1b / décision #2 — vue `cibles_enrichies` à COLONNES EXPLICITES (fin du select-étoile figé).
-- Fichier GÉNÉRÉ par `npm run gen:view` (scripts/gen-view.mjs). Ne pas éditer à
-- la main : modifier CIBLE_COLUMNS dans le script puis régénérer. Un test de
-- dérive (test/view.test.ts) garantit que ce fichier reste synchrone.
--
-- Recréation à l'identique fonctionnel de 0027 (mêmes colonnes calculées, même
-- décompte nb_relais_actionnables), colonnes de la cible désormais énumérées.

drop view if exists public.cibles_enrichies;
create view public.cibles_enrichies
with (security_invoker = true) as
select
  c.id,
  c.show_id,
  c.kind,
  c.nom,
  c.stage_id,
  c.priorite,
  c.voie,
  c.sujets,
  c.canal_reel,
  c.via_qui,
  c.date_derniere_touche,
  c.role,
  c.organisation,
  c.archetype,
  c.secteur,
  c.pays,
  c.envergure,
  c.raison_de_selection,
  c.etat_recherche,
  c.created_by,
  c.created_at,
  c.updated_at,
  c.photo_url,
  c.ville,
  c.archive,
  c.playbook,
  c.folk_id,
  c.google_resource_name,
  c.google_etag,
  c.note,
  c.note_priorite,
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
