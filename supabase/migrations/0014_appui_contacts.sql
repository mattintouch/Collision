-- Lot 5 — Coordonnées portées par l'appui. Le relais est joint en premier ;
-- son téléphone/email doivent être structurés (pas dans une note libre).
-- Un contact appartient désormais soit à une cible, soit à un appui.

alter table public.contacts alter column cible_id drop not null;
alter table public.contacts add column if not exists appui_id uuid references public.appuis(id) on delete cascade;
create index if not exists contacts_appui_idx on public.contacts(appui_id);
alter table public.contacts
  add constraint contacts_owner_chk check (cible_id is not null or appui_id is not null);

-- Show d'un appui (via sa cible) pour la RLS des contacts d'appui.
create or replace function public.appui_show(target_appui uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select c.show_id
    from public.appuis a
    join public.cibles c on c.id = a.cible_id
   where a.id = target_appui;
$$;

-- RLS : dérive le show de la cible OU de l'appui propriétaire.
drop policy if exists contacts_read on public.contacts;
drop policy if exists contacts_write on public.contacts;

create policy contacts_read on public.contacts
  for select using (
    public.has_show_access(coalesce(public.cible_show(cible_id), public.appui_show(appui_id)))
  );
create policy contacts_write on public.contacts
  for all using (
    public.can_write_show(coalesce(public.cible_show(cible_id), public.appui_show(appui_id)))
  ) with check (
    public.can_write_show(coalesce(public.cible_show(cible_id), public.appui_show(appui_id)))
  );
