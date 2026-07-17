# Routine Claude Code hebdomadaire (brief arbitrages §2.5)

La boucle de validation du backlog produit, de bout en bout :

1. L'équipe (ou Vadim) pose une demande : outil MCP `feedback`.
2. Le récap du lundi 08h00 la présente avec un triage proposé.
3. Matthieu tranche dans Claude : `triage_backlog` passe l'item en `a_faire`.
4. La Routine hebdomadaire (ce document) lit les items `a_faire`, ouvre une
   PR par item, renseigne `pr_url`.
5. Matthieu relit et merge (relecture humaine obligatoire, garde-fou §8.3),
   puis passe l'item en `livre` via `triage_backlog`.

## Interface

`/api/backlog/afaire` (Bearer `CRON_SECRET`, obligatoire) :
- `GET` : items `a_faire` sans PR encore ouverte.
- `POST {id, pr_url}` : renseigne `pr_url` sur un item `a_faire`. Seul champ
  ouvert à la Routine ; les statuts ne changent que par décision humaine.

## Configuration (une fois)

1. Merger la PR qui porte cet endpoint.
2. Dans l'environnement Claude Code (claude.ai/code, réglages de
   l'environnement du repo collision) : ajouter la variable `CRON_SECRET`
   avec la même valeur que sur Vercel.
3. Créer la tâche planifiée sur claude.ai/code : hebdomadaire, lundi matin
   après le récap (09h30 Paris), sur l'environnement du repo collision, avec
   le prompt ci-dessous tel quel. Sans la variable ou tant que l'endpoint
   n'est pas déployé, la Routine se termine sans rien faire et le signale :
   elle ne casse rien.

## Prompt de la Routine (à coller tel quel)

> Tu es la Routine hebdomadaire du backlog Magellan (docs/ROUTINE-HEBDO.md).
> Récupère les items à traiter : `curl -sS -H "Authorization: Bearer
> $CRON_SECRET" https://magellan.collision.studio/api/backlog/afaire`.
> Si CRON_SECRET est absent ou si l'appel échoue, termine en expliquant ce
> qui manque, sans rien tenter d'autre.
> Traite au plus TROIS items, les plus anciens d'abord. Pour chaque item :
> crée une branche `claude/backlog-<id court>`, implémente la demande avec
> tests et build verts, pousse, ouvre une PR qui cite l'item (id, contenu,
> auteur), puis renseigne l'URL : `curl -sS -X POST -H "Authorization:
> Bearer $CRON_SECRET" -H "Content-Type: application/json" -d
> '{"id":"<id>","pr_url":"<url>"}'
> https://magellan.collision.studio/api/backlog/afaire`.
> Garde-fous absolus : jamais de push sur main, jamais de merge, jamais de
> changement de statut d'un item. Une migration SQL se livre en fichier plus
> une entrée au registre docs/MIGRATIONS-EN-ATTENTE.md, elle ne s'applique
> JAMAIS. Aucun secret lu, écrit ou journalisé. Un item ambigu, trop gros
> pour une PR relisible, ou qui touche la doctrine des fiches : passe-le et
> dis pourquoi dans ton résumé final.
> Style de tout texte produit : pas de tiret cadratin, pas de « on »,
> sujet-verbe-complément, soutenu non littéraire, pas d'emoji.

## Garde-fous de la Routine (rappel du prompt)

- Une PR par item, jamais de push direct sur main, jamais de merge.
- Trois items maximum par passage : la relecture reste faisable.
- Migrations SQL : fichier + registre seulement, JAMAIS appliquées (§8.1).
- Aucun secret lu, écrit ou journalisé (§8.2).
- Item ambigu ou trop gros pour une PR relisible : la Routine passe et le dit
  dans la PR de synthèse ou en commentaire, plutôt que de deviner (§8.4).
