-- Chantier 1 (brief arbitrages 17/07) : backlog produit.
-- Capture des demandes d'évolution de l'équipe (outil MCP feedback, email,
-- sessions) sans copier-coller et sans application directe au code. Le récap
-- hebdomadaire compile les items nouveaux ; la boucle de validation met à jour
-- le statut ; une Routine ouvre les PR des items « a_faire » (pr_url).

create table if not exists public.product_backlog (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  auteur             text,                          -- acteur MCP ou user app
  source             text not null default 'mcp_feedback'
                       check (source in ('mcp_feedback', 'email', 'session')),
  contenu            text not null,                 -- demande brute, une ligne ou plus
  contexte           jsonb not null default '{}'::jsonb, -- capté auto : dernier outil, cible...
  statut             text not null default 'nouveau'
                       check (statut in ('nouveau', 'a_faire', 'a_preciser', 'rejete', 'livre')),
  commentaire_triage text,
  pr_url             text
);
create index if not exists product_backlog_statut_idx on public.product_backlog(statut, created_at desc);

alter table public.product_backlog enable row level security;
create policy product_backlog_read on public.product_backlog for select using (auth.uid() is not null);
-- Écriture via service role uniquement (MCP, cron) : pas de policy d'écriture.
