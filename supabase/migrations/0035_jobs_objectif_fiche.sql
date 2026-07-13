-- La génération des fiches structurées (incrément III) réutilise la file
-- enrichment_jobs avec un objectif par groupe de recherche : fiche:portrait,
-- fiche:chiffres, fiche:angles, fiche:deroule. La contrainte de 0026 fige le
-- vocabulaire à ('profil', 'contact') : on l'élargit au préfixe fiche:.

alter table public.enrichment_jobs drop constraint if exists enrichment_jobs_objectif_check;
alter table public.enrichment_jobs add constraint enrichment_jobs_objectif_check
  check (objectif in ('profil', 'contact') or objectif like 'fiche:%');
