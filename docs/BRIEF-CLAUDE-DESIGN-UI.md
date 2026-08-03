# Brief Claude Design · Refonte UI Magellan (fiches GDIY v3.1)

Version finale du 31/07/2026, rédigée par Claude Code à la livraison de la
refonte technique v3.1. Ce document est autoporteur : tout ce qu'il faut pour
travailler est dedans ou accessible par les outils cités.

## Mission

Refondre l'UI des fiches Magellan. Objectif : lisibilité maximale pendant un
entretien en direct qui exige de la concentration. La refonte porte en
priorité sur les polices, la hiérarchie et la densité.

Accès aux données réelles : serveur MCP `https://magellan.collision.studio/api/mcp`
(authentification par le compte Magellan). Outils utiles :

- `get_fiche` avec `fiche: "rudy-gobert"` : la fiche entière (le paramètre
  `sections` limite la charge, ex. `sections: "tldr,topics,clips"`).
- `get_section` avec `fiche` + `section_id` : une section, son contenu
  structuré ET son contrat d'édition (champ `contrat` : la forme exacte du
  JSON). C'est la source de vérité du schéma de chaque section.
- `list_fiches` : les fiches disponibles.

La fiche `rudy-gobert` fait foi pour le contenu type de chaque section
(données réelles, JAMAIS de lorem ipsum).

## Direction artistique

- Point de départ : la DA GDIY, assets dans ce dossier Drive :
  https://drive.google.com/drive/folders/1a91A9dNZF44vA2Qmk2ncmzgeN2F99Fm-
- Existant technique : Tungsten Condensed/Compressed (woff2 auto-hébergées,
  `public/fonts/gdiy/`), corps Helvetica Neue, mono système, noir/blanc
  éditorial, jaune #F4C435 (alertes), rouge #E63946 (REC). Portée CSS limitée
  au segment /fiches (`src/app/fiches/fiches.css`), le reste de Magellan a un
  autre design (Cockpit sombre).
- À mélanger avec un style proche de Notion et des pratiques design
  modernes : typographie de lecture irréprochable, hiérarchie par l'espace
  plutôt que par la décoration, densité contrôlée, interlignage généreux,
  contrastes nets.
- Arbitre en cas de conflit : la lisibilité en situation de direct gagne
  toujours sur l'effet de style.

## Trois contextes d'usage, trois modes

1. Étude (J-3 à J-1) : desktop, lecture longue, annotation. Toutes les
   sections déployées.
2. Combat (H-1) : mobile, en déplacement ou en régie. Les ancres du sticky
   (TL;DR, Clips, Questions) donnent l'essentiel en trois taps. Typographie
   montée d'un cran.
3. Live (pendant l'enregistrement) : écran posé à distance de bras, coups
   d'œil de deux secondes entre deux questions. Corps de texte dimensionné
   pour une lecture à un mètre, questions en gros, notes tactiques en second
   niveau visuel, zéro élément décoratif dans le champ de vision.

Les trois modes sont aujourd'hui UN SEUL rendu : le mode est un chantier de
design pur (le back sert déjà toutes les données nécessaires).

## Sections à couvrir (contrat v3.1, ordre imposé)

Le catalogue technique vit dans `src/lib/fiche/sections.ts`, les formes de
contenu dans `src/lib/fiche/schema.ts` (et via `get_section`, champ `contrat`).

| # | section_id | Contenu |
|---|------------|---------|
| 00 | `sticky_header` | nom + société à gauche, GDIY mono à droite, TROIS ANCRES (TL;DR, Clips, Questions) masquées sous 560 px, REC/chrono/STOP à droite |
| 01 | `identite` | titre cliquable vers Wikipedia (systématique quand la page existe, sinon LinkedIn), titre · société(s), date de naissance + âge calculé à la date d'enregistrement, pilules logistiques, accompagnants (« à confirmer » si inconnu), mise en relation, sous-titre en deux phrases (fait d'armes + thèse en « le comment de ») |
| 02 | `checklist_prerec` | 5 items fixes, vraies cases, item barré quand coché, checklist complète = REC déverrouillé (le clic REC reste un geste séparé, décision Matthieu du 31/07 : pas de déclenchement automatique ; au design de fusionner VISUELLEMENT la 5e case et le bouton) |
| 03 | `tldr` | brief d'attaque 60 secondes, 1200 caractères, NEUF labels dans l'ordre : Qui, Fait d'armes, Fil rouge, Le comment, Polémique, Pourquoi maintenant, Piège, Levier, État d'esprit |
| 04 | `data` | cartes KPI (valeur, libellé, source datée ; pointeur ZG si non confirmé), 1 à 2 graphiques (barres verticales, comparaison horizontale), sous-bloc Marché et comparables |
| 05 | `apprentissages` | 5 à 8 systèmes au format connu / manque / question |
| 06 | `clips` | questions frontales avec tag ressort (ARGENT, ÉCHEC, CONTRE-PIED, CONFESSION), les questions qui fâchent ferment la liste (marqueur `fache`), pointeurs ZG visibles |
| 07 | `topics` | bloc Terrain connu (réponse rodée + dépassement), puis 5 à 8 topics : titre, gate time (debut_min → fin_min), intention une ligne, questions cœur NUMÉROTÉES EN CONTINU rayables d'un tap (timecode), sous-notes tactiques mono, pointeurs ZG |
| 08 | `personnel` | bandeau d'usage, trois sous-blocs : Entourage (rôle, ce qu'il éclaire, à pré-confirmer), Données cachées (sourcées ou ZG), Zone grise (bandeau, identifiants stables `zg_xxx`, CIBLE de tous les pointeurs) |
| 09 | `revue_de_presse` | réseaux sociaux (liens directs), palmarès daté exhaustif, À lire la veille (3 à 5, niveaux INDISPENSABLE/UTILE, temps de lecture, apport 120 caractères), renvoi « sources complètes en base » |
| — | `footer` | rappel post-rec mono : photos + mémo vocal |

Contrainte de schéma : `identite.accompagnants` et `identite.mise_en_relation`
sont saisis à la main (jamais générés) ; prévoir leur état vide (« à
confirmer ») sans casser la mise en page.

## Outils à intégrer au design (état technique réel)

1. **REC + checklist : EXISTE, branchable tel quel.** Session en base
   (survit au rechargement, partagée entre opérateurs), bouton dans le
   sticky : REC · n/5 tant que la checklist est incomplète, REC » quand elle
   est complète, chrono + STOP en confirmation deux temps pendant
   l'enregistrement. État visible en permanence dans le sticky (exigence déjà
   tenue).
2. **Timer adossé aux gate times : NOUVEAU, front seulement.** Toutes les
   données existent déjà : `started_at` de la session ouverte (chrono global,
   tic 1 s en place) et `debut_min`/`fin_min` par topic. À spécifier : affichage
   du topic courant, temps restant sur le topic, signal VISUEL de dépassement
   (jamais de son, jamais de popup). Zéro back à écrire.
3. **Clips (horodatage) : EXISTE en v1, extension à spécifier.** Le bouton
   CLIP écrit déjà un événement horodaté au timecode de la session (console
   partagée), la liste des marqueurs vit dans le carnet post-rec avec
   timecode + libellé copiables pour le montage. MANQUE (petit back) : le
   rattachement optionnel à la question en cours (ajouter `num` au payload de
   l'événement `clip`, une ligne côté client).
4. **Chat : EXISTE, branchable tel quel.** Régie en dock droit sur desktop
   (≥ 1280 px) et tiroir sur mobile, messages temps réel (Supabase Realtime,
   repli polling 2 s), compteur de non-lus, ligne de flottaison, alerte « en
   train d'écrire » pendant le REC, liens cliquables. Contrainte à respecter :
   jamais superposé aux questions. Nuance : c'est le chat de l'ÉQUIPE
   (Matthieu, Clémence), pas un accès direct à Claude ; l'accès à Claude
   passe par l'app Claude à côté. Un panneau « demander à Claude » dans la
   fiche serait un NOUVEAU back (à chiffrer à part, ne pas le promettre dans
   les maquettes sans ce back).
5. **Zone grise en accès rapide : EXISTE en v1 (ancre), popover à
   spécifier.** Chaque pointeur ZG (cartes KPI, questions, clips, données
   cachées) est aujourd'hui un lien qui déroule jusqu'à l'item dans la
   section personnel. La cible v3.1 (l'item complet s'affiche AU TAP, sans
   navigation) est un popover front : les données sont déjà sous la main
   (identifiants stables `zg_xxx`).

## Typographie et lisibilité, exigences dures

- Police de lecture principale choisie pour l'écran et testée en corps 16 à
  20 px, pas une police de titre utilisée partout (Tungsten reste pour les
  titres).
- Monospace réservé aux labels, timings, numéros, identifiants ZG.
- Longueur de ligne 60 à 75 caractères en mode étude, questions sur deux
  lignes maximum en mode live.
- Contraste AA minimum partout, AAA sur les questions en mode live.
- Mode sombre pour le studio, à valider avec la DA.

## Livrables attendus

1. Système de design : tokens (couleurs, type, espacements), à partir de la
   DA Drive.
2. Maquettes des neuf sections dans les trois modes, données réelles Gobert
   via MCP (`get_fiche`), pas de lorem ipsum.
3. Spécification des cinq outils (états, positions, comportements), en
   distinguant ce qui est branchable tel quel (REC, chat, clips v1, ancres
   ZG) de ce qui est à construire (timer, popover ZG, rattachement
   clip-question, modes).
4. Prototype navigable du mode live en priorité : c'est le mode qui juge la
   refonte.

## Garde-fous

- Les section_id et les formes JSON sont STABLES : le design s'adapte au
  contrat v3.1, pas l'inverse (toute demande de champ nouveau passe par
  Matthieu).
- La mécanique existante (REC, sessions, console partagée, questions rayées,
  chat) est conservée : la refonte change la présentation, pas le
  comportement.
- Style de tout texte produit : pas de tiret cadratin, pas de « on », sujet
  verbe complément, pas d'emoji.
