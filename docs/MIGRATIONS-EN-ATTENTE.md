# Migrations — état

## Appliquées
0001 → 0031, toutes appliquées.
- 0026 enrichment_jobs · 0027 portier + appuis.folk_id + vue raffinée ·
  0028 vue explicite · 0029 miroir Folk · 0030 cible_snooze ·
  0031 colonnes fiche sur episodes.
- `0034_fiches.sql` : fiches structurées (fiches + sections + versions +
  commentaires + notes, brief GDIY). Appliquée par Matt le 13/07/2026.
- `0035_jobs_objectif_fiche.sql` : contrainte enrichment_jobs.objectif élargie
  au préfixe fiche:. Appliquée par Matt le 14/07.
- `0036_cibles_contraintes_kind.sql` : ré-assertion des contraintes kind
  (régressions §6.1 et §6.2 du brief arbitrages ; la contrainte de 0001 était
  encore active malgré 0021, dérive base/registre). Appliquée par Matt le 17/07.
- `0037_product_backlog.sql` : table product_backlog (chantier 1).
  Appliquée par Matt le 17/07.
- `0038_gate_alertes_note.sql` : table system_state (disjoncteur API) + colonnes
  note_plateau / note_commentaire / note_at sur fiches (chantier 2).
  Appliquée par Matt le 17/07.
- `0039_telemetrie_cout.sql` : colonnes tokens_in / tokens_out / model sur
  enrichment_jobs + vue couts_generation (chantier 3).
  Appliquée par Matt le 17/07.

- `0040_besoins_editoriaux.sql` : table besoins_editoriaux (chantier 4).
  Appliquée par Matt le 17/07 (avant merge de la PR : sans risque, le code est
  défensif dans les deux sens).

- `0041_console_partagee.sql` : tables fiche_rec_sessions + fiche_console_events
  (console partagée, identité par défauts de colonne, Realtime).
  Appliquée par Matt le 20/07 (avant merge de la PR : sans risque, le code est
  défensif dans les deux sens).

- `0042_recherches_web.sql` : colonne web_searches + vue couts_generation avec
  recherches (tâche 6 du handoff). Appliquée par Matt le 24/07.
- `0043_console_lu.sql` : contrainte kind élargie à 'lu' (dernier-lu par
  opérateur, tâche 8 du handoff). Appliquée par Matt le 24/07.

- Intégration du schéma de référence (GO Matthieu du 28/07), appliquée par
  Matt le 30/07 dans l'ordre : `0044_ref_statuts.sql` (valeurs de Louis),
  `0045_cibles_reference.sql` (10 colonnes cibles + natures d'appui +
  mapping stage vers statut, pose initiale vérifiée : 595 À valider, 37
  Enregistré, 1 NULL attendu hors mapping), `0046_episodes_publication.sql`
  (domaine publication + verrou), `0028_view_explicite.sql` régénérée
  (projections de référence). Reste : spot check de 10 cibles et 5 épisodes
  avec Louis (dispo sous 4 jours), le rebranchement avance en parallèle.

- Chantiers du 25/08 (récap + doublons Harari), appliquées par Matt le 25/08
  dans l'ordre : `0047_clemence_admin.sql` (profil admin de Clémence, son
  connecteur Claude reste à reconnecter pour réémettre son jeton),
  `0048_backlog_type_resume.sql` (typage + résumés du backlog, télémétrie
  recap:*), `0049_fusionner_cibles.sql` (fonction de fusion). Vérifications du
  25/08 : critère P1 bis tenu en production (fusion de deux fiches de test,
  zéro touche perdue, zéro dupliquée, absorbée archivée avec note), copies
  Harari 215ce4f6 et c86b5529 fusionnées dans 1dcf77bb.

## En attente
- `0032_cible_is_test.sql` : flag is_test sur cibles (A6). Dormant (exclusion filtrée côté code, défensif si colonne absente).
- `0033_show_sender_staff.sql` : expéditeur + staff par show (B3/B4/B5). Dormant (repli sur l'env EPISODE_STAFF_EMAILS si non configuré).


> Leçon du 17/07 : le registre peut dériver de la base (cas 0021). En cas de
> comportement contredisant le registre, vérifier la contrainte réelle en base
> avant de chercher un bug de code.

> Dès que la chaîne CI est allumée (P1/P2 + baseline), les futures migrations
> s'appliquent automatiquement au merge sur main, avant le déploiement.
