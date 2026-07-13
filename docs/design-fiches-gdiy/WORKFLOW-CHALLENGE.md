# Fiches GDIY : construire et challenger via MCP

Mode d'emploi pour Matthieu et Clémence, depuis Claude (connecteur Magellan).

## La page

- Index : `/fiches` (liste, statut, date, version).
- Fiche : `/fiches/{slug}` (ex. `/fiches/raphael-chiche`). Derrière le login Magellan, jamais indexée.
- Deux modes en haut à droite : PRÉPA (blanc, travail en profondeur) et LIVE (noir, enregistrement).
- En LIVE : la checklist ENTIÈRE doit être cochée pour lancer le REC. Questions rayées au tap avec timecode. CLIP marque un moment fort. Les moments forts sont livrés en fin de page LIVE (clips, notes, échanges régie).
- L'état (checklist, questions posées, chrono, carnet) est conservé par appareil.

## Créer une fiche

> « Crée la fiche de Raphaël Chiche sur GDIY »

`create_fiche(show, cible)` : crée le squelette (21 sections vides) et renvoie l'URL. Une seule fiche par cible, l'appel est réutilisable sans risque.

## Construire

Chaque section s'édite indépendamment. La boucle type :

1. `get_section(fiche, section_id)` : renvoie le contenu actuel ET le champ `contrat`, l'exemple JSON exact que la section attend.
2. `update_section(fiche, section_id, content)` : remplace le contenu. Chaque écriture archive la version précédente (rollback possible) et incrémente la version.

Sections (`section_id`) : sticky_header, entete, checklist_prerec, enjeu, sources_rapides, trente_secondes, presentation, chiffres, parcours, entreprise, playbook, entourage, anecdotes, tensions, questions_recurrentes, questions_reseaux (questions clips), sequencage, dix_questions, zone_grise, sources, footer.

Règles de contenu :
- Une section vide n'apparaît pas sur la page. Aucune obligation de tout remplir.
- Aucun chiffre sans source hors zone grise.
- Questions : courtes, tutoiement, sans point final, majorité en « comment ».
- Anecdote bien cachée : `cachee: true`, mise en avant au rendu.

## Challenger (Matt + Clem)

En conversation avec Claude, connecteur Magellan branché :

> « Durcis la question 4 » → Claude lit `dix_questions`, réécrit, `update_section`.
> « La tension 2 est faible, trouve mieux » → pareil sur `tensions`.
> « Ajoute ce que m'a dit son associé » → `add_note(fiche, text, source)` : la matière brute reste attachée à la fiche, signalée « à intégrer ».
> « Note pour Clem : vérifier le chiffre de levée » → `add_comment(fiche, section_id, text)`.

- `get_fiche(fiche)` montre tout : sections, commentaires ouverts, notes à intégrer.
- `resolve_comment(comment_id)` clôt un point traité.
- `suggest_questions_reseaux(fiche, apply=true)` : Vadim propose les questions clips (argent, échec, contre-pied, confession), l'équipe les challenge ensuite comme le reste.

## Statuts

`set_status(fiche, statut)` : draft → en_challenge → finale → verrouillee.
Verrouillée (à J-1) : plus aucune édition (hors checklist sur la page). Déverrouiller en repassant en_challenge. Un verrouillage avec des commentaires ouverts est signalé.

## Ce qui reste local à l'appareil (v1)

Checklist cochée, questions rayées, chrono, carnet (clips/notes), messages régie : localStorage du téléphone ou de l'ordinateur. Le chat régie entre appareils (temps réel Matt ↔ Clem) est l'étape suivante.
