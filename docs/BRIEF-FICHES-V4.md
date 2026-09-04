# Fiches de préparation GDIY : brief v4 (refonte du 31/08/2026)

Autorité de design et de structure : la maquette de Clémence, validée par
Matt, `Fiche_Prepa_GDIY_Dimitri_Rassam_v3.html`. En cas de doute entre ce
document et la maquette, la maquette gagne. Ce document versionne le brief de
génération v4 et son diff lisible contre le contrat v3.1 (brief du 31/07,
prompts dans `src/lib/fiche/generation.ts` et `src/lib/fiche/redaction.ts`,
budgets dans `src/lib/fiche/schema.ts`, catalogue dans
`src/lib/fiche/sections.ts`).

## Ce qui ne change pas (v3.1 conservé tel quel)

- Le pipeline par passes : portrait, chiffres, angles, deroule, puis la
  passe de rédaction (consolidation, lint, budgets). Depuis le 01/09
  (chantier timeouts), une passe « synthese » s'intercale avant la
  rédaction : le TL;DR et le clickbait en sortent SANS recherche web
  (synthèse de la fiche assemblée), le deroule allégé ne porte plus que le
  terrain connu, les briques et la zone grise, et ne démarre que dans un
  drain qui peut le finir (réserve murale, cron seulement).
- La propriété unique des faits, la doctrine de profondeur, les interdits
  transverses, la vérification des URLs, les budgets durs par champ.
- Le TL;DR à neuf labels (Qui, Fait d'armes, Fil rouge, Le comment,
  Polémique, Pourquoi maintenant, Piège, Levier, État d'esprit).
- Les apprentissages (5 à 8 systèmes connu / manque / question).
- Le stockage : mêmes sections, mêmes tables, versionnement inchangé. AUCUNE
  migration SQL : toutes les extensions v4 vivent dans le JSON des sections.
- La console partagée (clips, carnet, régie, coches, questions rayées) :
  mêmes événements, même synchro temps réel.

## Diff v3.1 → v4, section par section

| Objet | v3.1 | v4 |
| --- | --- | --- |
| Rendu | FicheView « Tungsten », modes étude/combat/live, sticky header avec REC en base | Reproduction de la maquette : Archivo Black / Barlow Condensed / IBM Plex Mono / Source Sans 3 auto-hébergées, catégories collantes Intro / Marché / Main topics / Approfondissement / Les sources |
| Checklist pré-rec | 5 items fixes, checklist complète déverrouille le REC | 7 gestes fixes, bande rouge dépliée par défaut, repliable ; REC dans la bande, TOUJOURS cliquable, chronomètre de séance purement local |
| Checklist post-rec | Footer texte mono | Bande rouge « Avant de quitter le studio », 6 gestes, repliée par défaut (le footer texte reste stocké, plus affiché) |
| Header | Titre Tungsten, liens en pastilles | Eyebrow show, nom en Archivo Black, règle jaune, sous-titre avec l'âge calculé (« 44 ans · ... »), pilules, rangée de boutons dont le bouton photo jaune (Google Images, nom entre guillemets, URL encodée) |
| Palmarès (`revue_de_presse.palmares`) | Titres, exits, récompenses, records | BIO TIMELINE : une ligne = une date = un fait, pro et perso mêlés, chronologique |
| `data` | KPI + 1-2 graphiques + marché (texte + comparables) | Inchangé, PLUS `marche_graphs` (3 cartes graphiques du marché en barres CSS, adaptées au secteur : marché mondial, force qui bouscule, bascule France/Europe ; série non sourçable = graph OMIS, jamais estimé) et `lexique` (8 à 12 termes du jargon, une phrase chacun ; interdiction du jargon non défini ailleurs). Les 3 premiers KPI se rendent en cartes héroïques |
| `topics` | Titre + gate time + intention + questions avec notes tactiques | Briques : titre, contexte en un paragraphe, dates clés, citations sourcées, chiffre héroïque facultatif, extras listés, Réflexions (lecture tactique), questions numérotées en continu avec tag `clip` sur les candidates réseaux, `pleine_largeur` sur les briques cœur. Minutage (`debut_min`/`fin_min`) et notes tactiques (`note`) TOLÉRÉS en lecture, plus jamais affichés ni exigés |
| Terrain connu | 3 à 6 items | SYSTÉMATIQUE, exactement 3 items (question posée partout / réponse rodée / dépassement), rendu en triptyque |
| `clips` | ~10 questions {question, ressort, fache} | CLICKBAIT (remplacement, règle de la brique unique) : `{piquantes: [5], apprentissages: [5]}`. 5 qui piquent (jusqu'à la gêne assumée : héritage, argent personnel, échecs, ce qu'il referait ou pas), 5 qui font apprendre (grille de lecture, règle transmissible, habitude contre-intuitive, coût de ses non, comment on entre dans son club). Tutoiement, pas de guillemets. Les fiches v3.1 au format `{questions}` restent affichées dans l'ancien style tant qu'elles ne sont pas régénérées |
| `personnel.zone_grise` | id + texte + origine | + champ `sujet` (libellé court affiché en tête de ligne du bloc Zones grises ; repli sur l'identifiant nettoyé) |
| `revue_de_presse.a_lire` | niveau, titre, date, temps, apport, url | + booléen `embargo` (badge rouge EMBARGO à côté du titre) |
| Style généré | Pas de tiret cadratin ni double tiret | AUCUN TIRET D'AUCUNE SORTE (ni cadratin, ni demi-cadratin, ni tiret de liste, ni flèche) : virgules, parenthèses, deux-points, points médians. Toute valeur chiffrée datée et sourcée (règle déjà en vigueur, réaffirmée) |
| Fontes | Google Fonts au runtime (Source Sans 3, IBM Plex Mono) + Tungsten locale | TOUT auto-hébergé (woff2 dans `/public/fonts/gdiy`) : la fiche s'affiche au studio sans réseau fiable |
| Pool de questions générales | Absent | Fold discret en fin de fiche, pool fixe de l'émission (constante, jamais générée) |
| Sources complètes | Renvoi vers Magellan | Fold discret « Toutes les sources consultées (N) », titres en mono |

## Brief de génération v4 (résumé des consignes par passe)

1. **portrait** : identité et revue de presse inchangées, SAUF le palmarès qui
   devient la bio timeline (pro et perso publics mêlés, chronologique,
   exhaustive et datée).
2. **chiffres** : produit en plus `marche_graphs` (3 graphs visés : taille et
   trajectoire du marché mondial ; la force qui bouscule le secteur ; la
   bascule France/Europe si pertinente ; valeurs datées et sourcées par la
   recherche web de la passe, série non sourçable = graph omis, règle
   appliquée AUSSI côté code) et `lexique` (8 à 12 termes pour quelqu'un qui
   ne vient pas du secteur). Les trois graphs s'adaptent au secteur de
   l'invité : le triptyque cinéma de la maquette est un exemple, pas un
   gabarit.
3. **angles** : inchangé (apprentissages + personnel, idées éditoriales
   injectées).
4. **deroule** : terrain connu SYSTÉMATIQUE (3 items) ; briques enrichies
   (contexte, dates, citations, hero, extras, réflexions, pleine_largeur,
   tag clip environ une question sur quatre) ; plus AUCUNE note tactique ni
   minutage dans la consigne ; clickbait exactement 10 questions (5 + 5).
5. **rédaction** : inchangée, avec deux garde-fous v4 : `marche_graphs` et
   `lexique` sont conservés si la réécriture de data les omet, et le lint des
   questions en double couvre les deux registres du clickbait.

## Hors périmètre, reporté (décisions du brief v4)

- Intégration console du bouton REC : le chrono de la bande checklist est
  purement local. Les sessions d'enregistrement en base
  (`fiche_rec_sessions`), le STOP avec confirmation et l'email automatique
  des notes de fin d'épisode ne sont plus branchés sur l'interface ; le
  renvoi des notes reste possible via l'API `/api/fiches/[slug]/stop`
  (resend) tant que des sessions historiques existent.
- Récupération automatique de photos : réduite à un lien Google Images.
- Adaptation du template aux autres shows : le rendu est GDIY, mais rien ne
  code le show en dur (l'eyebrow porte le show de la fiche).
- Modes étude / combat / live du renderer v3.1 : retirés (absents de la
  maquette). Le live retrouvera une réponse dans l'itération console.

## Compatibilité descendante

- Une fiche v3.1 se rend sans erreur : blocs v4 absents ou en repli
  (marché → texte + comparables ; clips `{questions}` → ancien style ;
  briques sans contexte → l'intention fait le paragraphe de contexte).
- La régénération (generate_fiche) produit nativement le format v4.
- Une fiche d'un contrat antérieur à v3.1 non migrée reste lisible par un
  bloc compact (enjeu, récit, questions) sous le pool de questions.
