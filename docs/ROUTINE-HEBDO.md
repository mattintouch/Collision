# Du backlog validé à la pull request

La boucle de validation du backlog produit, de bout en bout :

1. L'équipe (ou Vadim) pose une demande : outil MCP `feedback`.
2. Le récap du lundi 08h00 la présente avec un triage proposé.
3. Matthieu tranche dans Claude : `triage_backlog` passe l'item en `a_faire`.
4. Le récap suivant porte un lien « Lancer le dev » sur chaque item `a_faire`
   sans PR. Un clic ouvre une session Claude Code, prompt prérempli.
5. La session ouvre une PR portant la ligne `Backlog-Item: <id>`.
6. Le rebouclage quotidien lit les PR et renseigne `pr_url` sur l'item.
7. Matthieu relit et merge (relecture humaine obligatoire, garde-fou §8.3),
   puis passe l'item en `livre` via `triage_backlog`.

## Constat du 21/09/2026, pourquoi l'étape 4 a changé

La version précédente de ce document confiait l'étape 4 à une Routine
hebdomadaire automatique. L'endpoint `/api/backlog/afaire` a bien été livré le
20/07, ce document a bien décrit le prompt à coller, mais l'étape 3 de sa
configuration (créer la tâche planifiée sur claude.ai/code) n'a jamais été
faite : aucune Routine de ce nom n'existe sur le compte. Résultat au 21/09 :
28 items en `a_faire`, tous avec `pr_url` à null, certains depuis le 20/07, et
les trois PR livrées (7, 60, 65) lancées à la main.

Le lancement en un clic remplace donc un automatisme qui exigeait une
configuration jamais franchie (un secret partagé, une tâche planifiée) par un
geste humain sans prérequis : ouvrir l'email du lundi, cliquer, relire, lancer.
La relecture avant exécution est de toute façon une décision actée du 01/09.

## Le lien de lancement

- Route : `magellan.collision.studio/dev/<item_id>?t=<jeton>`.
- Jeton : HMAC HS256, secret dédié `DEV_LINK_SECRET`, valable 30 jours, portée
  limitée à un item. Le secret du connecteur MCP n'est jamais réutilisé : un
  lien d'email qui fuite ne doit pas ouvrir la surface MCP.
- La route redirige vers `claude.ai/code` avec le prompt et le dépôt
  préremplis. Le prompt est prérempli, JAMAIS envoyé.
- Prompt trop long pour tenir dans une URL : la route sert une page portant le
  prompt complet, copiable en un geste. Le prompt n'est jamais tronqué.
- Le prompt se déduit entièrement de l'item (aucun appel modèle) : le même item
  donne toujours le même prompt, ce qui le rend vérifiable.

## Configuration (une fois)

Ajouter `DEV_LINK_SECRET` aux variables d'environnement Vercel du projet, avec
une valeur aléatoire d'au moins 32 caractères, distincte de tout autre secret.
Sans elle, le récap retombe sur le lien « Voir le détail » vers `/backlog` et
la route de lancement répond que le lancement est indisponible : rien ne casse,
mais plus rien ne se lance non plus.

## Le rebouclage

`/api/cron/reboucle` (vercel.json, tous les jours à 05h00 UTC, plus un appel au
début du récap hebdo). Lit les PR du dépôt, retrouve le marqueur
`Backlog-Item: <uuid>` dans le titre ou le corps, écrit `pr_url` sur l'item.

Aucun webhook GitHub n'est nécessaire. Pour débrancher, retirer l'entrée de
`vercel.json` : le récap appelle la même fonction et s'en passe sans erreur.

Garde-fou : le rebouclage écrit UN SEUL champ, `pr_url`, et seulement sur un
item qui n'en avait pas. Aucun statut ne bouge, le passage en `livre` reste une
décision humaine après merge.

## Interface conservée

`/api/backlog/afaire` (Bearer `CRON_SECRET`, obligatoire) reste en place pour
un appelant automatique éventuel :
- `GET` : items `a_faire` sans PR encore ouverte.
- `POST {id, pr_url}` : renseigne `pr_url` sur un item `a_faire`. Seul champ
  ouvert ; les statuts ne changent que par décision humaine.

## Garde-fous du prompt généré

Le générateur (`src/lib/dev/prompt.ts`) inscrit ces règles dans chaque prompt :

- Une PR par lancement, sur une branche dédiée, jamais de push direct sur main.
- Migrations SQL : fichier plus entrée au registre `docs/MIGRATIONS-EN-ATTENTE.md`,
  JAMAIS appliquées (§8.1).
- Aucun secret lu, écrit ou journalisé (§8.2).
- Un item ambigu se tranche selon les conventions du dépôt, et la décision se
  note dans la PR : personne ne lit la session en direct (§8.4).
- Style de tout texte produit : pas de tiret cadratin, pas de « on »,
  sujet-verbe-complément, pas d'emoji.
