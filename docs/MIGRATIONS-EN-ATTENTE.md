# Migrations en attente d'application

> Registre tenu pendant l'absence de Matt (autonomie maximale). Je ne peux pas
> appliquer les migrations sur la base : elles sont écrites, testées côté code,
> et listées ici DANS L'ORDRE. Au retour de Matt, deux voies :
> soit la chaîne CI les applique (une fois P1 + baseline faits), soit il les
> colle dans l'éditeur SQL Supabase dans l'ordre ci-dessous.
>
> Tant qu'une migration n'est pas appliquée, le code qui en dépend au runtime
> n'est PAS mis sur `main` (ou reste dormant derrière un flag). Le comportement
> live reste donc intact.

## À appliquer, dans l'ordre

| Migration | Objet | Bloque en prod ? | État code |
|---|---|---|---|
| `0028_view_explicite.sql` | Vue `cibles_enrichies` à colonnes explicites (identique fonctionnel à 0027) | Non (identique à 0027) | Sur main, dormant |

## Déjà appliquées par Matt (rappel)
0001→0027 appliquées à la main. 0026 (enrichment_jobs) et 0027 (portier +
appuis.folk_id + vue raffinée) confirmées OK.
