# Sessions restantes (run autonome v1.1) — plan d'exécution

> Établi pendant l'absence de Matt. Le socle S1a→S2 est livré et poussé
> (branche + main). Les sessions ci-dessous restent à faire ; elles sont ici
> parce qu'elles dépendent d'une MIGRATION que je ne peux pas appliquer sans
> Matt (base non accessible), et/ou d'un de ses 5 gestes. Le code qui n'a pas
> de dépendance de schéma a déjà été poussé. Je ne pousse PAS sur `main` un code
> qui casserait au runtime faute de sa migration (auto-deploy encore actif).

## Fait et poussé (voir rapport)
S1a (chaîne deploy.yml) · S1b (vue explicite + gen:view + golden + smoke) ·
S1bis (mode démo retiré) · S2 (scopes read/write/admin fail-open, audit
non nul, Calendar derrière GOOGLE_DELEGATION_READY, undo archivage board).

## S4 — Miroir Folk — CODÉ (dormant jusqu'à migration 0029)
- Vérification faite : l'API Folk n'expose PAS de recherche serveur
  (`fetchFolkPeople` pagine tout le carnet, aucun paramètre query). Miroir justifié.
- Livré : migration 0029 (`folk_people` + pg_trgm + index gin), refresh dans le
  cron (`refreshFolkMirror`), `resolveContact` interroge le miroir en priorité
  (match exact indexé sur nom_normalise, puis contains), repli sur le fetch live
  si le miroir est absent/vide/sans match. Zéro régression avant peuplement.
- Acceptation accents (« Edouard » ↔ « Édouard ») couverte au niveau normName
  (test resolve.test.ts). Le « < 500 ms » se vérifiera en prod une fois 0029
  appliquée et le cron passé une fois.

## S5 — Copilote sur la carte « Aujourd'hui » + bouton reporter
- La page /[show]/aujourdhui et DailyActionCard existent (brouillon par gabarit,
  copier, logger). Restent : brouillon rédigé par le copilote (appel API, pas de
  migration) et bouton « reporter » (snooze) qui SORT la cible du jour.
- Le snooze a besoin d'un champ persistant (`snoozed_until` sur cibles) →
  migration. Report pour la même raison que S4.

## S7 — Feedback du score
- Déjà en place : champ `resultat` sur touches (migration 0024, appliquée) +
  show_stats étendu (feedback_touches).
- Reste : poids du score modifiables sans deploy. Le brief le range en
  SEPTEMBRE (« Tuning : septembre, sur chiffres ») → non urgent, à faire quand
  on aura les chiffres. Mécanisme = table `score_config` lue par
  computeCibleScore (plumbing serveur + board).

## S9 + S10 — Production (invitation enrichie, VCF, mails de prep, /fiche/[episode])
- Gros chantier, DERRIÈRE le flag GOOGLE_DELEGATION_READY (comme S2 Calendar).
- Dépend de la délégation Workspace (geste P4) ET de migrations (tables episodes
  enrichies, stockage HTML de fiche). Gabarit déjà déposé
  (docs/gabarits/fiche-gdiy-onesta_1.html + GABARIT-FICHE.md).
- À coder en une session dédiée : validate_cible enrichi (participants, corps
  complet, compte de service), génération VCF, mails Gmail (EPISODE_SENDER),
  route /fiche/[episode] (lien signé), génération HTML depuis le gabarit + le
  dossier enrichi, section sans matière affichée comme manquante.
- Report : volume + dépendance P4 + migrations non applicables sans Matt.

## Pourquoi ne pas tout pousser dormant maintenant
Écrire du code dépendant d'un schéma non appliqué, sans pouvoir l'exécuter
contre la vraie base, revient à livrer non vérifié. Le risque (casse au moment
où la migration atterrit, auto-deploy actif) dépasse le gain. Ces sessions
seront faites proprement dès que Matt aura posé P1/P2 (chaîne CI qui applique
les migrations et vérifie avant deploy) : le modèle « migration puis deploy,
jamais l'inverse » est précisément fait pour ça.
