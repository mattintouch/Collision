-- =====================================================================
-- Magellan — installation complète en un seul passage (Supabase SQL Editor)
-- Colle TOUT ce fichier, puis clique Run UNE fois.
--
-- Étape de remise à zéro : sûre ici, le projet est neuf (rien d'utile dedans).
-- Elle efface le schéma public et le recrée proprement avec les bons droits.
-- =====================================================================
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on routines to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;

-- ===================== 0001 schéma =====================
-- Magellan — Étape 1 : schéma de base (cahier des charges §4).
-- Base Postgres unique. Une donnée, un propriétaire unique.
-- Aucun actif lourd dans la base, uniquement des références.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Types énumérés du domaine
-- ---------------------------------------------------------------------------
create type pipe_type      as enum ('invites', 'thematique');
create type cible_kind     as enum ('personne', 'entreprise');
create type voie_type      as enum ('froid', 'chaud');
create type priorite_type  as enum ('haute', 'moyenne', 'basse');
create type archetype_type as enum ('big_fish', 'quick_win', 'pepite');
create type envergure_type as enum ('fr', 'international');
create type appui_type     as enum ('ancien_invite', 'conseiller', 'entourage', 'contact_interne');
create type touche_source  as enum ('saisie', 'capture');
create type signal_type    as enum ('levee', 'livre', 'nomination', 'prix', 'passage_media', 'mouvement_entreprise');
create type user_type       as enum ('admin', 'interne', 'externe');
create type show_role       as enum ('admin', 'interne', 'externe');

-- ---------------------------------------------------------------------------
-- Show : nom, type de pipe, étapes configurables (table dédiée, voir stages)
-- ---------------------------------------------------------------------------
create table public.shows (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  nom         text not null,
  type_pipe   pipe_type not null,
  couleur     text,                          -- signalétique du show (hex), pas couleur studio
  created_at  timestamptz not null default now()
);

-- Étapes ordonnées et configurables par show.
create table public.stages (
  id        uuid primary key default gen_random_uuid(),
  show_id   uuid not null references public.shows(id) on delete cascade,
  key       text not null,                   -- ex: identifie, qualifie, contacte...
  label     text not null,                   -- ex: "Identifié"
  position  int  not null,                   -- ordre dans la pipe
  is_final  boolean not null default false,  -- étape de validation -> bascule épisode
  unique (show_id, key),
  unique (show_id, position)
);

-- ---------------------------------------------------------------------------
-- Utilisateurs : profil applicatif adossé à auth.users + permissions par show
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nom         text,
  type        user_type not null default 'externe',
  created_at  timestamptz not null default now()
);

create table public.user_shows (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  show_id  uuid not null references public.shows(id) on delete cascade,
  role     show_role not null default 'interne',
  primary key (user_id, show_id)
);

-- ---------------------------------------------------------------------------
-- Cible : polymorphe personne / entreprise
-- ---------------------------------------------------------------------------
create table public.cibles (
  id                  uuid primary key default gen_random_uuid(),
  show_id             uuid not null references public.shows(id) on delete cascade,
  kind                cible_kind not null,
  nom                 text not null,
  stage_id            uuid references public.stages(id) on delete set null,
  priorite            priorite_type not null default 'moyenne',
  voie                voie_type not null default 'froid',
  sujets              text[] not null default '{}',
  canal_reel          text,                  -- canal réel (pas l'email par défaut)
  via_qui             text,                  -- par qui passer
  date_derniere_touche timestamptz,

  -- Champs personne (kind = 'personne')
  role                text,
  organisation        text,
  archetype           archetype_type,

  -- Champs entreprise (kind = 'entreprise')
  secteur             text,
  pays                text,
  envergure           envergure_type,
  raison_de_selection text,
  etat_recherche      text,

  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- Cohérence polymorphe : pas d'archétype sur une entreprise, etc.
  constraint cible_personne_fields check (
    kind <> 'personne' or (secteur is null and pays is null and envergure is null
      and raison_de_selection is null and etat_recherche is null)
  ),
  constraint cible_entreprise_fields check (
    kind <> 'entreprise' or (archetype is null and role is null)
  )
);

create index cibles_show_idx on public.cibles(show_id);
create index cibles_stage_idx on public.cibles(stage_id);
create index cibles_voie_idx on public.cibles(voie);

-- ---------------------------------------------------------------------------
-- Appui : qui ouvre une porte vers la cible
-- ---------------------------------------------------------------------------
create table public.appuis (
  id            uuid primary key default gen_random_uuid(),
  cible_id      uuid not null references public.cibles(id) on delete cascade,
  nom           text not null,
  organisation  text,
  type          appui_type not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index appuis_cible_idx on public.appuis(cible_id);

-- ---------------------------------------------------------------------------
-- Touche : journal des interactions (saisie ou capture lue par l'IA)
-- ---------------------------------------------------------------------------
create table public.touches (
  id          uuid primary key default gen_random_uuid(),
  cible_id    uuid not null references public.cibles(id) on delete cascade,
  date        timestamptz not null default now(),
  canal       text,
  contenu     text,
  source      touche_source not null default 'saisie',
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index touches_cible_idx on public.touches(cible_id, date desc);

-- ---------------------------------------------------------------------------
-- Signal : actualité de la cible (le déclencheur de résurgence le plus précieux)
-- ---------------------------------------------------------------------------
create table public.signals (
  id          uuid primary key default gen_random_uuid(),
  cible_id    uuid not null references public.cibles(id) on delete cascade,
  type        signal_type not null,
  date        timestamptz not null default now(),
  source      text,
  pertinence  int not null default 3 check (pertinence between 1 and 5),
  resume      text,
  created_at  timestamptz not null default now()
);
create index signals_cible_idx on public.signals(cible_id, date desc);

-- ---------------------------------------------------------------------------
-- Épisode : créé à la validation, hérite du contexte de la cible (Étape 6)
-- ---------------------------------------------------------------------------
create table public.episodes (
  id                  uuid primary key default gen_random_uuid(),
  cible_id            uuid not null references public.cibles(id) on delete cascade,
  show_id             uuid not null references public.shows(id) on delete cascade,
  nom                 text not null,
  date_enregistrement timestamptz,
  statut_prod         text not null default 'a_programmer',
  contexte            jsonb not null default '{}'::jsonb,  -- snapshot hérité de la cible
  created_at          timestamptz not null default now()
);
create index episodes_cible_idx on public.episodes(cible_id);

-- ---------------------------------------------------------------------------
-- Maintien de updated_at sur cibles
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end; $fn$;

create trigger cibles_updated_at
  before update on public.cibles
  for each row execute function public.touch_updated_at();

-- Quand une touche est loggée, on remet le compteur (date_derniere_touche) à jour.
create or replace function public.bump_derniere_touche()
returns trigger language plpgsql as $fn$
begin
  update public.cibles
     set date_derniere_touche = greatest(coalesce(date_derniere_touche, new.date), new.date)
   where id = new.cible_id;
  return new;
end; $fn$;

create trigger touches_bump_compteur
  after insert on public.touches
  for each row execute function public.bump_derniere_touche();

-- ===================== 0002 RLS =====================
-- Magellan — Étape 1 : Row Level Security par rôle et par show (§4, §11).
-- Admin : accès total + gestion des utilisateurs.
-- Interne : lecture et écriture sur ses shows.
-- Externe : accès restreint à son périmètre (lecture seule sur ses shows).

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (SECURITY DEFINER pour éviter la récursion RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.type = 'admin'
  );
$fn$;

create or replace function public.has_show_access(target_show uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select public.is_admin() or exists (
    select 1 from public.user_shows us
    where us.user_id = auth.uid() and us.show_id = target_show
  );
$fn$;

create or replace function public.can_write_show(target_show uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select public.is_admin() or exists (
    select 1 from public.user_shows us
    where us.user_id = auth.uid()
      and us.show_id = target_show
      and us.role in ('admin', 'interne')
  );
$fn$;

-- Helper : show d'une cible (pour les tables enfants).
create or replace function public.cible_show(target_cible uuid)
returns uuid
language sql stable security definer set search_path = public as $fn$
  select show_id from public.cibles where id = target_cible;
$fn$;

-- ---------------------------------------------------------------------------
-- Activation RLS
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.user_shows  enable row level security;
alter table public.shows       enable row level security;
alter table public.stages      enable row level security;
alter table public.cibles      enable row level security;
alter table public.appuis      enable row level security;
alter table public.touches     enable row level security;
alter table public.signals     enable row level security;
alter table public.episodes    enable row level security;

-- profiles : chacun voit/édite son profil ; admin gère tout le monde.
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid() or public.is_admin());
create policy profiles_admin_insert on public.profiles
  for insert with check (id = auth.uid() or public.is_admin());
create policy profiles_admin_delete on public.profiles
  for delete using (public.is_admin());

-- user_shows : l'utilisateur voit ses accès ; seul l'admin les modifie.
create policy user_shows_read on public.user_shows
  for select using (user_id = auth.uid() or public.is_admin());
create policy user_shows_admin_write on public.user_shows
  for all using (public.is_admin()) with check (public.is_admin());

-- shows : visibles si l'utilisateur a accès ; gérés par l'admin.
create policy shows_read on public.shows
  for select using (public.has_show_access(id));
create policy shows_admin_write on public.shows
  for all using (public.is_admin()) with check (public.is_admin());

-- stages : lecture si accès au show ; écriture si écriture sur le show.
create policy stages_read on public.stages
  for select using (public.has_show_access(show_id));
create policy stages_write on public.stages
  for all using (public.can_write_show(show_id)) with check (public.can_write_show(show_id));

-- cibles : lecture si accès au show ; écriture si droit d'écriture sur le show.
create policy cibles_read on public.cibles
  for select using (public.has_show_access(show_id));
create policy cibles_insert on public.cibles
  for insert with check (public.can_write_show(show_id));
create policy cibles_update on public.cibles
  for update using (public.can_write_show(show_id)) with check (public.can_write_show(show_id));
create policy cibles_delete on public.cibles
  for delete using (public.can_write_show(show_id));

-- Tables enfants : accès dérivé du show de la cible.
create policy appuis_read on public.appuis
  for select using (public.has_show_access(public.cible_show(cible_id)));
create policy appuis_write on public.appuis
  for all using (public.can_write_show(public.cible_show(cible_id)))
  with check (public.can_write_show(public.cible_show(cible_id)));

create policy touches_read on public.touches
  for select using (public.has_show_access(public.cible_show(cible_id)));
create policy touches_write on public.touches
  for all using (public.can_write_show(public.cible_show(cible_id)))
  with check (public.can_write_show(public.cible_show(cible_id)));

create policy signals_read on public.signals
  for select using (public.has_show_access(public.cible_show(cible_id)));
create policy signals_write on public.signals
  for all using (public.can_write_show(public.cible_show(cible_id)))
  with check (public.can_write_show(public.cible_show(cible_id)));

create policy episodes_read on public.episodes
  for select using (public.has_show_access(show_id));
create policy episodes_write on public.episodes
  for all using (public.can_write_show(show_id)) with check (public.can_write_show(show_id));

-- ---------------------------------------------------------------------------
-- Création automatique du profil à l'inscription (auth.users -> profiles)
-- La restriction de domaine (stefani.fr, collision.studio) est vérifiée côté
-- app à la connexion ; ce trigger ne fait que matérialiser le profil.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.profiles (id, email, nom, type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'externe'
  )
  on conflict (id) do nothing;
  return new;
end; $fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===================== 0003 fonctions =====================
-- Magellan — fonctions métier : validation -> épisode, et vue de résurgence.

-- ---------------------------------------------------------------------------
-- validate_cible : bascule une cible en épisode en emmenant son contexte (§13.7, Étape 6).
-- Hérite nom, sujets, appuis, dernières touches et signaux dans contexte jsonb.
-- Place la cible sur l'étape finale du show si elle existe.
-- ---------------------------------------------------------------------------
create or replace function public.validate_cible(target_cible uuid)
returns uuid
language plpgsql security invoker set search_path = public as $fn$
declare
  c            public.cibles%rowtype;
  final_stage  uuid;
  contexte     jsonb;
  new_episode  uuid;
begin
  select * into c from public.cibles where id = target_cible;
  if not found then
    raise exception 'Cible introuvable: %', target_cible;
  end if;

  -- Étape finale configurée du show (is_final), sinon la dernière position.
  select id into final_stage
    from public.stages
   where show_id = c.show_id and is_final
   order by position desc limit 1;
  if final_stage is null then
    select id into final_stage
      from public.stages where show_id = c.show_id
     order by position desc limit 1;
  end if;

  contexte := jsonb_build_object(
    'cible',   to_jsonb(c),
    'appuis',  coalesce((select jsonb_agg(to_jsonb(a)) from public.appuis  a where a.cible_id = c.id), '[]'::jsonb),
    'touches', coalesce((select jsonb_agg(to_jsonb(t)) from public.touches t where t.cible_id = c.id), '[]'::jsonb),
    'signals', coalesce((select jsonb_agg(to_jsonb(s)) from public.signals s where s.cible_id = c.id), '[]'::jsonb)
  );

  insert into public.episodes (cible_id, show_id, nom, contexte)
  values (c.id, c.show_id, c.nom, contexte)
  returning id into new_episode;

  if final_stage is not null then
    update public.cibles set stage_id = final_stage where id = c.id;
  end if;

  return new_episode;
end; $fn$;

-- ---------------------------------------------------------------------------
-- Vue de résurgence : enrichit chaque cible des signaux d'anti-oubli.
-- jours_depuis_touche, dernier signal, fraîcheur du signal. La logique de
-- priorisation (voie froide devant, relance avec raison) vit dans le copilote.
-- ---------------------------------------------------------------------------
create or replace view public.cibles_enrichies
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

-- ===================== 0004 contacts =====================
-- Magellan — enrichissement contacts (joindre les cibles difficiles).
-- Sources publiques, finalité prise de contact professionnelle (RGPD).
-- La veille, elle, alimente la table signals existante (-> moteur de résurgence).

create type contact_kind as enum (
  'email',
  'telephone',
  'reseau',     -- profil/DM réseau social
  'agence',     -- agent, manager, attaché de presse
  'site',       -- site web / formulaire de contact
  'autre'
);

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  cible_id    uuid not null references public.cibles(id) on delete cascade,
  kind        contact_kind not null,
  valeur      text not null,                       -- l'email, le numéro, l'URL, le nom de l'agent
  label       text,                                 -- ex: "Attaché de presse", "Standard entreprise"
  source      text,                                 -- d'où vient l'info (URL / contexte)
  confiance   int not null default 3 check (confiance between 1 and 5),
  verifie     boolean not null default false,       -- confirmé manuellement
  created_at  timestamptz not null default now()
);
create index contacts_cible_idx on public.contacts(cible_id);

alter table public.contacts enable row level security;

create policy contacts_read on public.contacts
  for select using (public.has_show_access(public.cible_show(cible_id)));
create policy contacts_write on public.contacts
  for all using (public.can_write_show(public.cible_show(cible_id)))
  with check (public.can_write_show(public.cible_show(cible_id)));

-- ===================== seed =====================
-- Magellan — Seed (§12, Étape 1).
-- Trois shows, leurs étapes configurables, et un jeu de cibles de test.
-- Idempotent : peut être rejoué (on conflict do nothing / upsert par slug).

-- ---------------------------------------------------------------------------
-- Shows
-- ---------------------------------------------------------------------------
insert into public.shows (slug, nom, type_pipe, couleur) values
  ('gdiy',     'Génération Do It Yourself', 'invites',    '#1FB46A'),
  ('ccg',      'Combien ça gagne',          'invites',    '#3B82F6'),
  ('fleurons', 'Fleuron(s)',                'thematique', '#B45CFF')
on conflict (slug) do update
  set nom = excluded.nom, type_pipe = excluded.type_pipe, couleur = excluded.couleur;

-- ---------------------------------------------------------------------------
-- Étapes par show
-- ---------------------------------------------------------------------------
-- Pipes invités (GDIY, CCG) : Confirmé = validation invité -> bascule épisode.
insert into public.stages (show_id, key, label, position, is_final)
select s.id, v.key, v.label, v.position, v.is_final
from public.shows s
join (values
  ('identifie',  'Identifié',  1, false),
  ('qualifie',   'Qualifié',   2, false),
  ('contacte',   'Contacté',   3, false),
  ('confirme',   'Confirmé',   4, true),
  ('programme',  'Programmé',  5, false),
  ('enregistre', 'Enregistré', 6, false),
  ('publie',     'Publié',     7, false)
) as v(key, label, position, is_final) on true
where s.type_pipe = 'invites'
on conflict (show_id, key) do nothing;

-- Pipe thématique (Fleurons) : Décidé = validation éditoriale -> bascule épisode.
insert into public.stages (show_id, key, label, position, is_final)
select s.id, v.key, v.label, v.position, v.is_final
from public.shows s
join (values
  ('identifie', 'Identifié',              1, false),
  ('qualifie',  'Qualifié (raison validée)', 2, false),
  ('recherche', 'Recherche',              3, false),
  ('decide',    'Décidé',                 4, true),
  ('produit',   'Produit',                5, false)
) as v(key, label, position, is_final) on true
where s.slug = 'fleurons'
on conflict (show_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- Cibles de test — GDIY (personnes)
-- ---------------------------------------------------------------------------
with show as (select id from public.shows where slug = 'gdiy'),
     stg as (select key, id from public.stages where show_id = (select id from show))
insert into public.cibles
  (show_id, kind, nom, stage_id, priorite, voie, sujets, canal_reel, via_qui,
   date_derniere_touche, role, organisation, archetype)
select (select id from show), 'personne', d.nom,
       (select id from stg where key = d.stage_key),
       d.priorite::priorite_type, d.voie::voie_type, d.sujets, d.canal, d.via,
       d.derniere::timestamptz, d.role, d.org, d.arch::archetype_type
from (values
  ('Tony Parker',        'qualifie', 'haute',   'froid', array['sport','reconversion','business'], 'Instagram DM', 'Agent sportif', now() - interval '12 days', 'Entrepreneur, ex-NBA', 'Infinity Nine', 'big_fish'),
  ('Camille Étienne',    'contacte', 'moyenne', 'chaud', array['écologie','activisme'],            'Email',        'Ancien invité',  now() - interval '4 days',  'Activiste',          'Indépendante',  'pepite'),
  ('Un chef étoilé local','identifie','basse',  'froid', array['cuisine','artisanat'],             null,           null,             null,                        'Chef',               'Restaurant',    'quick_win')
) as d(nom, stage_key, priorite, voie, sujets, canal, via, derniere, role, org, arch)
where not exists (select 1 from public.cibles c where c.show_id = (select id from show) and c.nom = d.nom);

-- ---------------------------------------------------------------------------
-- Cibles de test — CCG (personnes : un métier, un revenu, une trajectoire)
-- ---------------------------------------------------------------------------
with show as (select id from public.shows where slug = 'ccg'),
     stg as (select key, id from public.stages where show_id = (select id from show))
insert into public.cibles
  (show_id, kind, nom, stage_id, priorite, voie, sujets, canal_reel, via_qui,
   date_derniere_touche, role, organisation, archetype)
select (select id from show), 'personne', d.nom,
       (select id from stg where key = d.stage_key),
       d.priorite::priorite_type, d.voie::voie_type, d.sujets, d.canal, d.via,
       d.derniere::timestamptz, d.role, d.org, d.arch::archetype_type
from (values
  ('Plombier indépendant',  'identifie', 'moyenne', 'froid', array['artisanat','revenus'],     null,        null,           null,                       'Plombier',         'À son compte',  'quick_win'),
  ('Trader prop firm',      'qualifie',  'haute',   'chaud', array['finance','trajectoire'],   'LinkedIn',  'Contact interne', now() - interval '20 days', 'Trader',           'Prop firm',     'big_fish'),
  ('Berger transhumant',    'identifie', 'basse',   'froid', array['ruralité','métier rare'],  null,        null,           null,                       'Berger',           'Indépendant',   'pepite')
) as d(nom, stage_key, priorite, voie, sujets, canal, via, derniere, role, org, arch)
where not exists (select 1 from public.cibles c where c.show_id = (select id from show) and c.nom = d.nom);

-- ---------------------------------------------------------------------------
-- Cibles de test — Fleurons (entreprises / marques)
-- ---------------------------------------------------------------------------
with show as (select id from public.shows where slug = 'fleurons'),
     stg as (select key, id from public.stages where show_id = (select id from show))
insert into public.cibles
  (show_id, kind, nom, stage_id, priorite, voie, sujets, canal_reel, via_qui,
   date_derniere_touche, secteur, pays, envergure, raison_de_selection, etat_recherche)
select (select id from show), 'entreprise', d.nom,
       (select id from stg where key = d.stage_key),
       d.priorite::priorite_type, d.voie::voie_type, d.sujets, d.canal, d.via,
       d.derniere::timestamptz, d.secteur, d.pays, d.envergure::envergure_type, d.raison, d.etat
from (values
  ('Michelin',     'qualifie', 'haute',   'froid', array['industrie','innovation'], null,    null,            null,                       'Pneumatique', 'France', 'international', 'Fleuron industriel mondial, virage hydrogène et matériaux', 'Sources publiques rassemblées, contacts presse à identifier'),
  ('Patagonia FR', 'recherche','moyenne', 'froid', array['mode','engagement'],      'Email', 'Contact RP',    now() - interval '8 days',  'Textile',     'France', 'international', 'Modèle de marque à mission, pertinence éditoriale forte',   'Entretien préliminaire fait, recherche terrain en cours'),
  ('Une maison de champagne', 'identifie','basse','froid', array['terroir','luxe'], null,    null,            null,                       'Vin',         'France', 'fr',           'Savoir-faire patrimonial, angle transmission',             'À lancer')
) as d(nom, stage_key, priorite, voie, sujets, canal, via, derniere, secteur, pays, envergure, raison, etat)
where not exists (select 1 from public.cibles c where c.show_id = (select id from show) and c.nom = d.nom);

-- ---------------------------------------------------------------------------
-- Appuis, touches et signaux de démonstration (rattachés par nom de cible)
-- ---------------------------------------------------------------------------
insert into public.appuis (cible_id, nom, organisation, type, note)
select c.id, a.nom, a.org, a.type::appui_type, a.note
from public.cibles c
join (values
  ('Tony Parker',     'Un ancien invité commun', 'GDIY', 'ancien_invite',  'Peut faire une intro chaleureuse'),
  ('Trader prop firm','Membre de l''équipe',      'Collision', 'contact_interne', 'A déjà échangé en DM')
) as a(cible_nom, nom, org, type, note) on a.cible_nom = c.nom
where not exists (select 1 from public.appuis ap where ap.cible_id = c.id and ap.nom = a.nom);

insert into public.touches (cible_id, date, canal, contenu, source)
select c.id, now() - interval '4 days', 'Email', 'Premier message envoyé, pas encore de réponse.', 'saisie'
from public.cibles c where c.nom = 'Camille Étienne'
and not exists (select 1 from public.touches t where t.cible_id = c.id);

insert into public.signals (cible_id, type, date, source, pertinence, resume)
select c.id, s.type::signal_type, now() - interval '6 days', s.source, s.pertinence, s.resume
from public.cibles c
join (values
  ('Tony Parker', 'mouvement_entreprise', 'Presse éco', 5, 'Nouvelle levée annoncée pour Infinity Nine'),
  ('Michelin',    'nomination',           'Communiqué', 4, 'Nouveau patron de la division innovation')
) as s(cible_nom, type, source, pertinence, resume) on s.cible_nom = c.nom
where not exists (select 1 from public.signals sg where sg.cible_id = c.id);
