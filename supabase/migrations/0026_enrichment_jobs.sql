-- Plan v1.1 S3 — enrichissement ASYNCHRONE. enrich_cible insère un job et rend
-- la main en < 1 s ; un cron (maxDuration 300) traite les jobs sans le plafond
-- ~60 s du client MCP → plus de recherches, meilleur modèle, sources persistées.

create table if not exists public.enrichment_jobs (
  id          uuid primary key default gen_random_uuid(),
  cible_id    uuid not null references public.cibles(id) on delete cascade,
  objectif    text not null default 'profil' check (objectif in ('profil', 'contact')),
  apply       boolean not null default false,
  statut      text not null default 'pending' check (statut in ('pending', 'running', 'done', 'failed')),
  resultat    jsonb,
  sources     jsonb,
  applied     jsonb,
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists enrichment_jobs_queue_idx on public.enrichment_jobs (statut, created_at);
create index if not exists enrichment_jobs_cible_idx on public.enrichment_jobs (cible_id, created_at desc);

alter table public.enrichment_jobs enable row level security;
-- Lecture pour tout utilisateur authentifié ; l'écriture passe par le service role (MCP/cron).
create policy enrichment_jobs_read on public.enrichment_jobs for select using (auth.uid() is not null);
