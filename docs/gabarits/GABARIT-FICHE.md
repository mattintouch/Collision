# Gabarit fiche de prep GDIY (référence : fiche-gdiy-onesta_1.html)

> Spécification extraite du fichier de référence, déposé au même endroit.
> La structure et les tokens sont FIXES ; seul le contenu varie par invité.
> Cible : route `/fiche/[episode]`, lien signé, régénérable depuis le
> dossier Magellan enrichi. Fichier autonome, mobile-first, partageable.

## Tokens (exacts, ne pas réinterpréter)

```
--paper:#F4F5F1;  --paper-deep:#E7E9E3;  --ink:#1B1D1E;  --ink-soft:#4A4D49;
--cobalt:#1B3FBF; --cobalt-deep:#142E8C; --amber:#B5790A; --amber-band:#F6E8C8;
--sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
```

Polices système uniquement (pas d'appel réseau de fonts). Mono pour tous
les labels, métadonnées et données chiffrées. Bandeau ambre réservé aux
alertes stratégiques (points de vigilance, pièges d'interview).

## En-tête

Surtitre mono « Fiche prépa · Génération Do It Yourself » · Nom en très
grand · sous-titre d'une ligne (positionnement de l'invité) · rangée meta
mono : ENTRETIEN (date + heure) · LIEU · DIFFUSION · FICHE (date de
génération). Ces quatre valeurs viennent de l'épisode Magellan.

## Les 10 sections (structure fixe, numérotées sec-num/sec-title)

| # | Titre | Alimentation depuis le dossier |
|---|---|---|
| 00 | Lecture stratégique | raison de sélection + playbook (angle, enjeu de l'épisode) |
| 01 | Mission | objectif de l'entretien en 2-3 phrases, ce que l'épisode doit produire |
| 02 | À verrouiller | points logistiques et éditoriaux à confirmer AVANT le jour J |
| 03 | Qui | bio/parcours : puces datées, dates en gras, sans point final |
| 04 | En chiffres | figures structurées de l'enrichissement (valeur, unité, libellé, source) : cartes `fig` + 2 graphiques SVG natifs max (`chart-box`, note et cap) |
| 05 | Questions réseaux · à dégainer | questions courtes, punchy, partageables |
| 06 | Questions profondes · 3 axes | 3 blocs `axis`/`deep`, questions avec `setup` (contexte 1-2 lignes) puis `q` |
| 07 | Masterclass | 3-4 leviers (`levier`) : méthode/management à extraire, format mh/mn/mt |
| 08 | À verrouiller à l'arrivée | checklist jour J : caméra/audio, élocution, photo de fin, cue « questions directes » |
| 09 | Sources | `read-row` : liens cliquables, typés (article/vidéo/podcast), avec date |

## Règles de contenu

- Questions : format habituel GDIY. Courtes, directes, tutoiement, pas de
  guillemets, cadence proche du show. Volume de référence : ~24 questions
  au total (réseaux + profondes), 12 items masterclass max.
- Section 04 : uniquement des figures SOURCÉES (issues du champ figures
  de l'enrichissement). Jamais de chiffre sans source.
- **Une section sans matière s'affiche explicitement comme manquante**
  (encart ambre « Section à alimenter : … »), jamais remplie de généralités.
  La fiche sert aussi de contrôle qualité de la prep.
- Style de prose : pas de tiret cadratin, pas de « on », sujet-verbe-
  complément, soutenu non littéraire.
- Lectures (09 + read-rows éventuels en 00) : alimentées par la liste de
  curation de la salle de prep (S11) quand elle existera ; d'ici là, par
  les sources d'enrichissement.

## Composants (classes existantes du fichier de référence, à réutiliser)

`sec-head/sec-num/sec-title` (têtes de section) · `fig/n/l` (carte chiffre :
nombre + libellé) · `chart-box/axis/chart-note/chart-cap` (graphique SVG) ·
`q` (question) · `setup` (contexte de question) · `deep` (bloc axe profond) ·
`levier` + `mh/mn/mt` (masterclass : titre/note/tag) · `read-row` (lecture) ·
`tag` (badges) · `sources`.

## Intégration

- Générée par le copilote (modèle par défaut) depuis get_dossier +
  l'épisode ; le HTML est stocké sur l'épisode et resservi par la route,
  bouton « Régénérer » réservé admin.
- Le lien signé de la fiche part dans le mail de préparation (S10) et
  dans la description de l'événement Calendar (S9).
