# Handoff : Fiches de préparation GDIY sur Magellan

## Overview
Fiche de préparation d'épisode pour Génération Do It Yourself, à intégrer dans Magellan. Une fiche par invité, à URL stable, en **une seule vue fusionnée** : la même page sert à la lecture découverte (desktop) et à l'usage pendant l'enregistrement (mobile, une main). Ce handoff accompagne le brief produit complet (`brief.md`) : le brief définit le pipeline, le MCP et le workflow ; ce document définit le design et les comportements UI.

## About the Design Files
`Fiche GDIY - Xavier Niel.dc.html` est une **référence de design en HTML** : un prototype montrant l'apparence et le comportement voulus, pas du code de production. La tâche est de **recréer ce design dans le stack de Magellan** avec ses patterns établis. Le contenu Xavier Niel est un exemple réaliste ; en production, le contenu vient du pipeline de génération décrit dans le brief, stocké en sections structurées (JSON/MDX), le HTML n'étant que la couche de rendu.

## Fidelity
**High-fidelity.** Couleurs, typographie, espacements et interactions sont finaux. Recréer au pixel avec les composants du codebase.

## Structure de la page (ordre exact)
Une seule vue, colonne max-width 860px, padding 20px, mobile-first.

1. **Header sticky** (52px, noir) : nom invité Tungsten Condensed Bold 26px + "GDIY #NNN" mono ; à droite, bouton REC rouge #E63946 tant que le rec n'est pas lancé, puis chrono (point rouge pulsant + timecode mono).
2. **Nav de blocs sticky** (sous le header, fond noir) : un chip par bloc du déroulé (timing mono 10px + titre court Tungsten 19px), scroll horizontal mobile, tap = scroll vers le bloc (offset 108px). Bloc courant selon le chrono : chip inversé blanc/noir.
3. **Entête** : métadonnées mono, nom géant Tungsten Compressed clamp(88px, 16vw, 180px), sous-titre 20px, pilules logistiques + lien LinkedIn.
4. **Checklist pré-rec** : checkbox 20px, item barré + grisé quand coché, compteur n / total, état persistant.
5. **L'invité (présentation)** : bio en prose 17px + parcours daté (année mono bold 13px + texte 15px, hairlines #ECECE8).
6. **Son activité** : section adaptative au profil (voir plus bas). Pour un entrepreneur : grille KPI sourcés (Tungsten Compressed 52px, gap 1px sur fond noir), graphique CA 10 ans (barres verticales div, année courante noire, autres #8F8F88, valeurs mono au-dessus, baseline 2px), croissance comparée vs concurrents (barres horizontales, héros noir, concurrents #BFBFB9, piste #ECECE8), marge (barres horizontales noires), timeline des bascules (année Tungsten Compressed 34px, carré 11px plein = bascule majeure, trait vertical 1px).
7. **L'enjeu** : 5 lignes max.
8. **3 liens utiles**.
9. **30 secondes avant d'entrer** : panneau noir inversé, 4 colonnes.
10. **Playbook à extraire** (obligatoire) : numéro Tungsten Compressed 44px #BFBFB9, titre Tungsten 26px, Connu / Manque / question bordure gauche noire.
11. **Entourage** : cartes bordées 1px noir.
12. **Tensions** : cartes A vs B + angle.
13. **Déjà répondu partout** ; **Questions de la communauté**.
14. **Zone grise** : panneau crème #EFE9DC bordé noir.
15. **Sources** : liens datés avec apport.
16. **Le déroulé, 2h30 (OPTIONNEL, en fin de fiche)** : proposition de séquençage. Six blocs (titre de bloc = ancre de la nav sticky), chaque bloc contient ses questions parmi les 10 (carte bordée noir, tap = posée : opacité 0.45, texte barré, tag vert #2FA46A "POSÉE · timecode", re-tap annule), rappels contextuels (bordure gauche jaune #F4C435 3px, fond #F6F4EF, label mono). Compteur "n / 10 POSÉES".
17. **Footer post-rec** mono.
18. **Barre d'actions fixe en bas** (64px, 3 boutons Tungsten 26px) : **CLIP** (rouge, marque un moment fort au timecode, ouvre le carnet), **CARNET** (drawer blanc : clips + notes horodatés, input note rapide), **RÉGIE** (drawer chat temps réel entre connectés à la fiche, présence point vert, mes messages à droite fond noir). Drawers mutuellement exclusifs, max 680px, max-height 55vh.

## Sections adaptatives par type d'invité
Le template est un ensemble de sections optionnelles. La génération n'inclut que les sections pertinentes, **jamais de section vide**.
- **Entrepreneur / investisseur** : "Son activité" = chiffres d'entreprise, CA vs concurrents 10 ans, rentabilité, timeline entreprise.
- **Artiste** : sorties d'albums / œuvres datées, chiffres carrière (ventes, streams, salles), timeline des dates clés.
- **Sportif** : palmarès, records, timeline des saisons charnières.
- Les composants visuels (KPI, barres, timeline) sont réutilisés avec d'autres données.
- Le déroulé est optionnel et vit toujours en fin de fiche.

## Éditabilité (exigence forte)
**Tous les blocs texte sont éditables individuellement** (via MCP `update_section` et, idéalement, édition inline dans Magellan) : bio, enjeu, playbook, tensions, questions, relances, notes de bloc, zone grise. Les blocs data (KPI, graphiques, timeline) sont éditables via leurs données structurées, pas en texte libre. Chaque section porte un `section_id` stable ; le rendu tolère l'absence de toute section optionnelle.

## Interactions & état
- Chrono : démarre au tap REC, tick 1s, mm:ss puis hh:mm:ss ; timestamp de départ persisté (survit au refresh).
- Bloc courant : calculé depuis le chrono et les bornes (0, 20, 50, 75, 100, 125 min).
- Questions posées : toggle au tap, timecode enregistré.
- Clips et notes : horodatés au timecode du rec (ou heure si non démarré).
- Persistance proto : localStorage clé `gdiy-fiche-{slug}` (checked, asked, askedAt, recStart, carnet, chat). Prod : par user + fiche côté serveur ; chat en temps réel (websocket ou service existant du repo).
- Animations : quasi aucune (brand éditorial). Seul le point REC pulse (opacity 1 → 0.25, 1.6s infinite).

## Design tokens (système GDIY)
Couleurs : noir #000000, encre #0A0A0A, papier #FFFFFF ; crème #EFE9DC, bone #F6F4EF ; neutres #F7F7F5 #ECECE8 #D9D9D4 #BFBFB9 #8F8F88 #6B6B65 #464641 #2B2B27 #171715 ; accents rouge REC/CLIP #E63946, jaune #F4C435, vert #2FA46A. Hairlines toujours pur noir sur blanc ou pur blanc/#2B2B27 sur noir.
Typo : Tungsten Condensed (titres 600/700), Tungsten Compressed Bold (héros, numéros), TOUJOURS UPPERCASE, line-height 0.85–0.95 ; corps Helvetica Neue/system 14–20px lh 1.35–1.55 ; mono ui-monospace pour labels, timings, sources, métadonnées (letter-spacing 0.08–0.16em).
Radii : 0 partout. Ombres : aucune sauf drawers (0 8px 24px rgba(0,0,0,0.08)). Pas de librairie de charts : barres en div.
Échelles : nom invité clamp(88px, 16vw, 180px) ; titres de section 40px ; titres de bloc 34px ; question 18px ; KPI 52px. Hit targets ≥ 44px.

## Assets
- `fonts/` : TungstenCondensed-Semibold, TungstenCondensed-Bold, TungstenCompressed-Bold (woff2), fallback Arial Narrow.
- `assets/logo-letters-black.png` : wordmark.
- Aucune icône : texte, chevrons » et hairlines.

## Files
- `Fiche GDIY - Xavier Niel.dc.html` — prototype complet (vue fusionnée, interactions, données d'exemple)
- `brief.md` — brief produit complet (pipeline, MCP, workflow, critères d'acceptation)
- `fonts/`, `assets/`

## Critères d'acceptation (rappel)
- Fiche sans playbook = échec.
- Aucun chiffre sans source hors zone grise.
- Chiffres et graphiques visibles et lisibles pendant le live (mobile).
- Tout bloc texte éditable individuellement via MCP sans casser le rendu.
- Checklist et questions posées conservent leur état entre deux ouvertures.
- Sections non applicables au profil : absentes, jamais vides.
