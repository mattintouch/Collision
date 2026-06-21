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
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

create trigger cibles_updated_at
  before update on public.cibles
  for each row execute function public.touch_updated_at();

-- Quand une touche est loggée, on remet le compteur (date_derniere_touche) à jour.
create or replace function public.bump_derniere_touche()
returns trigger language plpgsql as $$
begin
  update public.cibles
     set date_derniere_touche = greatest(coalesce(date_derniere_touche, new.date), new.date)
   where id = new.cible_id;
  return new;
end; $$;

create trigger touches_bump_compteur
  after insert on public.touches
  for each row execute function public.bump_derniere_touche();
