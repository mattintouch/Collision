-- Chantier récap (décisions Matthieu du 25/08), lots 2 et 4.
--
-- 1. Typage des items du backlog produit : feature (demande d'évolution),
--    bug (dysfonctionnement), correction (correction de donnée à exécuter),
--    note (document d'état ou de cadrage, exclu de la section D du récap).
--    Aucun enum Postgres (contrainte du dépôt) : CHECK sur colonne text.
-- 2. Résumé court persisté par item (généré au modèle rapide à la compilation
--    du récap, jamais recalculé).
-- 3. Télémétrie des appels de résumé : enrichment_jobs accepte des lignes de
--    coût sans cible (cible_id nullable) avec un objectif recap:*. Ces lignes
--    naissent en statut done : la file (pending) et le faucheur (running) ne
--    les voient jamais.

alter table public.product_backlog
  add column if not exists type text not null default 'feature'
    check (type in ('feature', 'bug', 'correction', 'note'));

alter table public.product_backlog
  add column if not exists resume text;

-- Backfill des items existants (état du backlog au 25/08 après triage).
-- Le défaut feature couvre le reste des a_faire.
update public.product_backlog set type = 'bug'        where id::text like 'a0a97b18%';
update public.product_backlog set type = 'correction' where id::text like '8778b024%';
update public.product_backlog set type = 'note'
  where id::text like 'e05267c1%' or id::text like 'bd71dcef%' or id::text like 'eb50a65d%';

-- Lignes de télémétrie du récap (coût des résumés, section B).
alter table public.enrichment_jobs alter column cible_id drop not null;
alter table public.enrichment_jobs drop constraint if exists enrichment_jobs_objectif_check;
alter table public.enrichment_jobs add constraint enrichment_jobs_objectif_check
  check (objectif in ('profil', 'contact') or objectif like 'fiche:%' or objectif like 'recap:%');
