-- Chantier idées éditoriales (27/08) : backlog éditorial au niveau CIBLE.
-- Les idées (une vidéo repérée, une question, un angle) naissent bien avant
-- la fiche de préparation : elles vivaient entassées dans cibles.note, sans
-- structure. Cette table les porte et les suit jusqu'à la fiche : le groupe
-- de génération deroule les injecte et les passe en integree, jamais
-- d'oubli silencieux. Aucun enum Postgres (contrainte du dépôt) : CHECK sur
-- colonnes text. MAJ Folk non requise pour cet objet.

create table if not exists public.idees_editoriales (
  id          uuid primary key default gen_random_uuid(),
  cible_id    uuid not null references public.cibles(id) on delete cascade,
  type        text not null default 'question'
                check (type in ('question', 'angle', 'citation', 'source')),
  texte       text not null,
  source_url  text,
  statut      text not null default 'backlog'
                check (statut in ('backlog', 'integree', 'abandonnee')),
  auteur      text,
  created_at  timestamptz not null default now()
);
create index if not exists idees_editoriales_cible_idx on public.idees_editoriales (cible_id, statut, created_at);

alter table public.idees_editoriales enable row level security;
-- Lecture pour toute session interne ; écriture via service role (MCP, jobs).
create policy idees_editoriales_read on public.idees_editoriales for select
  using (auth.uid() is not null);
