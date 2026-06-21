-- Magellan — Étape 1 : Row Level Security par rôle et par show (§4, §11).
-- Admin : accès total + gestion des utilisateurs.
-- Interne : lecture et écriture sur ses shows.
-- Externe : accès restreint à son périmètre (lecture seule sur ses shows).

-- ---------------------------------------------------------------------------
-- Fonctions d'aide (SECURITY DEFINER pour éviter la récursion RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.type = 'admin'
  );
$$;

create or replace function public.has_show_access(target_show uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_shows us
    where us.user_id = auth.uid() and us.show_id = target_show
  );
$$;

create or replace function public.can_write_show(target_show uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.user_shows us
    where us.user_id = auth.uid()
      and us.show_id = target_show
      and us.role in ('admin', 'interne')
  );
$$;

-- Helper : show d'une cible (pour les tables enfants).
create or replace function public.cible_show(target_cible uuid)
returns uuid
language sql stable security definer set search_path = public as $$
  select show_id from public.cibles where id = target_cible;
$$;

-- ---------------------------------------------------------------------------
-- Activation RLS
-- ---------------------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.user_shows  enable row level security;
alter table public.shows       enable row level security;
alter table public.stages      enable row level security;
alter table public.cibles      enable row level security;
alter table public.appuis      enable row level security;
alter table public.touches     enable row level security;
alter table public.signals     enable row level security;
alter table public.episodes    enable row level security;

-- profiles : chacun voit/édite son profil ; admin gère tout le monde.
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid() or public.is_admin());
create policy profiles_admin_insert on public.profiles
  for insert with check (id = auth.uid() or public.is_admin());
create policy profiles_admin_delete on public.profiles
  for delete using (public.is_admin());

-- user_shows : l'utilisateur voit ses accès ; seul l'admin les modifie.
create policy user_shows_read on public.user_shows
  for select using (user_id = auth.uid() or public.is_admin());
create policy user_shows_admin_write on public.user_shows
  for all using (public.is_admin()) with check (public.is_admin());

-- shows : visibles si l'utilisateur a accès ; gérés par l'admin.
create policy shows_read on public.shows
  for select using (public.has_show_access(id));
create policy shows_admin_write on public.shows
  for all using (public.is_admin()) with check (public.is_admin());

-- stages : lecture si accès au show ; écriture si écriture sur le show.
create policy stages_read on public.stages
  for select using (public.has_show_access(show_id));
create policy stages_write on public.stages
  for all using (public.can_write_show(show_id)) with check (public.can_write_show(show_id));

-- cibles : lecture si accès au show ; écriture si droit d'écriture sur le show.
create policy cibles_read on public.cibles
  for select using (public.has_show_access(show_id));
create policy cibles_insert on public.cibles
  for insert with check (public.can_write_show(show_id));
create policy cibles_update on public.cibles
  for update using (public.can_write_show(show_id)) with check (public.can_write_show(show_id));
create policy cibles_delete on public.cibles
  for delete using (public.can_write_show(show_id));

-- Tables enfants : accès dérivé du show de la cible.
create policy appuis_read on public.appuis
  for select using (public.has_show_access(public.cible_show(cible_id)));
create policy appuis_write on public.appuis
  for all using (public.can_write_show(public.cible_show(cible_id)))
  with check (public.can_write_show(public.cible_show(cible_id)));

create policy touches_read on public.touches
  for select using (public.has_show_access(public.cible_show(cible_id)));
create policy touches_write on public.touches
  for all using (public.can_write_show(public.cible_show(cible_id)))
  with check (public.can_write_show(public.cible_show(cible_id)));

create policy signals_read on public.signals
  for select using (public.has_show_access(public.cible_show(cible_id)));
create policy signals_write on public.signals
  for all using (public.can_write_show(public.cible_show(cible_id)))
  with check (public.can_write_show(public.cible_show(cible_id)));

create policy episodes_read on public.episodes
  for select using (public.has_show_access(show_id));
create policy episodes_write on public.episodes
  for all using (public.can_write_show(show_id)) with check (public.can_write_show(show_id));

-- ---------------------------------------------------------------------------
-- Création automatique du profil à l'inscription (auth.users -> profiles)
-- La restriction de domaine (stefani.fr, collision.studio) est vérifiée côté
-- app à la connexion ; ce trigger ne fait que matérialiser le profil.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nom, type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'externe'
  )
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
