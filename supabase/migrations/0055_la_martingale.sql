-- 0055 — La Martingale : show, pipe, champs et calls (brief du 25/09, lot A).
--
-- Cadre du brief : Magellan est la source de vérité, Notion passe en lecture
-- seule après un import unique. Aucun enum Postgres nouveau : les valeurs
-- ouvertes sont du texte avec CHECK modifiable, ou une table de référence.
-- Les étapes GDIY ne sont JAMAIS clonées : ce pipe est écrit à la main.
--
-- Rejouable sans risque (if not exists, on conflict do nothing).
-- Le code applicatif est défensif : sans cette migration, La Martingale
-- n'apparaît nulle part et les trois shows existants ne changent pas.

-- ---------------------------------------------------------------------------
-- 1. Le show et son pipe (13 étapes, un seul pipe, hors-séries compris)
-- ---------------------------------------------------------------------------

-- Expéditeur du show : posé dès maintenant (colonnes de la 0033, appliquée).
-- Le MÉCANISME d'envoi sous cette identité reste à trancher (brief 1.2) : ces
-- deux champs décrivent l'intention, ils ne l'implémentent pas.
insert into public.shows (slug, nom, type_pipe, couleur, sender_email, sender_name)
values ('la-martingale', 'La Martingale', 'invites', '#C9A227', 'lhou@orsomedia.io', 'Lhou Lagrange')
on conflict (slug) do nothing;

-- Mode d'envoi par show (brief 2.5). veto : envoi automatique sauf veto sous
-- 24 h (GDIY, comportement actuel). validation : AUCUN envoi sans clic de
-- validation (La Martingale). Défaut veto : les shows existants ne bougent pas.
alter table public.shows
  add column if not exists mode_envoi text not null default 'veto';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shows_mode_envoi_check') then
    alter table public.shows add constraint shows_mode_envoi_check
      check (mode_envoi in ('veto', 'validation'));
  end if;
end $$;
update public.shows set mode_envoi = 'validation' where slug = 'la-martingale' and mode_envoi <> 'validation';

-- Les 13 étapes, dans l'ordre du brief 2.1. is_final marque l'étape de closing
-- pour show_stats : a_programmer (validation de Matt = invité gagné).
insert into public.stages (show_id, key, label, position, is_final)
select s.id, v.key, v.label, v.position, v.is_final
from public.shows s
cross join (values
  ('idee_vrac',              'Idée vrac',                 1,  false),
  ('a_contacter',            'À contacter',               2,  false),
  ('contacte',               'Contacté',                  3,  false),
  ('a_relancer',             'À relancer',                4,  false),
  ('call_lhou_prevu',        'Call avec Lhou prévu',      5,  false),
  ('call_matt_prevu',        'Call inter avec Matt prévu',6,  false),
  ('a_programmer',           'À programmer',              7,  true),
  ('enregistrement_a_venir', 'Enregistrement à venir',    8,  false),
  ('redac_a_faire',          'Rédac à faire',             9,  false),
  ('en_montage',             'En cours de montage',      10,  false),
  ('planifie',               'Planifié',                 11,  false),
  ('publie',                 'Publié',                   12,  false),
  ('promo_finie',            'Promo finie',              13,  false)
) as v(key, label, position, is_final)
where s.slug = 'la-martingale'
on conflict (show_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Familles de thème (table de référence scoppée au show, modifiable)
-- ---------------------------------------------------------------------------
create table if not exists public.familles_theme (
  id       uuid primary key default gen_random_uuid(),
  show_id  uuid not null references public.shows(id) on delete cascade,
  cle      text not null,
  label    text not null,
  position int  not null default 0,
  actif    boolean not null default true,
  unique (show_id, cle)
);

insert into public.familles_theme (show_id, cle, label, position)
select s.id, v.cle, v.label, v.position
from public.shows s
cross join (values
  ('marches_financiers', 'Marchés financiers', 1),
  ('immobilier',         'Immobilier',         2),
  ('produits_exotiques', 'Produits exotiques', 3),
  ('alternatif',         'Alternatif',         4),
  ('macro_economie',     'Macro et économie',  5)
) as v(cle, label, position)
where s.slug = 'la-martingale'
on conflict (show_id, cle) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Champs de cible (brief 2.2)
-- ---------------------------------------------------------------------------
-- og : marqueur d'invité de premier plan, INDÉPENDANT de la priorité.
-- statut_sortie : sort la cible du pipe actif SANS l'archiver (brief 2.1).
-- contexte : origine de l'idée, personne qui a donné le contact.
-- date_tournage / date_diffusion : pilotent les automatisations et la rotation.
-- famille_theme_id : référence la table ci-dessus.
--
-- priorite N'EST PAS touchée : la colonne existe en enum priorite_type
-- (haute, moyenne, basse), partagé avec GDIY. « normale » du brief se lit
-- « moyenne », qui est déjà la valeur par défaut. Changer un enum partagé pour
-- renommer une valeur coûterait plus cher que cette équivalence.
alter table public.cibles
  add column if not exists og               boolean not null default false,
  add column if not exists statut_sortie    text,
  add column if not exists contexte         text,
  add column if not exists date_tournage    date,
  add column if not exists date_diffusion   date,
  add column if not exists famille_theme_id uuid references public.familles_theme(id) on delete set null,
  add column if not exists relances_envoyees int not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cibles_statut_sortie_check') then
    alter table public.cibles add constraint cibles_statut_sortie_check
      check (statut_sortie is null or statut_sortie in ('pour_plus_tard', 'no_ok'));
  end if;
end $$;

create index if not exists cibles_statut_sortie_idx on public.cibles (show_id, statut_sortie);
create index if not exists cibles_date_diffusion_idx on public.cibles (show_id, date_diffusion);
create index if not exists cibles_date_tournage_idx on public.cibles (show_id, date_tournage);

-- ---------------------------------------------------------------------------
-- 4. Calls (brief 2.2.7) : deux par cible, type lhou et matt
-- ---------------------------------------------------------------------------
-- La contrainte d'unicité (cible_id, type) matérialise « deux enregistrements
-- par cible ». Le transcript et le résumé viennent de Granola quand le plan
-- Orso le permet (HYPOTHÈSE à vérifier, brief 3.3), sinon d'un collage manuel.
create table if not exists public.cible_calls (
  id          uuid primary key default gen_random_uuid(),
  cible_id    uuid not null references public.cibles(id) on delete cascade,
  type        text not null,
  date        timestamptz,
  statut      text not null default 'prevu',
  lien_note   text,
  transcript  text,
  resume      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cible_id, type)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cible_calls_type_check') then
    alter table public.cible_calls add constraint cible_calls_type_check
      check (type in ('lhou', 'matt'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cible_calls_statut_check') then
    alter table public.cible_calls add constraint cible_calls_statut_check
      check (statut in ('prevu', 'fait'));
  end if;
end $$;

create index if not exists cible_calls_cible_idx on public.cible_calls (cible_id);

-- ---------------------------------------------------------------------------
-- 5. RLS : mêmes règles que les tables soeurs (accès par show)
-- ---------------------------------------------------------------------------
alter table public.familles_theme enable row level security;
alter table public.cible_calls    enable row level security;

drop policy if exists familles_theme_read on public.familles_theme;
create policy familles_theme_read on public.familles_theme
  for select using (public.has_show_access(show_id));
drop policy if exists familles_theme_write on public.familles_theme;
create policy familles_theme_write on public.familles_theme
  for all using (public.can_write_show(show_id)) with check (public.can_write_show(show_id));

drop policy if exists cible_calls_read on public.cible_calls;
create policy cible_calls_read on public.cible_calls
  for select using (public.has_show_access(public.cible_show(cible_id)));
drop policy if exists cible_calls_write on public.cible_calls;
create policy cible_calls_write on public.cible_calls
  for all using (public.can_write_show(public.cible_show(cible_id)))
  with check (public.can_write_show(public.cible_show(cible_id)));

-- ---------------------------------------------------------------------------
-- 6. Brouillons d'email (brief 2.5) : rien ne part sans validation
-- ---------------------------------------------------------------------------
-- Le show en mode `validation` ne connaît pas l'envoi automatique : relance,
-- refus, brief, logistique et sortie sont écrits ici en `brouillon` et
-- attendent un clic. Le mode `veto` de GDIY garde son comportement (envoi
-- automatique sauf veto sous 24 h) et n'utilise pas cette table pour l'instant.
create table if not exists public.email_brouillons (
  id             uuid primary key default gen_random_uuid(),
  show_id        uuid not null references public.shows(id) on delete cascade,
  cible_id       uuid references public.cibles(id) on delete cascade,
  type           text not null,
  sujet          text not null,
  corps          text not null,
  destinataires  text[] not null default '{}',
  copies         text[] not null default '{}',
  statut         text not null default 'brouillon',
  origine        text,
  created_at     timestamptz not null default now(),
  valide_par     text,
  valide_le      timestamptz,
  envoye_le      timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'email_brouillons_type_check') then
    alter table public.email_brouillons add constraint email_brouillons_type_check
      check (type in ('relance', 'refus', 'brief', 'logistique', 'sortie', 'alerte'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'email_brouillons_statut_check') then
    alter table public.email_brouillons add constraint email_brouillons_statut_check
      check (statut in ('brouillon', 'valide', 'envoye', 'annule'));
  end if;
end $$;

create index if not exists email_brouillons_show_statut_idx on public.email_brouillons (show_id, statut, created_at desc);
create index if not exists email_brouillons_cible_idx on public.email_brouillons (cible_id);

alter table public.email_brouillons enable row level security;
drop policy if exists email_brouillons_read on public.email_brouillons;
create policy email_brouillons_read on public.email_brouillons
  for select using (public.has_show_access(show_id));
drop policy if exists email_brouillons_write on public.email_brouillons;
create policy email_brouillons_write on public.email_brouillons
  for all using (public.can_write_show(show_id)) with check (public.can_write_show(show_id));

-- ---------------------------------------------------------------------------
-- 7. Accueil des nouveaux membres (prérequis 1.3)
-- ---------------------------------------------------------------------------
-- La version de 0005 donnait à TOUT nouveau membre le rôle interne et l'accès
-- à TOUS les shows, au motif que la connexion Google était restreinte aux
-- domaines de la maison. La Martingale change cette prémisse : Lhou et
-- Christofer sont sur orsomedia.io et ne doivent voir que `la-martingale`.
--
-- Nouvelle règle : un membre d'un domaine de la maison garde le comportement
-- actuel (interne, tous les shows). Un membre d'un autre domaine arrive en
-- `externe` SANS aucun show, donc sans rien voir tant que personne ne lui
-- ouvre quelque chose.
--
-- Matt lui ouvre ensuite son show, à la main, en DEUX temps. Le rôle donne le
-- droit d'écrire, la ligne user_shows donne le périmètre : `externe` seul
-- laisserait la personne en lecture seule côté connecteur MCP, ce qui n'est
-- pas ce que le brief demande pour Lhou et Christofer.
--   update profiles set type = 'interne' where email = 'lhou@orsomedia.io';
--   insert into user_shows (user_id, show_id, role)
--   select p.id, s.id, 'interne' from profiles p, shows s
--   where p.email = 'lhou@orsomedia.io' and s.slug = 'la-martingale';
--
-- Les membres DÉJÀ créés ne sont pas touchés : ce trigger ne joue qu'à la
-- première connexion.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  domaine text := lower(split_part(coalesce(new.email, ''), '@', 2));
  maison  boolean := domaine in ('stefani.fr', 'collision.studio');
begin
  insert into public.profiles (id, email, nom, type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    case when maison then 'interne' else 'externe' end
  )
  on conflict (id) do nothing;

  if maison then
    insert into public.user_shows (user_id, show_id, role)
    select new.id, s.id, 'interne' from public.shows s
    on conflict (user_id, show_id) do nothing;
  end if;

  return new;
end; $fn$;
