-- Intégration du schéma de référence, pièce 2/4 : extension de cibles.
--
-- Les attributs de la table contacts du schéma de référence (Louis, séminaire
-- IA) deviennent des colonnes de cibles. Tout est ADDITIF : colonnes nullable
-- ou avec défaut, aucune colonne existante modifiée ni supprimée (rapport de
-- phase 1 du 28/07, GO Matthieu). email / telephone / linkedin / allies / rp /
-- dir_comm_assistante / date_enregistrement ne sont PAS des colonnes : ce sont
-- des projections en lecture dans la vue cibles_enrichies (0028 régénérée).

alter table public.cibles
  add column if not exists prenom           text,
  add column if not exists genre            text,
  add column if not exists categorie        text[]  not null default '{}',
  add column if not exists serie_speciale   text[]  not null default '{}',
  add column if not exists premiere_neige   boolean not null default false,
  add column if not exists tag_investisseur boolean not null default false,
  add column if not exists social_score     integer not null default 0,
  add column if not exists statut_ref       text,
  add column if not exists date_relance     date,
  add column if not exists date_contact     date;

-- Garde le CHECK de Louis sur social_score (0 à 3), nommé pour être amendable.
do $$ begin
  alter table public.cibles add constraint cibles_social_score_0_3 check (social_score between 0 and 3);
exception when duplicate_object then null; end $$;

-- Deux natures d'appui du schéma de référence (rp, dir_comm_assistante),
-- projetées ensuite par la vue. ADD VALUE est l'opération la plus légère ;
-- les valeurs ne sont pas utilisées dans cette migration (contrainte PG).
alter type appui_type add value if not exists 'rp';
alter type appui_type add value if not exists 'dir_comm_assistante';

-- Mapping stage vers statut de référence (validé par Matthieu le 28/07 sur
-- les valeurs réelles de Louis). Modifiable par UPDATE, jamais de migration.
create table if not exists public.stage_statut_map (
  stage_key text primary key,
  statut    text not null
);
alter table public.stage_statut_map enable row level security;
create policy stage_statut_map_read on public.stage_statut_map for select using (auth.uid() is not null);

insert into public.stage_statut_map (stage_key, statut) values
  ('identifie',  'À valider'),
  ('qualifie',   'À contacter'),
  ('contacte',   'Contacté'),
  ('confirme',   'En cours de booking'),
  ('programme',  'Booké'),
  ('enregistre', 'Enregistré'),
  ('publie',     'Enregistré')  -- la publication se lit sur l'épisode
on conflict (stage_key) do nothing;

-- Synchronisation à SENS UNIQUE stage vers statut_ref : posée à la création
-- et à chaque changement réel de stage. Les valeurs fines de Louis (À suivre,
-- En discussion, À rebooker, les no go...) se posent à la main et survivent
-- tant que le stage ne bouge pas. L'archivage ne touche jamais le statut
-- (la raison d'un no go n'est pas déductible, décision du rapport).
create or replace function public.sync_statut_ref()
returns trigger language plpgsql as $$
declare v_statut text;
begin
  select m.statut into v_statut
    from public.stages s
    join public.stage_statut_map m on m.stage_key = s.key
   where s.id = new.stage_id;
  if v_statut is not null then
    new.statut_ref = v_statut;
  end if;
  return new;
end $$;

drop trigger if exists cibles_statut_ref_insert on public.cibles;
create trigger cibles_statut_ref_insert
  before insert on public.cibles
  for each row execute function public.sync_statut_ref();

drop trigger if exists cibles_statut_ref_update on public.cibles;
create trigger cibles_statut_ref_update
  before update of stage_id on public.cibles
  for each row
  when (old.stage_id is distinct from new.stage_id)
  execute function public.sync_statut_ref();

-- Pose initiale : les 600 et quelques cibles existantes reçoivent leur statut
-- de référence depuis leur stage courant. Ne touche jamais un statut déjà posé.
update public.cibles c
   set statut_ref = m.statut
  from public.stages s
  join public.stage_statut_map m on m.stage_key = s.key
 where s.id = c.stage_id
   and c.statut_ref is null;
