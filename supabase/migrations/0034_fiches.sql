-- Système de fiches prépa STRUCTURÉES (brief GDIY). Remplace le blob HTML sur
-- episodes.fiche_html. Chaque section est un objet adressable (édition fine via
-- MCP, diffs lisibles, versioning, commentaires ancrés).

-- Statuts : draft → en_challenge → finale → verrouillee (verrouillage J-1).
create table if not exists public.fiches (
  id                  uuid primary key default gen_random_uuid(),
  cible_id            uuid references public.cibles(id) on delete set null,
  show_id             uuid references public.shows(id) on delete cascade,
  slug                text unique not null,              -- prenom-nom (unique)
  invite_nom          text not null,
  date_enregistrement timestamptz,
  statut              text not null default 'draft'
                        check (statut in ('draft', 'en_challenge', 'finale', 'verrouillee')),
  version             int  not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists fiches_cible_idx on public.fiches(cible_id);
create index if not exists fiches_show_idx on public.fiches(show_id);

-- Une ligne par section (section_id stable : sticky_header, entete, enjeu, ...).
create table if not exists public.fiche_sections (
  id          uuid primary key default gen_random_uuid(),
  fiche_id    uuid not null references public.fiches(id) on delete cascade,
  section_id  text not null,                              -- clé stable de section
  position    int  not null default 0,
  content     jsonb not null default '{}'::jsonb,          -- contenu structuré
  version     int  not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  unique (fiche_id, section_id)
);
create index if not exists fiche_sections_fiche_idx on public.fiche_sections(fiche_id, position);

-- Historique par section (rollback).
create table if not exists public.fiche_section_versions (
  id          uuid primary key default gen_random_uuid(),
  fiche_id    uuid not null references public.fiches(id) on delete cascade,
  section_id  text not null,
  version     int  not null,
  content     jsonb not null,
  author      text,
  created_at  timestamptz not null default now()
);
create index if not exists fiche_section_versions_idx on public.fiche_section_versions(fiche_id, section_id, version desc);

-- Commentaires du challenge (Matt / Clémence), ancrés à une section.
create table if not exists public.fiche_comments (
  id          uuid primary key default gen_random_uuid(),
  fiche_id    uuid not null references public.fiches(id) on delete cascade,
  section_id  text,
  author      text,
  text        text not null,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists fiche_comments_fiche_idx on public.fiche_comments(fiche_id, resolved);

-- Matière brute injectée à tout moment (add_note). integrated=false → à intégrer.
create table if not exists public.fiche_notes (
  id          uuid primary key default gen_random_uuid(),
  fiche_id    uuid not null references public.fiches(id) on delete cascade,
  text        text not null,
  source      text,
  integrated  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists fiche_notes_fiche_idx on public.fiche_notes(fiche_id, integrated);

-- RLS : lecture pour l'app (utilisateur authentifié) ; écriture par le service
-- role (MCP / génération), qui contourne la RLS. Le rendu de la page /fiches/{slug}
-- lit via service role + jeton signé.
alter table public.fiches enable row level security;
alter table public.fiche_sections enable row level security;
alter table public.fiche_section_versions enable row level security;
alter table public.fiche_comments enable row level security;
alter table public.fiche_notes enable row level security;

create policy fiches_read on public.fiches for select using (auth.uid() is not null);
create policy fiche_sections_read on public.fiche_sections for select using (auth.uid() is not null);
create policy fiche_section_versions_read on public.fiche_section_versions for select using (auth.uid() is not null);
create policy fiche_comments_rw on public.fiche_comments for all using (auth.uid() is not null) with check (auth.uid() is not null);
create policy fiche_notes_rw on public.fiche_notes for all using (auth.uid() is not null) with check (auth.uid() is not null);
