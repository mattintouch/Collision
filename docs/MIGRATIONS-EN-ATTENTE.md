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

- `0050_idees_editoriales.sql` : table idees_editoriales, le backlog éditorial
  au niveau cible (chantier du 27/08 : add_idee, list_idees, injection dans
  generate_fiche avec passage en integree, compte dans get_dossier).
  Appliquée par Matt le 29/08. Vérifications du 29/08 : les blocs « IDÉES
  ÉDITORIALES EN BACKLOG » des notes de Yuval Noah Harari (1 angle sourcé)
  et de Gilles Giovannangeli (3 questions + 1 source) migrés vers la table
  via add_idee, notes nettoyées, list_idees confirme les 5 idées en backlog.

- `0051_jobs_initiateur.sql` : colonne initiateur sur enrichment_jobs (brief du
  11/09, alerting). Porte l'email de l'appelant qui a lancé la génération pour
  lui adresser l'alerte d'échec (destinataires : initiateur + Matthieu, plus
  jamais toute l'équipe). Appliquée par Matt le 11/09 via l'éditeur SQL
  Supabase. Effet immédiat sans redéploiement, rejouable sans risque
  (if not exists).

- `0052_console_q_etat.sql` : la contrainte kind de fiche_console_events
  s'élargit de la valeur q_etat (chantier UX 2 du 11/09 : masquage et mise en
  avant des questions, persistés en base par fiche via les événements de
  console, même geste que 0043 pour le dernier-lu). Appliquée par Matt le
  11/09 via l'éditeur SQL Supabase. Recette : fiche
  test-invitation-magellan-ignorer (deux briques de test posées avec les
  consignes dans les réflexions), jamais une fiche de production.

- `0053_validate_cible_idempotent.sql` : la fonction validate_cible réutilise
  l'épisode existant le plus récent au lieu d'en insérer un second (brief du
  12/09, chantier 5 ; doublon nettoyé à la main le 11/09). `create or
  replace`, rejouable, effet immédiat sans redéploiement. Le contexte d'un
  épisode existant n'est pas réécrit. `setup_all.sql` porte la même version.
  L'outil MCP validate_cible est idempotent AVANT même cette migration (il lit
  l'épisode existant et n'appelle plus la RPC en re-validation) : 0053 couvre
  les autres appelants (action validerCible de l'app, copilote). Appliquée par
  Matt le 13/09 via l'éditeur SQL Supabase.

## En attente
- `0055_la_martingale.sql` : La Martingale (brief du 25/09, lot A). Crée le show
  `la-martingale` et son pipe de 13 étapes (jamais cloné de GDIY), la table de
  référence `familles_theme` et ses cinq familles, les champs de cible (og,
  statut_sortie, contexte, date_tournage, date_diffusion, famille_theme_id,
  relances_envoyees), la table `cible_calls`, la table `email_brouillons`, le
  paramètre `mode_envoi` sur les shows, et corrige le trigger d'accueil des
  nouveaux membres (un domaine hors maison arrive en externe SANS show,
  prérequis 1.3). Aucun enum Postgres nouveau, du texte avec CHECK modifiable.
  Rejouable (if not exists, on conflict do nothing). Dormante-safe : sans elle,
  La Martingale n'apparaît nulle part et les trois shows existants ne changent
  pas. À appliquer avant toute simulation d'import.
- `0032_cible_is_test.sql` : flag is_test sur cibles (A6). Dormant (exclusion filtrée côté code, défensif si colonne absente).
- `0033_show_sender_staff.sql` : expéditeur + staff par show (B3/B4/B5).
  CORRECTION DU 25/09 : cette migration est en réalité APPLIQUÉE en base. Les
  colonnes sender_email, sender_name et staff existent et sont lues (le staff
  GDIY y est renseigné). Le registre la disait dormante : même dérive que 0032,
  constatée en établissant les prérequis de La Martingale. Le mécanisme d'envoi
  sous l'identité du show, lui, n'est toujours pas implémenté (voir
  docs/MARTINGALE.md, prérequis 1.2).
- `0054_anti_doublon.sql` : anti-doublon au-delà du nom exact (brief du 21/09).
  Extensions unaccent + pg_trgm + fuzzystrmatch, fonction norm_nom (minuscules,
  accents, particules, parenthèses, tokens triés), table cible_alias (fusion,
  enrichissement), colonne cibles.doublon_suspect, fonctions candidats_doublon
  (création) et paires_doublons (passe rétroactive). Rejouable (if not exists /
  or replace). Dormante-safe : sans elle, le contrôle P1 (nom normalisé exact)
  reste seul, les alias et drapeaux sont best-effort silencieux. La passe
  rétroactive (outil MCP admin audit_doublons) exige cette migration et renvoie
  une erreur claire (cause migration_0054_manquante) tant qu'elle n'est pas
  appliquée.


> Leçon du 17/07 : le registre peut dériver de la base (cas 0021). En cas de
> comportement contredisant le registre, vérifier la contrainte réelle en base
> avant de chercher un bug de code.

> Dès que la chaîne CI est allumée (P1/P2 + baseline), les futures migrations
> s'appliquent automatiquement au merge sur main, avant le déploiement.
