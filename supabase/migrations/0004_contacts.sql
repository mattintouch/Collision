-- Magellan — enrichissement contacts (joindre les cibles difficiles).
-- Sources publiques, finalité prise de contact professionnelle (RGPD).
-- La veille, elle, alimente la table signals existante (-> moteur de résurgence).

create type contact_kind as enum (
  'email',
  'telephone',
  'reseau',     -- profil/DM réseau social
  'agence',     -- agent, manager, attaché de presse
  'site',       -- site web / formulaire de contact
  'autre'
);

create table public.contacts (
  id          uuid primary key default gen_random_uuid(),
  cible_id    uuid not null references public.cibles(id) on delete cascade,
  kind        contact_kind not null,
  valeur      text not null,                       -- l'email, le numéro, l'URL, le nom de l'agent
  label       text,                                 -- ex: "Attaché de presse", "Standard entreprise"
  source      text,                                 -- d'où vient l'info (URL / contexte)
  confiance   int not null default 3 check (confiance between 1 and 5),
  verifie     boolean not null default false,       -- confirmé manuellement
  created_at  timestamptz not null default now()
);
create index contacts_cible_idx on public.contacts(cible_id);

alter table public.contacts enable row level security;

create policy contacts_read on public.contacts
  for select using (public.has_show_access(public.cible_show(cible_id)));
create policy contacts_write on public.contacts
  for all using (public.can_write_show(public.cible_show(cible_id)))
  with check (public.can_write_show(public.cible_show(cible_id)));
