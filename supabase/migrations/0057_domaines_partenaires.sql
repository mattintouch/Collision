-- 0057 — accès partenaire par domaine (décision de Matt du 25/09).
--
-- Constat : la 0055 faisait arriver un collaborateur d'un autre studio en
-- `externe` sans aucun show, à charge pour Matt de lui ouvrir son show à la
-- main, en deux requêtes. Cela marche, mais cela veut dire qu'une personne se
-- connecte, ne voit rien, et attend. Matt tranche : Lhou et Christofer se
-- connectent avec leur adresse Orso, par Google, comme le reste de l'équipe,
-- et travaillent immédiatement sur La Martingale.
--
-- La règle devient une DONNÉE, pas du code : la table dit quel domaine ouvre
-- quel show, et avec quel rôle. Ajouter un partenaire ne demande plus de
-- migration, seulement une ligne. La retirer referme l'accès pour les
-- prochaines connexions.
--
-- Ce qui ne change pas : un domaine inconnu n'obtient toujours RIEN, et les
-- domaines de la maison gardent tous les shows. La connexion elle même reste
-- gardée en amont par GOOGLE_OAUTH_ALLOWED_DOMAINS : cette table ne laisse
-- entrer personne, elle dit seulement ce que voit quelqu'un qui est déjà entré.

create table if not exists public.show_domaines (
  id       uuid primary key default gen_random_uuid(),
  domaine  text not null,
  show_id  uuid not null references public.shows(id) on delete cascade,
  role     text not null default 'interne',
  actif    boolean not null default true,
  note     text,
  created_at timestamptz not null default now(),
  unique (domaine, show_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'show_domaines_role_check') then
    alter table public.show_domaines add constraint show_domaines_role_check
      check (role in ('interne', 'externe'));
  end if;
end $$;

-- Orso travaille sur La Martingale, et sur rien d'autre.
insert into public.show_domaines (domaine, show_id, role, note)
select 'orsomedia.io', s.id, 'interne', 'Orso Media : Lhou Lagrange et Christofer, La Martingale seulement'
from public.shows s where s.slug = 'la-martingale'
on conflict (domaine, show_id) do nothing;

-- Accueil : domaine de la maison, domaine partenaire, ou rien.
--
-- Le rôle applicatif suit l'étendue de l'accès. Un partenaire est `interne`,
-- parce que c'est ce rôle qui ouvre l'écriture côté connecteur MCP ; ce n'est
-- pas lui qui décide de son périmètre, c'est sa ligne user_shows. Confondre
-- les deux enfermerait un partenaire en lecture seule sur son propre show.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  domaine    text := lower(split_part(coalesce(new.email, ''), '@', 2));
  maison     boolean := domaine in ('stefani.fr', 'collision.studio');
  partenaire boolean := exists (
    select 1 from public.show_domaines d where d.actif and lower(d.domaine) = domaine
  );
begin
  insert into public.profiles (id, email, nom, type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    case when maison or partenaire then 'interne' else 'externe' end
  )
  on conflict (id) do nothing;

  if maison then
    insert into public.user_shows (user_id, show_id, role)
    select new.id, s.id, 'interne' from public.shows s
    on conflict (user_id, show_id) do nothing;
  elsif partenaire then
    insert into public.user_shows (user_id, show_id, role)
    select new.id, d.show_id, d.role
    from public.show_domaines d
    where d.actif and lower(d.domaine) = domaine
    on conflict (user_id, show_id) do nothing;
  end if;

  return new;
end; $fn$;

-- Rattrapage : une personne d'un domaine partenaire déjà connectée avant cette
-- migration est restée sans accès. Cette passe lui donne le sien, sans toucher
-- à qui que ce soit d'autre. Rejouable.
update public.profiles p set type = 'interne'
where p.type = 'externe'
  and exists (
    select 1 from public.show_domaines d
    where d.actif and lower(d.domaine) = lower(split_part(p.email, '@', 2))
  );

insert into public.user_shows (user_id, show_id, role)
select p.id, d.show_id, d.role
from public.profiles p
join public.show_domaines d on d.actif and lower(d.domaine) = lower(split_part(p.email, '@', 2))
on conflict (user_id, show_id) do nothing;

-- RLS : la table se lit par tout membre authentifié (elle ne contient aucun
-- secret, seulement une règle d'organisation) et ne s'écrit que par un admin.
alter table public.show_domaines enable row level security;
drop policy if exists show_domaines_read on public.show_domaines;
create policy show_domaines_read on public.show_domaines
  for select using (auth.uid() is not null);
drop policy if exists show_domaines_admin_write on public.show_domaines;
create policy show_domaines_admin_write on public.show_domaines
  for all using (public.is_admin()) with check (public.is_admin());
