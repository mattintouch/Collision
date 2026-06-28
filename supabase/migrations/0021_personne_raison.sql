-- Régression test live 28/06 (#2) : une PERSONNE doit pouvoir porter
-- raison_de_selection (angle de closing essentiel) — et etat_recherche.
-- On retire la dernière contrainte qui réservait ces champs aux entreprises.
-- (La contrainte cible_entreprise_fields reste : pas d'archétype/role sur une
-- entreprise.)

alter table public.cibles drop constraint if exists cible_personne_fields;
