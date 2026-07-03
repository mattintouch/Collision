-- S5 — « reporter » une cible : la sortir de la session « Aujourd'hui » jusqu'à
-- une date. Table dédiée (pas de colonne sur cibles) pour ne pas toucher la vue
-- cibles_enrichies. Le report est au niveau de la cible (partagé par l'équipe),
-- cohérent avec le fait que la cible disparaît du jour pour tout le monde.

create table if not exists public.cible_snooze (
  cible_id      uuid primary key references public.cibles(id) on delete cascade,
  snoozed_until timestamptz not null,
  created_at    timestamptz not null default now()
);
create index if not exists cible_snooze_until_idx on public.cible_snooze (snoozed_until);

alter table public.cible_snooze enable row level security;
create policy cible_snooze_read on public.cible_snooze
  for select using (public.has_show_access(public.cible_show(cible_id)));
create policy cible_snooze_write on public.cible_snooze
  for all using (public.can_write_show(public.cible_show(cible_id)))
  with check (public.can_write_show(public.cible_show(cible_id)));
