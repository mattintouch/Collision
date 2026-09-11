-- Alerting des échecs de génération (brief du 11/09) : l'alerte est adressée
-- à l'initiateur de la génération plus Matthieu, plus jamais à toute l'équipe.
-- Cette colonne porte l'email de l'appelant MCP qui a mis les jobs en file
-- (generate_fiche, validate_cible). Le code est défensif dans les deux sens :
-- sans la colonne, l'insertion retombe sur l'ancienne forme et l'alerte part
-- à Matthieu seul.

alter table public.enrichment_jobs add column if not exists initiateur text;
