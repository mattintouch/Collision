# Migrations — état

## Appliquées
0001 → 0031, toutes appliquées.
- 0026 enrichment_jobs · 0027 portier + appuis.folk_id + vue raffinée ·
  0028 vue explicite · 0029 miroir Folk · 0030 cible_snooze ·
  0031 colonnes fiche sur episodes.
- `0034_fiches.sql` : fiches structurées (fiches + sections + versions +
  commentaires + notes, brief GDIY). Appliquée par Matt le 13/07/2026.

## En attente
- `0032_cible_is_test.sql` : flag is_test sur cibles (A6). Dormant (exclusion filtrée côté code, défensif si colonne absente).
- `0033_show_sender_staff.sql` : expéditeur + staff par show (B3/B4/B5). Dormant (repli sur l'env EPISODE_STAFF_EMAILS si non configuré).
- `0035_jobs_objectif_fiche.sql` : élargit la contrainte enrichment_jobs.objectif
  au préfixe fiche: (génération des fiches). BLOQUANT pour generate_fiche
  (erreur « violates check constraint enrichment_jobs_objectif_check » sinon).

> Dès que la chaîne CI est allumée (P1/P2 + baseline), les futures migrations
> s'appliquent automatiquement au merge sur main, avant le déploiement.
