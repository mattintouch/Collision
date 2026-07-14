# Magellan. Contrat de fiche v2 (Bloc A / Bloc B)

Spécification à intégrer dans le code Magellan : catalogue de sections, prompts de génération, rendu HTML.

## 0. Principe directeur

Le filtre éditorial n'est pas « connu vs inconnu », c'est « surface vs mécanisme ». La fiche couvre le connu en profondeur au lieu de le fuir. L'obsession : déconstruire comment l'invité est devenu le meilleur dans son univers. Deux objets cohabitent dans une même page : un document d'apprentissage (Bloc A, lu 48h avant) et une console d'épisode (Bloc B, scannée pendant l'enregistrement).

## 1. Bloc A. Comprendre (lecture avant enregistrement)

### A1. Enjeu de l'épisode
Inchangé. Pourquoi cet invité, pourquoi maintenant, ce que l'épisode doit produire.

### A2. Récit canonique
Remplace « Présentation de l'invité ». L'histoire telle que le grand public informé la connaît, racontée en 5 à 8 paragraphes maîtrisés : origines, bascules, ascension, statut actuel. Interdits : SIREN, numéro de toque, adresses administratives, données d'annuaire, sauf pertinence narrative explicite. Le récit doit permettre à Matthieu de reformuler la trajectoire de mémoire.

### A3. Mécanique du succès (nouvelle, obligatoire)
Le cœur de la fiche. Contenu exigé :
- Définition du « meilleur » dans l'univers de l'invité, avec métrique explicite (taux, palmarès, part de marché, influence mesurable).
- Pairs et concurrents nommés, avec positionnement relatif de l'invité.
- 3 à 5 points de divergence datés : les moments où sa trajectoire a décroché de celle de ses pairs, et les décisions structurantes associées.
- Contrefactuel : ce qui serait arrivé sans ces décisions, signalé comme raisonnement, pas comme fait.

### A4. Univers / marché
Remplace « La société / l'activité ». Adapté au profil : marché et dynamiques sectorielles pour un entrepreneur, discipline et hiérarchie mondiale pour un sportif, paysage et rapports de force pour un politique, écosystème professionnel pour un avocat ou un médecin. Taille, économie, acteurs, tendances multi-années. Toute donnée sourcée et datée.

### A5. Personnel (nouvelle)
Situation familiale, histoires personnelles publiquement connues, épreuves, passions. Règles strictes : source publique obligatoire pour chaque élément, sinon bascule en zone grise. Bandeau d'usage systématique : « matière pour le rapport et les relances, diffusion à l'antenne à valider au cas par cas ». Aucune reconstruction, aucune inférence sur la vie privée.

### A6. À lire
Remplace « Sources rapides ». 5 à 8 sources hiérarchisées en trois niveaux : indispensable, utile, optionnel. Pour chaque source : titre, date, temps de lecture estimé, apport en une phrase. Wikipédia inclus sans complexe quand la page existe. Chaque URL vérifiée à la génération (réponse HTTP valide) ; URL invérifiable = exclue ou zone grise, jamais reconstruite.

## 2. Bloc B. Console (pendant l'enregistrement)

Format scannable : cartes, labels mono, données denses, aucune prose continue.

- B1. 30 secondes avant d'entrer (inchangé)
- B2. En chiffres : jamais vide, 8 à 15 données clés sourcées et datées, mélange invité + univers
- B3. Parcours daté (inchangé, nettoyé des données d'annuaire)
- B4. Entourage (inchangé)
- B5. Anecdotes (inchangé)
- B6. Tensions (inchangé)
- B7. Questions récurrentes à dépasser (inchangé)
- B8. Questions clips (inchangé)
- B9. Séquençage (inchangé)
- B10. Les 10 questions (inchangé)
- B11. Zone grise (inchangé)
- B12. Sources complètes (liste exhaustive, URLs vérifiées)

## 3. Règles de génération

1. Filtre éditorial injecté dans les 4 prompts : profondeur sur le canonique, mécanique avant scoop.
2. Interdits transverses : SIREN, immatriculations, numéros professionnels, adresses, sauf pertinence narrative.
3. Tout chiffre porte une source et une date. Donnée non sourçable = zone grise.
4. Aucune URL reconstruite ou devinée. Vérification HTTP à la génération.
5. Gate de statut : passage en « en_challenge » refusé si A3, A4 ou B2 est vide.
6. Pipeline : retry automatique (2 tentatives) sur timeout ou erreur API, journal de génération affiché dans la fiche, alerte visible si un groupe reste en échec.

## 4. Design et rendu

- Bloc A : mode lecture, prose, interligne généreux, largeur de colonne limitée.
- Bloc B : mode console, cartes compactes, mono pour labels et données, ancres de navigation rapides.
- Blocs et sections réordonnables (ordre stocké par fiche, défaut au catalogue).
- Séparation visuelle nette entre les deux blocs (le Bloc B commence à l'ancre « console »).
- Identité existante conservée : papier froid, cobalt, bande ambre pour alertes, pas d'emoji, pas de tirets cadratins.

## 5. Migration

- Le catalogue passe de 19 sections à la structure ci-dessus (renommages : presentation → recit_canonique, entreprise → univers, sources_rapides → a_lire ; créations : mecanique_succes, personnel).
- Les fiches existantes conservent leur contenu, mappé sur les nouvelles clés.
- Fiche Chiche : cas d'école de la migration, régénération de A3, A4, A5 et B2 après correction du pipeline.
