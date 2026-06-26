-- Lot 8 — Synchro Magellan -> Google Contacts (unidirectionnelle). Lien stable
-- anti-doublon : on stocke le resourceName (people/cXXXX) et l'etag Google, sur
-- la cible et sur l'appui (relais). Pas de recherche floue par nom.

alter table public.cibles add column if not exists google_resource_name text;
alter table public.cibles add column if not exists google_etag          text;

alter table public.appuis add column if not exists google_resource_name text;
alter table public.appuis add column if not exists google_etag          text;
