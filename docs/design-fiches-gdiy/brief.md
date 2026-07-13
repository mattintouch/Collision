# Brief Claude Code : système de fiches prépa GDIY sur Magellan

Objectif : industrialiser la production des fiches de préparation d'épisodes de Génération Do It Yourself. Une fiche par épisode, générée automatiquement, publiée sur Magellan à une URL stable, puis challengée et amendée via MCP par Matthieu Stefani et Clémence Lepic jusqu'au statut "finale". Ce brief est la spécification complète : contenu, pipeline, architecture, workflow.

## 1. Contexte

GDIY : podcast long format (2 à 3 heures), plus de 600 épisodes, audience allant du dirigeant CAC 40 à l'étudiant. Devise : nous sommes la moyenne des personnes que nous fréquentons.
L'obsession éditoriale : le "comment". Chaque fiche transforme le parcours de l'invité en playbook actionnable. Test qualité d'une question : la réponse peut-elle changer la façon de travailler d'un auditeur dès lundi matin.
Enregistrements : mardis et jeudis 9h30, Studio 71, rez-de-chaussée du 71 rue de Saussure, 75017 Paris, sur la rue.
Usage : Matthieu travaille la fiche en amont sur desktop, puis la relit en last minute sur mobile. Mobile-first obligatoire.

## 2. Architecture cible sur Magellan

Magellan est une app web existante (repo + déploiement). À implémenter :

### 2.1 Stockage et rendu

- Chaque fiche vit à une URL stable : magellan.<domaine>/fiches/{slug-invite} (slug = prénom-nom, ex. /fiches/xavier-niel).
- Point critique : le contenu de la fiche est stocké en données structurées (JSON ou MDX par sections), le HTML n'est que la couche de rendu. Un blob HTML monolithique rendrait l'édition via MCP fragile et les diffs illisibles. Chaque section (header, enjeu, chiffres, questions, etc.) est un objet adressable individuellement.
- URLs privées : non indexées (noindex + robots), protégées par un token simple ou magic link. Pas d'auth lourde.
- Index : /fiches liste toutes les fiches avec statut et date d'enregistrement.

### 2.2 Serveur MCP Magellan

Exposer un serveur MCP (distant, connectable depuis Claude.ai et l'app desktop) avec au minimum :

- list_fiches() : slug, invité, date rec, statut, version
- get_fiche(slug) : contenu complet structuré
- get_section(slug, section_id) et update_section(slug, section_id, content) : édition fine, jamais de réécriture totale forcée
- add_comment(slug, section_id, author, text) et resolve_comment(comment_id) : le challenge de Matthieu et Clémence laisse une trace
- set_status(slug, status) : draft → en_challenge → finale → verrouillee (verrouillage J-1, plus aucune modification hors checklist)
- add_note(slug, text, source) : injection de matière brute à tout moment (voir 3.1)

### 2.3 Versioning

Chaque update_section incrémente une version. Historique consultable (qui, quand, quoi). Rollback possible sur une section.

## 3. Pipeline de génération d'une fiche

### 3.1 Inputs

- Nom de l'invité + date et heure d'enregistrement (déclencheur minimal).
- Notes injectées dans Claude au fil de l'eau, trois origines : échanges avec l'invité ou sa team, échanges avec Clémence, réflexions personnelles de Matthieu. Ces notes arrivent avant ou après la génération initiale : le système doit accepter l'enrichissement continu via add_note, et la fiche doit signaler les notes non encore intégrées.

### 3.2 Recherche (niveau d'exigence maximal)

- Recherches web systématiques et approfondies : interviews passées (presse, podcasts, vidéos), chiffres d'entreprise (levées, CA, effectifs, valorisation), controverses, anecdotes peu connues. Croiser les sources, dater chaque chiffre.
- Cartographier ce que l'invité a déjà raconté partout : liste des anecdotes sur-racontées (à éviter ou à dépasser d'un cran : "tu racontes souvent X, mais qu'est-ce qui s'est passé juste avant") et des angles morts jamais explorés.
- Vérifier si l'invité ou son écosystème est déjà passé dans GDIY : épisodes à référencer en conversation.

### 3.3 Règle de vérification absolue

- Chiffre confirmé par source publique fiable : dans la fiche, avec source datée.
- Information issue uniquement de notes internes ou de rumeurs : bandeau Zone grise, à faire dire par l'invité.
- Erreur détectée dans une note interne : corrigée dans la fiche ET signalée dans le message de livraison.
- Interdit : tout chiffre sans source hors zone grise.

## 4. Structure de la fiche (ordre exact des sections)

Chaque section porte un section_id stable pour l'édition MCP.

1. sticky_header : bande de couleur, nom de l'invité + société à gauche, "GDIY" en monospace à droite. Visible en permanence au scroll.
2. entete : nom de l'invité en gros titre, cliquable vers son LinkedIn et/ou Wikipedia. Sous-titre d'une phrase : qui il est, pourquoi maintenant. Pilules logistiques : date et heure, Studio 71 rez-de-chaussée sur rue, durée 2-3h.
3. checklist_prerec : vraies cases à cocher (input checkbox, item barré quand coché, état persistant en localStorage) : mode avion x2, café + eau, son + cams, brief invité (euh, couper la parole, questions directes), photos (invité seul de face + avec Matthieu).
4. enjeu : l'enjeu de l'épisode en 5 lignes max. Pourquoi cet invité, pourquoi maintenant, la promesse pour l'auditeur, le clip social visé (la séquence qui portera l'épisode sur les réseaux), et le risque principal (invité média-trainé, sujet déjà usé, technicité).
5. sources_rapides : les 3 liens les plus utiles, en haut de fiche.
6. trente_secondes : "30 secondes avant d'entrer" : qui, le fait d'armes, pourquoi maintenant, état d'esprit probable de l'invité (première interview longue ou média-training rodé).
7. chiffres : cartes KPI vérifiées et datées : l'invité, la société (levées, CA, effectifs, valorisation, croissance), le marché. Chaque carte porte sa source.
8. parcours : dates importantes en bullets chronologiques, dates en gras, pas de point final. Fourni (GDIY raconte une vie), mais chaque ligne doit pouvoir déclencher une question.
9. entreprise : l'entreprise ou le sujet : chronologie, chiffres clés, modèle économique, concurrence, moments de bascule.
10. playbook : 5 à 8 méthodes ou systèmes identifiés dans les sources, que l'épisode doit faire expliciter (recrutement, décision, gestion du temps, vente, apprentissage, rebond). Pour chacun : ce qu'on sait déjà, ce qui manque, la question qui l'extrait. Les sources sont un levier : l'objectif est d'aller plus loin qu'elles, obtenir de la substance exclusive.
11. entourage : mentors, associés, rencontres pivots, ennemis utiles. Qui a fait de lui la moyenne qu'il est devenu. Au moins une question de l'épisode porte dessus.
12. tensions : 2 à 4 cartes, chacune opposant deux faits vérifiés (échecs maquillés en pivots, contradictions discours/décisions, zones d'ombre).
13. questions_recurrentes : les questions que l'invité a déjà eues dans dix interviews, avec sa réponse rodée résumée en une ligne. Double usage : interdiction de les reposer telles quelles, et matériau pour les dépasser ("tu réponds toujours X, mais...").
14. questions_reseaux : questions posées par la communauté (LinkedIn, Instagram, newsletter). Section structurée mais vide à la génération, alimentée manuellement via MCP avant l'enregistrement : question, auteur, plateforme, intérêt éditorial. La fiche affiche un rappel si la section est vide à J-2.
15. sequencage : 6 à 8 blocs sur 2h30, alternant récit (émotion, entertainment) et extraction (le comment). Monter en intimité progressivement, garder une tension pour la dernière heure. Timings indicatifs en monospace.
16. dix_questions : les 10 questions plus relances en sous-notes. Courtes, directes, tutoiement, sans guillemets, sans point final, majorité en "comment". Sous-notes tactiques : relance prévue, chiffre à exiger, terrain glissant.
17. zone_grise : bandeau : tout ce qui vient de notes internes non vérifiées, à faire confirmer par l'invité.
18. sources : liens cliquables datés avec l'apport de chacun.
19. footer : monospace, rappel post-rec : photos + mémo vocal (ressenti, ce qui a marqué, idées d'accroche LinkedIn, titre, potentiel de l'épisode).

### 4.1 Sections adaptatives par type d'invité (amendement)

Les sections et visualisations financières (chiffres d'entreprise, CA vs concurrents, rentabilité, timeline entreprise) ne s'appliquent qu'aux entrepreneurs et investisseurs. Pour un artiste : sorties d'albums / œuvres datées, chiffres carrière (ventes, streams, salles), timeline des dates clés. Pour un sportif : palmarès, records, timeline des saisons charnières. Règle : les sections non applicables au profil sont absentes de la fiche, jamais vides, pour ne pas polluer la lecture. Les composants visuels (cartes KPI, barres, timeline) sont réutilisés avec d'autres données.

## 5. Style d'écriture (non négociable)

- Pas d'emoji. Pas de tiret cadratin ni de double tiret : virgule, point, parenthèse ou deux-points.
- Pas de "on" : sujets explicites. Sujet, verbe, complément. Sharp, concis, zéro fluff.
- Questions à l'oral, dans la voix de Matthieu : directes, parfois abruptes, bienveillantes dans l'intention.
- Vulgariser sans simplifier : chaque concept technique expliqué naturellement dans la question.

## 6. Design system

Reprendre le système GDIY (noir/blanc éditorial, Tungsten caps, hairlines) tel que spécifié dans le README.md de ce handoff, section Design Tokens. Le prototype `Fiche GDIY - Xavier Niel.dc.html` est la référence visuelle exacte.
Mobile-first. Polices Tungsten fournies en woff2, fallback Arial Narrow ; corps en neo-grotesk système. Aucune dépendance externe au rendu.
Composants : cartes KPI, bullets de parcours à dates en gras, cartes de tension, bandeau crème pour la zone grise, monospace pour labels, timings, numéros et données, graphiques en barres div (pas de librairie de charts).

## 7. Workflow de challenge

- Génération : la fiche est créée en draft à son URL, notification (mail ou Slack) à Matthieu et Clémence.
- Challenge : Matthieu et Clémence connectent le MCP Magellan à Claude et travaillent la fiche en conversation : "durcis la question 4", "la tension 2 est faible, trouve mieux", "ajoute ce que m'a dit son associé". Claude lit via get_section, modifie via update_section, commente via add_comment. Statut en_challenge.
- Convergence : quand les commentaires sont résolus, passage en finale. À J-1, verrouillee.
- Message de livraison de chaque génération ou mise à jour majeure : uniquement les corrections apportées aux notes internes, la zone grise, les angles morts identifiés, et les deux questions à ne pas rater. Jamais de paraphrase de la fiche.

## 8. Critères d'acceptation

- Une fiche sans section playbook est un échec, quelle que soit sa qualité par ailleurs.
- Aucun chiffre sans source hors zone grise.
- Aucune question dont la réponse est déjà dans dix interviews de l'invité, sauf dépassement explicite.
- La fiche se lit confortablement sur mobile en 5 minutes (relecture last minute) et se travaille en profondeur sur desktop.
- Toute section est éditable individuellement via MCP sans casser le rendu.
- La checklist pré-rec conserve son état entre deux ouvertures sur le même appareil.
- Les sections non applicables au profil de l'invité sont absentes, jamais vides.

## 9. Points laissés à l'arbitrage de Claude Code

- Choix JSON vs MDX pour le stockage des sections (privilégier ce qui rend update_section le plus robuste).
- Mécanisme exact d'auth des URLs privées et du MCP.
- Détail du système de notifications.
- Implémentation du chat régie (temps réel entre connectés à la fiche) : websocket, polling, ou service existant du repo.

## 10. Points ouverts côté produit (à trancher par Matthieu et Clémence, pas par Claude Code)

- Questions réseaux sociaux : le brief prévoit la structure mais pas la collecte. Sans process de collecte (post LinkedIn systématique à J-7, formulaire, veille des commentaires), la section restera vide. À décider.
- Qui déclenche la génération : manuelle, ou automatique dès qu'une date d'enregistrement est posée dans le pipeline invités.
