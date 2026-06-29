-- Chantier A — journal d'audit des écritures MCP (filet de sécurité pour
-- l'autonomie large). Chaque outil d'écriture y trace, horodaté, son appel.
-- Insertion best-effort côté serveur (service role) ; jamais bloquant.

create table if not exists public.mcp_audit (
  id          uuid primary key default gen_random_uuid(),
  ts          timestamptz not null default now(),
  tool        text not null,
  actor       text,                       -- email du compte MCP authentifié (si dispo)
  payload     jsonb not null default '{}'::jsonb,
  ok          boolean not null default true,
  detail      text
);
create index if not exists mcp_audit_ts_idx on public.mcp_audit (ts desc);

alter table public.mcp_audit enable row level security;
-- Lecture pour tout utilisateur authentifié (app interne) ; l'écriture passe par
-- le service role (MCP), qui contourne la RLS.
create policy mcp_audit_read on public.mcp_audit for select
  using (auth.uid() is not null);
