# Magellan — Cahier des charges fonctionnel (brief UI/UX)

> Document destiné à **Claude Design** pour refaire intégralement l'UI/UX.
> Il décrit **ce que fait le produit** et **ce que chaque écran montre/permet**,
> pas l'implémentation. La cible est une app web **mobile-first** (l'équipe
> l'utilise surtout au téléphone) qui tourne aussi bien sur desktop.

---

## 1. Le produit en une phrase

**Magellan** est le **moteur de conquête et de closing d'invités** de Collision
Productions pour ses podcasts. Il transforme une liste de prospects en épisodes
enregistrés, en disciplinant la relance (« on ne relance jamais au minuteur, on
relance avec une raison ») et en outillant chaque étape : repérage, recherche,
appuis (qui peut ouvrir la porte), prise de contact, validation, organisation de
l'enregistrement.

Ce n'est pas un CRM générique : c'est un **outil d'attaque commerciale éditoriale**.
Le ton doit être **premium, sobre, nerveux** — un cockpit, pas un tableur.

## 2. Utilisateurs & rôles

- **Aujourd'hui** : accès réservé par login Google (domaines `stefani.fr` /
  `collision.studio`). Pas de distinction de rôle dans l'UI.
- **Cible** (à venir) : **super admin** (Matt), **admin** (Clémence),
  **users** (Mateo, Axel, Clément, Manon). Le design doit prévoir des écrans
  d'**administration** (équipe, watchlists, gabarits, connexions) et des états
  selon le rôle.
- **Vadim** : un assistant IA (le « copilote ») qui agit dans l'app et via un
  connecteur ; jamais de droits admin.

## 3. Principes UX directeurs

1. **Mobile-first**, gros gestes, peu de saisie ; pensé pour être utilisé entre
   deux rendez-vous.
2. **« Pourquoi maintenant »** : chaque cible affiche une *raison de remontée*
   (actualité, silence, appui) — c'est le cœur du produit, à mettre en avant.
3. **Discipline de relance** visible : 3 conseils possibles — *Relancer*,
   *Attendre une raison*, *Passer par un appui*.
4. **Froid vs Chaud** (voie d'approche) toujours lisible d'un coup d'œil.
5. **Capturer sans friction** : coller un message/une capture d'écran et c'est
   journalisé.
6. **Le copilote écrit et agit**, il n'est pas qu'un chat décoratif.

## 4. Identité visuelle actuelle (à reprendre/affiner)

- **Palette** : noir profond (`#0A0A0A` → `#2A2A2A`), blanc (`#FAFAFA`, muté
  `#9CA3AF`), **jaune signature `#FFD200`** (accent Collision).
- **Couleurs par show** (signalétique, pas couleur studio) : GDIY vert
  `#1FB46A`, CCG bleu `#3B82F6`, Fleurons violet `#B45CFF`.
- **Voie** : froid = bleu ciel, chaud = orange.
- **Typo** : une *display* (titres) + une *sans* (texte) — à figer depuis le
  **Figma identité** (id `ZI56QbnEsPRDjL5JXJ7oEz`), les valeurs actuelles sont
  des placeholders.
- **Cartes** : coins arrondis (~14px), fond sombre, bordures discrètes.
- Thème **sombre par défaut**.

## 5. Vocabulaire métier (entités)

- **Show** : un podcast (GDIY = *Génération Do It Yourself*, CCG = *Combien Ça
  Gagne*, Fleurons). Deux types de pipe : **invités** (on chasse des personnes)
  ou **thématique** (on chasse des entreprises/sujets, ex. Fleurons).
- **Cible** : un prospect. Soit **personne**, soit **entreprise**. Champs : nom,
  rôle, organisation / secteur, pays, envergure, sujets, priorité (haute/moyenne/
  basse), **voie** (froid/chaud), **archétype**, étape, raison de sélection.
- **Archétype** (pipes invités) : **Big Fish** (gros poisson difficile),
  **Quick Win** (joignable vite, bon épisode), **Pépite** (peu connu, sujet
  brûlant/charisme).
- **Étape (stage)** : position dans le pipeline (ex. Identifié → Qualifié →
  Contacté → Confirmé → … → Publié), propre à chaque show.
- **Appui** : quelqu'un qui peut ouvrir la porte vers la cible (ancien invité,
  conseiller, entourage, contact interne). Peut être relié à la fiche d'une autre
  cible. *(évolution prévue : distinguer la nature et le rôle « relais ».)*
- **Touche** : une interaction logguée (message envoyé, échange, capture).
- **Signal** : une actualité de la cible (levée de fonds, livre, nomination,
  prix, passage média, mouvement d'entreprise) — alimente la « raison de
  remontée ».
- **Contact** : une coordonnée (email, téléphone, réseau, agence, site).
- **Épisode** : une cible validée, avec date d'enregistrement, lieu, participants.
- **Watchlist** *(à venir)* : facette de curation (ex. CAC40) filtrable et
  affichable en colonne.

## 6. Architecture de l'information

Barre du haut persistante : logo **Magellan** · **sélecteur de show** ·
onglets **Board / Dispo / Veille / Copilote** · badge type de pipe · **Réglages**.

Écrans :
1. **Login**
2. **Board** (par show) — vue principale
3. **Fiche cible** (le dossier)
4. **Copilote** (chat agissant)
5. **Dispo** (créneaux d'enregistrement)
6. **Veille** (signaux/actualités)
7. **Import** (depuis Folk)
8. **Réglages** (+ future **Administration**)

## 7. Détail des écrans

### 7.1 Login
- Marque Collision + Magellan, baseline « Moteur de conquête et de closing pour
  les podcasts. Accès réservé. », bouton **Continuer avec Google**, mention des
  domaines autorisés. Sobre, plein écran.

### 7.2 Board (écran principal)
- **Colonnes en scroll horizontal** (Kanban).
  - Pipe **invités** : une colonne par **archétype** (Big Fish, Quick Win,
    Pépite) + « À classer ».
  - Pipe **thématique** : une colonne par **étape**.
  - *(évolution : colonnes pilotées par un `group_by` arbitraire — stage,
    archétype, voie, watchlist, secteur, pays.)*
- **Carte cible** (l'objet le plus important du produit) montre : nom ; rôle ·
  organisation (ou secteur · pays pour une entreprise) ; **badge voie**
  (froid/chaud) ; étape ; priorité ; archétype ; nombre d'appuis ; et surtout le
  bloc **« pourquoi maintenant »** (raison de remontée + conseil *Relancer /
  Attendre / Passer par un appui*), mis en valeur en jaune si un **signal frais**
  existe. Tri par défaut : voie froide devant, puis score de résurgence.
- Actions attendues : ouvrir la fiche, créer une cible, (à venir) réordonner les
  colonnes, drag & drop entre étapes.
- **Compteurs** par colonne.

### 7.3 Fiche cible (le dossier)
En-tête : nom, sous-titre (rôle · organisation / secteur · pays), **coordonnées
cliquables** (mail/tél), **dernière touche** (date + canal), chips (étape, voie,
priorité, archétype). Boutons d'action : changer d'étape, **Confirmer → épisode**,
supprimer.

Corps en deux colonnes (desktop) / empilé (mobile) :
- **Relance** : la raison fraîche de relancer + discipline (« une relance porte
  une raison »), date de dernière touche, canal, « via qui ».
- **Capturer une touche** : zone pour coller un message/capture ; enregistrer
  remet le compteur à zéro.
- **Journal** : historique des touches (date, canal, contenu, tag capture).
- **Enregistrement** (si validé) : date + lieu, boutons **Reporter** (mini-
  calendrier) et **Annuler**.
- **Contacts** : liste mail/tél/réseau + bouton **Enrichir** (recherche de
  coordonnées sourcées).
- **Appuis** : qui peut ouvrir la porte (lien vers la fiche de l'allié si c'en
  est une).
- **Signaux** : actualités datées.
- **Sujets** : tags.
- Pour une entreprise : bloc **Sélection & recherche** (raison de sélection,
  état de la recherche).

### 7.4 Copilote
- Un **chat** branché sur la base : propose des cibles pour un créneau, suggère
  des appuis, **rédige** au style maison, respecte la discipline de relance, et
  **agit** (créer/mettre à jour une cible, ajouter un appui/contact, logguer une
  touche, valider). Le design doit rendre lisibles les **actions exécutées** par
  le copilote (et, le cas échéant, les demandes de confirmation).

### 7.5 Dispo
- Liste des **créneaux libres** d'enregistrement (calculés depuis Google
  Calendar, repli sur des créneaux ouvrés en démo). Sert à caler une date.

### 7.6 Veille
- Lancement et affichage de la **veille** : signaux/actualités trouvés sur les
  cibles, qui nourrissent la « raison de remontée ».

### 7.7 Import (Folk)
- Choisir un **groupe Folk** → aperçu → import des personnes en cibles (avec
  leurs coordonnées) ; compte rendu (créées / reliées / ignorées).

### 7.8 Réglages / Administration (à étoffer)
- Aujourd'hui : préférences (show par défaut), connexions.
- À venir : **équipe & rôles**, **watchlists**, **gabarits d'invitation**,
  **connexions Google/Folk**, statut de synchro.

## 8. Parcours clés (flows)

1. **Capturer une touche** : fiche → coller le message → enregistre → compteur
   « jours depuis touche » remis à zéro, journal mis à jour.
2. **Enrichir une cible** : fiche → *Enrichir* → propositions de coordonnées
   (sources publiques) → validation. *(évolution : enrichir aussi rôle/orga/
   secteur/raison avec sources, en validation humaine.)*
3. **Valider un prospect → épisode** (parcours central, déjà implémenté) :
   - modale de validation : **mini-calendrier** (date par défaut mardi/jeudi
     9h30), heure, **lieu** (Studio 71 par défaut), **objet** et **message
     d'invitation** pré-remplis (gabarit GDIY, **bascule FR/EN**, éditable),
     **participants** (invité + équipe), envoi de l'invitation.
   - effets : création de l'**épisode** ; **invitation Google Calendar** aux
     participants ; **réservation Studio 71** (-1h/+1h) **si le lieu reste le
     studio** ; bouton **« Préparer la fiche invité dans Claude »** (lien pré-
     rempli avec le brief).
   - ensuite, sur la fiche : **Reporter** (déplace les 2 événements) /
     **Annuler** (les supprime).
4. **Relancer intelligemment** : le board remonte les cibles avec une raison
   (signal frais, silence prolongé + appui dispo, priorité) — l'UX doit guider
   « qui contacter, pourquoi, comment » plutôt que présenter une liste plate.

## 9. États transverses à designer

- **Vide** : colonnes sans cible, fiche sans contact/appui/signal (messages
  d'incitation existants à reprendre).
- **Chargement / action en cours** (validations, imports, copilote qui rédige).
- **Erreur** (échec calendrier, Folk introuvable, etc.).
- **Mode démo** : bandeau « données locales » quand la base n'est pas branchée.
- **Confirmations** d'actions fortes (valider, supprimer, annuler un
  enregistrement).

## 10. Contraintes pour le design

- **Mobile-first**, contenu large (board, journal) en scroll interne sans
  déborder horizontalement la page.
- App **Next.js + Tailwind**, thème sombre ; composants réutilisables (carte,
  chip, champ, modale, mini-calendrier).
- Accessibilité : contrastes (fond très sombre), cibles tactiles confortables.
- Prévoir l'arrivée de : **watchlists** (colonnes/filtres), **rôles & admin**,
  **statuts de synchro** (Google Contacts, Folk), **enrichissement sourcé** (avec
  citations). Voir `docs/BACKLOG.md`.

## 11. À fournir au designer

- Le **Figma identité** Collision (id `ZI56QbnEsPRDjL5JXJ7oEz`) pour figer
  palette + typographies définitives.
- Les **3 couleurs de show** (GDIY/CCG/Fleurons) à valider comme système.
- Exemples réels de cibles (Zagury, Filosa — cf. backlog) pour des maquettes
  crédibles.
