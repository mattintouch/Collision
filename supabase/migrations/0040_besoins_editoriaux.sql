-- Chantier 4 (brief arbitrages 17/07, §5) : besoins éditoriaux.
-- La contrainte de programmation en clair (« 1 femme, épisode estival, closing
-- sous 15 jours »), avec critères structurés quand c'est possible. Le daily
-- five et le récap hebdo évaluent le pipe contre les besoins ouverts : un
-- besoin couvert par moins de deux cibles actionnables remonte en alerte.

create table if not exists public.besoins_editoriaux (
  id          uuid primary key default gen_random_uuid(),
  show_id     uuid not null references public.shows(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  periode     text,                        -- ex. « été 2026 », « rentrée »
  contrainte  text not null,               -- la demande en clair
  criteres    jsonb,                       -- structurés si possible : {genre, sujets:[], archetype, echeance}
  statut      text not null default 'ouvert'
                check (statut in ('ouvert', 'couvert', 'expire')),
  couvert_par uuid references public.cibles(id) on delete set null
);
create index if not exists besoins_editoriaux_show_idx on public.besoins_editoriaux(show_id, statut, created_at);

alter table public.besoins_editoriaux enable row level security;
create policy besoins_editoriaux_read on public.besoins_editoriaux for select using (auth.uid() is not null);
-- Écriture via service role uniquement (MCP) : pas de policy d'écriture.
