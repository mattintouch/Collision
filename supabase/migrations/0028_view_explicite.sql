-- S1b / décision #2 — vue `cibles_enrichies` à COLONNES EXPLICITES (fin du select-étoile figé).
-- Fichier GÉNÉRÉ par `npm run gen:view` (scripts/gen-view.mjs). Ne pas éditer à
-- la main : modifier CIBLE_COLUMNS dans le script puis régénérer. Un test de
-- dérive (test/view.test.ts) garantit que ce fichier reste synchrone.
--
-- Colonnes calculées de 0027 (stage, signal, watchlists, appuis) plus les
-- PROJECTIONS du schéma de référence (28/07) : email, telephone, linkedin,
-- allies, rp, dir_comm_assistante, date_enregistrement et les alias
-- entreprise, notes_prepa, niveau_priorite. Écriture toujours par les tables
-- sources. À réappliquer APRÈS 0045 et 0046 (colonnes et natures d'appui).

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
  c.prenom,
  c.genre,
  c.categorie,
  c.serie_speciale,
  c.premiere_neige,
  c.tag_investisseur,
  c.social_score,
  c.statut_ref,
  c.date_relance,
  c.date_contact,
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
       )) as nb_relais_actionnables,
  -- Schéma de référence (28/07) : PROJECTIONS en lecture. L'écriture passe
  -- toujours par les tables sources (contacts, appuis, episodes) ; ces
  -- colonnes donnent au schéma de Louis exactement ses attributs, alimentés
  -- par le modèle normalisé (coordonnée principale : vérifiée d'abord, puis
  -- confiance, puis récence).
  (select ct.valeur from public.contacts ct
    where ct.cible_id = c.id and ct.kind::text = 'email'
    order by ct.verifie desc, ct.confiance desc, ct.created_at desc
    limit 1) as email,
  (select ct.valeur from public.contacts ct
    where ct.cible_id = c.id and ct.kind::text = 'telephone'
    order by ct.verifie desc, ct.confiance desc, ct.created_at desc
    limit 1) as telephone,
  (select ct.valeur from public.contacts ct
    where ct.cible_id = c.id and ct.kind::text = 'reseau'
      and ct.valeur ilike '%linkedin%'
    order by ct.verifie desc, ct.confiance desc, ct.created_at desc
    limit 1) as linkedin,
  (select string_agg(a.nom, ', ' order by a.est_relais desc, a.created_at)
     from public.appuis a
    where a.cible_id = c.id
      and a.type::text not in ('rp', 'dir_comm_assistante')) as allies,
  (select string_agg(a.nom, ', ' order by a.created_at)
     from public.appuis a
    where a.cible_id = c.id and a.type::text = 'rp') as rp,
  (select string_agg(a.nom, ', ' order by a.created_at)
     from public.appuis a
    where a.cible_id = c.id and a.type::text = 'dir_comm_assistante') as dir_comm_assistante,
  (select e.date_enregistrement from public.episodes e
    where e.cible_id = c.id
    order by e.created_at desc
    limit 1) as date_enregistrement,
  c.organisation as entreprise,
  c.note as notes_prepa,
  c.priorite::text as niveau_priorite
from public.cibles c
left join public.stages st on st.id = c.stage_id
left join lateral (
  select s.type, s.date, s.pertinence
    from public.signals s
   where s.cible_id = c.id
   order by s.date desc
   limit 1
) ls on true;
