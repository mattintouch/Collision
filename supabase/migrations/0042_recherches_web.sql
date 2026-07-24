-- Tâche 6 (handoff 24/07) : comptage des requêtes de recherche web par job.
-- La recherche web est facturée en sus des tokens (par requête) : sans ce
-- compteur, budget_api et le plafond mensuel étaient à moitié aveugles.
-- La vue couts_generation est recréée avec la somme des recherches.

alter table public.enrichment_jobs add column if not exists web_searches int;

create or replace view public.couts_generation
with (security_invoker = true) as
select
  date_trunc('week', updated_at)::date as semaine,
  objectif,
  model,
  cible_id,
  count(*)                          as jobs,
  sum(coalesce(tokens_in, 0))       as tokens_in,
  sum(coalesce(tokens_out, 0))      as tokens_out,
  sum(coalesce(web_searches, 0))    as recherches_web
from public.enrichment_jobs
where tokens_in is not null
group by 1, 2, 3, 4;
