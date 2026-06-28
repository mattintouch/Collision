# Magellan — Guide de prise en main (pour Clémence)

> À quoi sert Magellan, comment l'utiliser, et comment brancher le connecteur
> dans Claude. Pas besoin d'être technique.

## 1. C'est quoi Magellan ?

Magellan est notre **moteur de conquête d'invités** pour les podcasts de Collision
(GDIY, Combien Ça Gagne, Fleurons). Ce n'est pas un CRM : c'est un outil qui sert
à **ne plus laisser filer une cible** — relancer la bonne personne, au bon moment,
avec une vraie raison, par le bon chemin (contact direct « froid » ou via un
« relais » qui nous présente « chaud »).

Pour chaque cible, Magellan calcule un **score d'actionnabilité** (0–100) et la fait
remonter quand elle « bouge » : une actu fraîche (levée, nomination, livre…), une
fenêtre de relance qui s'ouvre, un relais joignable. Tu vois donc en haut du tableau
**qui travailler aujourd'hui**, au lieu d'une liste figée.

L'adresse : **https://magellan.collision.studio** (connexion avec ton compte Google
`@collision.studio` ou `@stefani.fr`).

## 2. Les écrans, en 1 minute

- **Board** : le pipeline, en colonnes. Tu peux **grouper par** (étape, archétype,
  voie, watchlist, secteur), **filtrer** (recherche, voie froid/chaud, tags), et
  **sélectionner plusieurs fiches** pour une action de masse (archiver, tagger…).
  Chaque carte affiche son **score** et des **badges** (« signal frais »,
  « fenêtre de relance », « relais actionnable », « estival ☀ »…).
- **Fiche cible** : tout sur une personne/entreprise — coordonnées cliquables,
  tags, appuis (alliés/relais), journal des échanges, et un bouton **Enrichir**
  (recherche web sourcée). Tout est **modifiable en ligne**.
- **Épisodes** : les invités déjà programmés / enregistrés / publiés (ils sortent
  automatiquement du board prospect). On peut **réactiver** un ancien invité.
- **Dispo / Veille / Copilote** : créneaux libres, actualités des cibles, et un
  assistant conversationnel.

## 3. Quelques gestes utiles

- **Tagger** une cible (ex. `CAC40`, `Sport`, `estival`) : sélection multiple sur le
  board → « Tagger » ou « Créer & tagger ».
- **Mettre une priorité 1–5** : menu ⋯ sur une carte → ça la fait remonter.
- **Marquer « déjà invité »** : passer la cible à l'étape *Publié*.
- **Valider un enregistrement** : menu ⋯ → « Confirmer l'épisode » → on règle
  date/heure/lieu (défaut Studio 71) et on relit l'email d'invitation avant envoi.

## 4. Brancher le connecteur Magellan dans Claude

Le connecteur permet de **piloter Magellan en langage naturel** dans Claude
(« liste les cibles GDIY qui bougent », « passe Untel en déjà invité »…). Il utilise
**ton abonnement Claude** (pas de clé technique à gérer).

**Prérequis** : un compte **Claude payant** (Pro/Team) et t'être connectée au moins
une fois sur https://magellan.collision.studio avec ton compte Google pro (ça crée
ton accès).

**Étapes (≈ 2 min), dans Claude (claude.ai) :**
1. **Réglages → Connecteurs** (Settings → Connectors).
2. **« Ajouter un connecteur personnalisé »** (Add custom connector).
3. **Nom** : `Magellan` · **URL** :
   `https://magellan.collision.studio/api/mcp`
4. Clique **Connecter** → une page Google s'ouvre → **continue avec ton compte
   `@collision.studio`** et autorise.
5. De retour dans Claude, **active le connecteur** (coche-le) dans une conversation.

**Pour tester que ça marche**, demande à Claude :
> « Avec Magellan, liste-moi 5 cibles GDIY à travailler cette semaine. »

Tu dois obtenir une liste triée par score. ✅

> Si tu ne vois aucune donnée / « accès refusé » : ton compte n'a peut-être pas
> encore les droits. Préviens Matthieu, il te les donne en 30 secondes.

## 5. Qui fait quoi

- **Matthieu** : super-admin (accès total, réglages).
- **Clémence** : admin.
- L'équipe (Mateo, Axel, Clément, Manon) : accès aux shows.

En cas de doute, demande à Matthieu — ou pose la question directement à Claude une
fois le connecteur branché.
