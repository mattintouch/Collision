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
non nul, Calendar derrière GOOGLE_DELEGATION_READY, undo archivage board) ·
S4 (miroir Folk) · S5 (brouillon copilote + reporter) ·
LOT H (hygiène API MCP : registerTool + schémas stricts = rejet des paramètres
inconnus ; create_cible atomique stage+contacts[]+premiere_touche ; erreurs
structurées cause+action sur resolve_contact et sync Google ; descriptions
densifiées ; annotations explicites. Sans migration).

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

## S5 — Copilote sur la carte « Aujourd'hui » + bouton reporter — FAIT
- Brouillon rédigé par le copilote : livré (composeDraft + action draftOpening +
  bouton sur la carte, repli gabarit). Sans migration.
- Bouton « Reporter » (snooze 3 j) : livré via table dédiée `cible_snooze`
  (migration 0030), exclusion dans la page « Aujourd'hui » ET dans daily_five
  (MCP). Défensif : sans la table, rien n'est masqué (dormant, zéro régression).

## S7 — Feedback du score
- Déjà en place : champ `resultat` sur touches (migration 0024, appliquée) +
  show_stats étendu (feedback_touches).
- Reste : poids du score modifiables sans deploy. Le brief le range en
  SEPTEMBRE (« Tuning : septembre, sur chiffres ») → non urgent, à faire quand
  on aura les chiffres. Mécanisme = table `score_config` lue par
  computeCibleScore (plumbing serveur + board).

## S9 + S10 — Production — LIVRÉ (dormant jusqu'à migration 0031 + P4)
- Fondations : générateur de fiche Onesta (fiche/generate + css) + VCF (vcf.ts).
- Fiche : migration 0031 (colonnes fiche sur episodes), route publique
  /fiche/[episode] à lien signé, buildFicheData(dossier), outil generate_fiche.
- Invitation S9 : validate_cible enrichi (corps complet Studio 71 + participants
  systématiques + réservation studio) via compte de service.
- Mails S10 : bridge Gmail (gmail.send SA), gabarits invité + staff, VCF en PJ,
  outil send_prep_email. Section sans matière = « à alimenter ».
- Activation : migration 0031 + P4 (délégation calendar.events + gmail.send) +
  GOOGLE_DELEGATION_READY=true. Env à poser : EPISODE_STAFF_EMAILS (staff
  systématique), NEXT_PUBLIC_APP_URL (base des liens de fiche, sinon relatif).

## Reste (non urgent, hors périmètre immédiat)
- Prose copilote de la fiche (questions réseaux, questions profondes,
  masterclass) : aujourd'hui « à alimenter ». À générer par le copilote depuis
  le dossier. Fine-tuning du prompt après 3-4 fiches réelles (décision brief).
- Figures structurées de l'enrichissement (décision #10) : alimentent la
  section 04 « En chiffres ». À ajouter au ProfileProposal.
- Poids de score configurables (S7) : item septembre.

## Pourquoi ne pas tout pousser dormant maintenant
Écrire du code dépendant d'un schéma non appliqué, sans pouvoir l'exécuter
contre la vraie base, revient à livrer non vérifié. Le risque (casse au moment
où la migration atterrit, auto-deploy actif) dépasse le gain. Ces sessions
seront faites proprement dès que Matt aura posé P1/P2 (chaîne CI qui applique
les migrations et vérifie avant deploy) : le modèle « migration puis deploy,
jamais l'inverse » est précisément fait pour ça.
