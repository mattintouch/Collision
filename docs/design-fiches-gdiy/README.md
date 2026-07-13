# Handoff : Fiches de préparation GDIY sur Magellan

## Overview
Fiche de préparation d'épisode pour Génération Do It Yourself, à intégrer dans Magellan. Une fiche par invité, à URL stable, avec deux modes d'usage : **PRÉPA** (lecture découverte et travail en profondeur, desktop) et **LIVE** (usage pendant l'enregistrement, mobile-first, fond noir anti-reflet). Ce handoff accompagne le brief produit complet (voir `brief.md`) : le brief définit le pipeline, le MCP et le workflow ; ce document définit le design et les comportements UI.

## About the Design Files
`Fiche GDIY - Xavier Niel.dc.html` est une **référence de design en HTML** : un prototype montrant l'apparence et le comportement voulus, pas du code de production. La tâche est de **recréer ce design dans le stack de Magellan** (framework existant du repo) avec ses patterns établis. Le contenu Xavier Niel est un exemple réaliste ; en production, le contenu vient du pipeline de génération décrit dans le brief, stocké en sections structurées (JSON/MDX), le HTML n'étant que la couche de rendu.

## Fidelity
**High-fidelity.** Couleurs, typographie, espacements et interactions sont finaux. Recréer au pixel avec les composants du codebase.

## Principe structurant : sections adaptatives par type d'invité
Le template de fiche est un **ensemble de sections optionnelles**. La génération n'inclut que les sections pertinentes au profil de l'invité, jamais de section vide ou non applicable.

- **Entrepreneur / investisseur** : chiffres d'entreprise (CA, levées, valorisation, effectifs), graphique CA vs concurrents sur 10 ans, rentabilité, timeline de l'entreprise.
- **Artiste** : sorties d'albums / œuvres avec dates, chiffres carrière (ventes, streams, salles), timeline des dates clés.
- **Sportif** : palmarès, records, chiffres carrière, timeline des saisons charnières.
- Sections toujours présentes : sticky_header, entete, checklist_prerec, enjeu, sources_rapides, trente_secondes, parcours, playbook (obligatoire, critère d'acceptation), entourage, tensions, questions_recurrentes, questions_reseaux, sequencage, dix_questions, zone_grise, sources, footer.

Chaque section porte un `section_id` stable pour l'édition MCP (`update_section`). Le rendu doit tolérer l'absence de n'importe quelle section optionnelle.

## Les deux modes

### Mode PRÉPA (fond blanc)
Colonne de lecture max-width 860px, padding 20px. Ordre des sections : entête, checklist, enjeu, 3 liens utiles, 30 secondes (panneau noir inversé), chiffres vérifiés (grille KPI), graphique CA 10 ans, rentabilité, timeline entreprise, parcours, playbook, entourage, tensions, questions récurrentes, questions réseaux, séquençage, les 10 questions, zone grise (panneau crème #EFE9DC bordé noir), sources, footer post-rec.

Chaque section commence par une règle épaisse `border-top: 2px solid #000` + titre Tungsten Condensed Bold 40px UPPERCASE. Les listes utilisent des hairlines `1px solid #D9D9D4` entre items.

### Mode LIVE (fond noir #000, texte blanc)
Optimisé enregistrement : lisible à distance, zéro friction, une main.
- **Nav de blocs sticky** sous le header : un chip par bloc de séquençage (timing mono 10px + titre court Tungsten 20px), scroll horizontal sur mobile, tap = scroll vers le bloc. Le bloc courant (selon le chrono) est inversé (fond blanc, texte noir) et son timing passe en jaune #F4C435.
- **Écran pré-rec** (tant que le rec n'est pas lancé) : checklist cochable + bouton pleine largeur rouge #E63946 "DÉMARRER LE REC »" (Tungsten 30px).
- **Blocs de questions** : les 10 questions réparties dans leurs blocs de séquençage. Carte bordée blanc 1px, numéro Tungsten Compressed 40px gris #464641, question 19px semibold, relances en mono 12px gris #8F8F88. **Tap sur la carte = question posée** : opacité 0.45, texte barré, tag mono vert #2FA46A "POSÉE · timecode". Re-tap annule.
- **Rappels contextuels par bloc** : encart bordure gauche jaune #F4C435 2px, fond #171715, label mono jaune (ZONE GRISE / CHIFFRE / TENSION N / QUESTION RÉSEAUX) + texte.
- **Chiffres à portée de main** : grille KPI compacte en fin de page.
- **Barre d'actions fixe en bas** (64px, 3 boutons Tungsten 26px) :
  - **CLIP** (fond rouge #E63946) : marque un moment fort avec le timecode courant, ouvre le carnet.
  - **CARNET** : drawer blanc (max 680px, max-height 55vh) listant clips et notes horodatés + input "note rapide" (entrée pour valider).
  - **RÉGIE** : drawer de chat avec les autres connectés (Clémence), présence en ligne (point vert #2FA46A), messages de Matthieu alignés à droite (fond noir), des autres à gauche (fond #ECECE8). En production : temps réel (websocket) entre les personnes connectées à la fiche.

### Header sticky (les deux modes)
Bande noire 52px : nom invité (Tungsten Condensed Bold 26px, blanc) + "GDIY #NNN" mono 11px gris à gauche ; chrono REC (point rouge pulsant + mm:ss mono) quand le rec tourne ; toggle PRÉPA / LIVE à droite (onglet actif inversé blanc/noir).

## Interactions & Behavior
- Toggle PRÉPA/LIVE : bascule instantanée, persistée.
- Checklist : vraies checkbox, item barré + grisé quand coché, état persistant par appareil (localStorage dans le proto ; en prod, par utilisateur).
- Chrono : démarre au tap "Démarrer le rec", tick 1s, format mm:ss puis hh:mm:ss. Le timestamp de départ est persisté (survit au refresh).
- Bloc courant : calculé depuis le chrono et les bornes des blocs (0, 20, 50, 75, 100, 125 min).
- Questions posées : toggle au tap, timecode enregistré au moment du tap.
- Clips et notes : horodatés au timecode du rec (ou à l'heure si rec non démarré).
- Drawers carnet/régie mutuellement exclusifs.
- Scroll vers bloc : offset de 110px pour compenser header + nav sticky.
- Animations : quasi aucune, brand éditorial. Seul le point REC pulse (opacity 1 → 0.25, 1.6s ease-in-out infinite).

## State Management
- `mode` : 'prepa' | 'live'
- `checked` : map index → bool (checklist)
- `asked`, `askedAt` : map numéro de question → bool / timecode
- `recStart` : timestamp de départ du rec (null si non démarré)
- `carnet` : liste { tag: 'CLIP' | 'NOTE', time, text }
- `chat` : liste { who, time, text } — en prod, temps réel partagé
- `carnetOpen`, `chatOpen`, `noteDraft`, `chatDraft`
- Persistance : tout sauf drafts et drawers (proto : localStorage clé `gdiy-fiche-{slug}` ; prod : par user + fiche côté serveur).

## Design Tokens (système GDIY)
Couleurs :
- Noir #000000, encre #0A0A0A, papier #FFFFFF
- Crème #EFE9DC (zone grise), bone #F6F4EF
- Neutres : #F7F7F5, #ECECE8, #D9D9D4, #BFBFB9, #8F8F88, #6B6B65, #464641, #2B2B27, #171715
- Accents : rouge REC/CLIP #E63946, jaune highlight #F4C435, vert succès #2FA46A
- Hairlines : #000 sur blanc, #FFF ou #2B2B27 sur noir ; jamais de gris moyen en bordure éditoriale

Typographie :
- Display : Tungsten Condensed (titres, 600/700), Tungsten Compressed Bold (héros, gros numéros). TOUJOURS UPPERCASE, line-height 0.85–0.95.
- Corps : Helvetica Neue / system neo-grotesk, 14–20px, line-height 1.35–1.55.
- Mono : ui-monospace (SFMono/Menlo) pour labels, timings, numéros, sources, métadonnées. Letter-spacing 0.08–0.16em sur les labels.

Radii : 0 partout (sauf points de statut ronds). Ombres : aucune. Grilles KPI : gap 1px sur fond noir (effet tableau hairline).

Échelles clés : nom invité clamp(88px, 16vw, 180px) ; titres de section 40px ; titres de bloc live 38px ; question live 19px ; KPI 52px (prépa) / 40px (live).

## Graphiques (chiffres visuels)
Pas de librairie de charts : barres en div, style éditorial noir et blanc.
- **Barres verticales** (CA 10 ans) : hauteur proportionnelle, valeur mono 11px au-dessus, année mono 10px en dessous, baseline 2px noir. Barre de l'année courante en noir, les autres en #8F8F88.
- **Barres horizontales** (croissance comparée, rentabilité) : piste #ECECE8 22–26px, remplissage noir (héros) ou #BFBFB9 (concurrents), label Tungsten 20px à gauche, valeur mono à droite.
- **Timeline verticale** (bascules de l'entreprise) : année Tungsten Compressed 34px à droite d'une colonne, carré 11px (plein noir = bascule majeure, blanc bordé = jalon) + trait vertical 1px, titre Tungsten 22px + texte 14px.
- Chaque graphique porte sa source datée en mono 11px. Les données varient selon le type d'invité (CA/concurrents pour un entrepreneur ; albums/palmarès pour un artiste/sportif — mêmes composants, autres données).

## Assets
- Polices Tungsten (woff2) : TungstenCondensed-Semibold, TungstenCondensed-Bold, TungstenCompressed-Bold — fournies dans `fonts/`. Fallback 'Arial Narrow'.
- Logo wordmark : `assets/logo-letters-black.png`.
- Aucune icône : le texte, les chevrons » et les hairlines font le travail.

## Files
- `Fiche GDIY - Xavier Niel.dc.html` — le prototype complet (modes PRÉPA + LIVE, interactions, données d'exemple)
- `brief.md` — le brief produit complet (pipeline, MCP, workflow, critères d'acceptation)
- `fonts/` — Tungsten woff2
- `assets/` — logo

## Critères d'acceptation (rappel du brief)
- Une fiche sans section playbook est un échec.
- Aucun chiffre sans source hors zone grise.
- Lecture confortable sur mobile en 5 minutes, travail en profondeur sur desktop.
- Toute section éditable individuellement via MCP sans casser le rendu.
- La checklist conserve son état entre deux ouvertures.
- Sections non applicables au profil de l'invité : absentes, jamais vides.
