-- Magellan — auto-accueil des nouveaux membres.
-- La connexion Google est déjà restreinte aux domaines stefani.fr / collision.studio
-- (vérifié côté app). Tout nouveau membre est donc un interne de confiance : on lui
-- donne d'office le rôle interne + l'accès (lecture/écriture) à tous les shows,
-- pour qu'il puisse travailler dès sa première connexion, sans intervention admin.
--
-- Pour restreindre quelqu'un à un périmètre précis ensuite : supprimer les lignes
-- user_shows superflues, ou passer son profiles.type à 'externe'.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.profiles (id, email, nom, type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    'interne'
  )
  on conflict (id) do nothing;

  insert into public.user_shows (user_id, show_id, role)
  select new.id, s.id, 'interne' from public.shows s
  on conflict (user_id, show_id) do nothing;

  return new;
end; $fn$;
