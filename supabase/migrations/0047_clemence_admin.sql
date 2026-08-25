-- P0 du chantier doublons (25/08, cas des quatre fiches Harari) : Clémence
-- opère l'archivage et la fusion des doublons, son profil passe admin.
-- Migration versionnée, pas d'update manuel (décision du brief).
--
-- Rappel : le rôle est figé dans le jeton MCP à l'émission. Après application,
-- Clémence doit réautoriser son connecteur Claude pour obtenir un jeton admin.

update public.profiles
set type = 'admin'
where lower(email) = 'clemence@collision.studio';
