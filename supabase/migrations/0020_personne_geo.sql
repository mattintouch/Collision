-- Débloquage 28/06 — une PERSONNE peut désormais porter secteur / pays /
-- envergure (utile pour segmenter et planifier les tournages : ex. Olivier
-- Pomel, personne, « Tech » / « États-Unis »). On garde raison_de_selection
-- et etat_recherche réservés aux entreprises (champs de workflow recherche).

alter table public.cibles drop constraint if exists cible_personne_fields;
alter table public.cibles add constraint cible_personne_fields check (
  kind <> 'personne' or (raison_de_selection is null and etat_recherche is null)
);
