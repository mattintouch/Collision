-- Chantier 3 (brief arbitrages 17/07, §4) : télémétrie de coût API.
--
-- 1) Tokens entrée/sortie et modèle par job d'enrichissement ou de génération
--    (le SDK les renvoie ; écrits en best-effort par le processeur de jobs).
-- 2) Vue d'agrégation : par semaine, objectif, modèle et cible. Le coût en
--    euros est calculé côté code (grille de prix évolutive, src/lib/ai/cout.ts).

alter table public.enrichment_jobs add column if not exists tokens_in bigint;
alter table public.enrichment_jobs add column if not exists tokens_out bigint;
alter table public.enrichment_jobs add column if not exists model text;

create or replace view public.couts_generation
with (security_invoker = true) as
select
  date_trunc('week', updated_at)::date as semaine,
  objectif,
  model,
  cible_id,
  count(*)                        as jobs,
  sum(coalesce(tokens_in, 0))     as tokens_in,
  sum(coalesce(tokens_out, 0))    as tokens_out
from public.enrichment_jobs
where tokens_in is not null
group by 1, 2, 3, 4;
