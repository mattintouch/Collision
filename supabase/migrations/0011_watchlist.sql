-- Lot 2 — Watchlist : facette de curation (ex. CAC40) indépendante des sujets,
-- filtrable et affichable en colonne de board. Table de référence + jointure.

create table if not exists public.watchlists (
  id         uuid primary key default gen_random_uuid(),
  key        text unique not null,   -- 'cac40'
  label      text not null,          -- 'CAC40'
  color      text,
  created_at timestamptz not null default now()
);

create table if not exists public.cible_watchlists (
  cible_id     uuid not null references public.cibles(id) on delete cascade,
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  primary key (cible_id, watchlist_id)
);

-- Seed initial.
insert into public.watchlists (key, label, color) values
  ('cac40', 'CAC40', '#E6BD00'),
  ('sbf120', 'SBF120', '#3B82F6'),
  ('licorne', 'Licorne', '#B45CFF'),
  ('ancien_invite_a_recycler', 'Ancien invité à recycler', '#1FB46A')
on conflict (key) do nothing;

-- RLS : la watchlist est un vocabulaire global (lecture authentifiée, écriture
-- admin) ; l'appartenance suit le show de la cible (comme les tables enfants).
alter table public.watchlists       enable row level security;
alter table public.cible_watchlists enable row level security;

create policy watchlists_read on public.watchlists
  for select using (auth.uid() is not null);
create policy watchlists_admin_write on public.watchlists
  for all using (public.is_admin()) with check (public.is_admin());

create policy cible_watchlists_read on public.cible_watchlists
  for select using (public.has_show_access(public.cible_show(cible_id)));
create policy cible_watchlists_write on public.cible_watchlists
  for all using (public.can_write_show(public.cible_show(cible_id)))
  with check (public.can_write_show(public.cible_show(cible_id)));

-- Vue enrichie : exposer les clés de watchlist (pour le filtre et les colonnes).
drop view if exists public.cibles_enrichies;
create view public.cibles_enrichies
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
  (select array_agg(w.key order by w.key)
     from public.cible_watchlists cw
     join public.watchlists w on w.id = cw.watchlist_id
    where cw.cible_id = c.id) as watchlist_keys,
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
