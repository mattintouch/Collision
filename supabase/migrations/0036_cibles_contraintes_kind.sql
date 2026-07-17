-- Régressions MCP du 17/07 (brief arbitrages §6.1 et §6.2), cause commune :
-- la contrainte d'origine cible_personne_fields (0001) est ENCORE ACTIVE en
-- production alors que 0021 devait la supprimer (dérive base/registre).
-- Elle interdit secteur, pays, envergure, raison_de_selection, etat_recherche
-- sur une personne : update_cible les rejette et enrich_cible apply=true
-- échoue en violation de contrainte.
--
-- Ré-assertion IDEMPOTENTE de l'état visé par 0020+0021 :
--  - personne : tous les champs descriptifs autorisés ;
--  - entreprise : pas d'archétype ni de rôle (contrainte conservée).

alter table public.cibles drop constraint if exists cible_personne_fields;
alter table public.cibles drop constraint if exists cible_entreprise_fields;
alter table public.cibles add constraint cible_entreprise_fields
  check (kind <> 'entreprise' or (archetype is null and role is null));
