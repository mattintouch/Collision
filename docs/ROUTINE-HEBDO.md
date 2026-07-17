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
3. La tâche planifiée est créée depuis une session Claude Code (hebdomadaire,
   lundi matin après le récap). Sans la variable, elle se termine sans rien
   faire et le signale : elle ne casse rien.

## Garde-fous de la Routine (rappel du prompt)

- Une PR par item, jamais de push direct sur main, jamais de merge.
- Trois items maximum par passage : la relecture reste faisable.
- Migrations SQL : fichier + registre seulement, JAMAIS appliquées (§8.1).
- Aucun secret lu, écrit ou journalisé (§8.2).
- Item ambigu ou trop gros pour une PR relisible : la Routine passe et le dit
  dans la PR de synthèse ou en commentaire, plutôt que de deviner (§8.4).
