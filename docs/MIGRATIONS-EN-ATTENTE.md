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

## En attente
- `0032_cible_is_test.sql` : flag is_test sur cibles (A6). Dormant (exclusion filtrée côté code, défensif si colonne absente).
- `0033_show_sender_staff.sql` : expéditeur + staff par show (B3/B4/B5). Dormant (repli sur l'env EPISODE_STAFF_EMAILS si non configuré).

> Leçon du 17/07 : le registre peut dériver de la base (cas 0021). En cas de
> comportement contredisant le registre, vérifier la contrainte réelle en base
> avant de chercher un bug de code.

> Dès que la chaîne CI est allumée (P1/P2 + baseline), les futures migrations
> s'appliquent automatiquement au merge sur main, avant le déploiement.
