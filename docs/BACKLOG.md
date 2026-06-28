# Magellan — Backlog (tâches en suspens)

> Suivi des chantiers à reprendre. Mis à jour le 2026-06-26.
> Le code vit dans une app **Next.js 14 (App Router) + TypeScript**, base **Supabase/Postgres**,
> serveur MCP via `mcp-handler` + `@modelcontextprotocol/sdk` (route `src/app/api/[transport]/route.ts`),
> pont Folk en TS (`src/lib/folk/*`). Déploiement Vercel depuis la branche
> `claude/magellan-collision-studio-xsi8k6` (= prod ; pas de `main`).

---

## ✅ Déjà livré (session du 26/06)

- **Connecteur MCP** : login OAuth fiabilisé (`next` via cookie), résolution des shows par slug (`gdiy`), outil `update_cible` (rôle/orga/secteur/priorité/voie/archétype/sujets…).
- **Fiches** : coordonnées (mail/tél cliquables) + dernière touche en tête de fiche.
- **Folk** : lien `folk_id` sur les cibles (migration 0009) + backfill à l'import + push des touches Magellan → interactions Folk (l'API Folk est write-only pour les interactions, donc pas de lecture possible).
- **Validation / calendrier** : mini-calendrier, lien claude.ai pré-rempli (brief invité), réservation Studio 71 (-1h/+1h), annuler/reprogrammer (sync Google Calendar, migration 0010), gabarit d'invitation GDIY (objet + corps FR/EN, équipe par défaut, date mardi/jeudi 9h30, studio conditionnel au lieu).

- **Lot 1** (annotations MCP : readOnly/destructive/idempotent/openWorld par outil).
- **Lot 2** (watchlist : tables + seed CAC40… + MCP create/update/list + chips ; migration 0011).
- **Lot 3** (filtres : `list_cibles` secteur/pays/envergure/sujet + **barre de filtres board** watchlist/voie/recherche). **Décision** : la watchlist est une **facette de filtre**, pas une colonne.
- **Multi-sélection board** : cases à cocher + actions de masse (Archiver/Désarchiver, Supprimer, Tagger une watchlist) ; **archivage** (cibles.archive, migration 0013) → sortir une fiche du board sans la détruire. Correctif : le board réel est `BoardDnd` (Board.tsx était mort, supprimé).
- **Lot 4** (appui : `nature` + `est_relais`, alias `type` déprécié, voie chaude si relais ; migration 0012).
- **Lot 5** (coordonnées portées par l'appui : contacts.appui_id, add_appui inline tel/email, affichées sur la fiche ; migration 0014).

- **Lot 8** (synchro Google Contacts) — **code livré** : compte de service (JWT jose, impersonation), upsert People API (champs gérés + etag), groupes par show/watchlist/relais ; outil MCP `sync_google_contacts`. **Reste la config** : créer le compte de service, activer People API, clé JSON → `GOOGLE_SA_KEY`, délégation domaine côté Workspace (scope `auth/contacts`), `GOOGLE_IMPERSONATE_EMAIL`. À vérifier en réel une fois branché.

Migrations : appliquées **0009-0013** ; **à appliquer : 0014 (Lot 5), 0015 (Lot 8)**.

### Reste du brief
- **Lot 6** (enrichissement sourcé — étendre l'existant `enrichment/engine.ts`) — P2.
- **Lot 7** (exposer la pose du stage dans `update_cible` avec garde-fous) — P2.

### Roadmap « Fiche v2 / Board v2 / Enrichissement » (demandé 26/06) — ✅ livré
- **Fiche v2** ✅ : édition inline du nom (+ rôle/orga/secteur), coordonnées cliquables (mailto/tel/site), éditeur de tags, liens alliés. *(prénom/nom séparés : non fait — décision schéma en attente.)*
- **Board v2** ✅ : sélecteur **« grouper par »** (archétype/étape/voie/watchlist/secteur) + **priorité manuelle 1-5** (tri en tête, badge ★, contrôle menu carte).
- **Enrichissement MCP** ✅ : `enrich_cible` + `enrich_colonne` (recherche web sourcée ; propose, écrit sur `apply`).

### Débrief MCP 26/06 — ✅ les 3 leviers
- find_cible + projection compacte/recherche sur list_cibles ✅
- create/update sensibles au kind + validation lisible + note + date de touche ✅ (migration 0017)
- pont Folk idempotent ✅

### Roadmap « Épisodes / questionnaire / tri » (demandé 26/06)
- **Vue/section Épisodes** ✅ : onglet Épisodes (Programmé/Enregistré/Publié, date+lieu, lien fiche, bouton Réactiver = seconde vie). Enregistrés/publiés masqués du board prospect. (ex. Robert Gentz : enregistré chez Zalando Berlin, ven. 12 juin midi, pas encore released — à logguer sur sa fiche/épisode.)
- **Mini-questionnaire invité** : formulaire envoyé à l'invité pour qu'il renseigne ses infos (surtout coordonnées pour que Matthieu le joigne), demandé idéalement à la sortie de l'épisode. → formulaire public + stockage. Gros morceau.
- **Rationaliser les critères de tri** : modèle de tri/scoring précis mais cadré (priorité 1-5 + résurgence + voie déjà en place ; à formaliser). Inclut un **tag « estival »** (programmation août : épisodes légers ou iconiques / personnalités très connues — ex. Valentin Kretz, Carlos Ghosn, Thibaud InShape, Gad Elmaleh). *(le tag est créable dès maintenant via les actions de masse / l'éditeur de tags.)*

### Reste ouvert
- **Synchro Google Contacts** : code + parallélisation prêts ; **à re-tester** (redeploy + email `matt@stefani.fr`).
- **Refonte UI 2026** (Cockpit) : fondations + carte board faites ; reste header/wordmark, fiche, login, copilote, dispo, veille, import, réglages.
- **Lot 7** (pose du stage via update_cible) — P2.
- **Décision** : prénom/nom séparés (schéma + mapping Google/Folk) ?

Migrations à jour : **0009-0017** appliquées.

---

## 🔎 Audit live MCP 28/06 (claude.ai) — items [CODE] livrés

> Source : `AUDIT_MAGELLAN_LIVE_20260628`. Détail/spéc : `docs/DEBRIEF.md` §7.
> Migration **0018** (recrée la vue `cibles_enrichies` + `nb_relais_actionnables`) — **à appliquer**.

- **[C3]** `list_cibles` exclut les archivées par défaut (`include_archived` pour les ramener) ; `archive` exposé en compact.
- **[C4]** Détection placeholder (`isPlaceholder` dans `domain.ts`) : noms factices (« Un… », « XX… », « Founder/Fondatrice… », « …? », jeton unique) flaggés `placeholder:true`, relégués en bas de liste et **exclus de la synchro Google**.
- **[C1]** **Score composite 0-100** (`computeCibleScore`, spéc DEBRIEF §7) calculé au read-time : `list_cibles` trie par score décroissant (les cibles qui bougent en tête, les `≥confirme` sortent du flux outreach). Expose `score` + `badges` + `score_min`. Vérifié : Tony Parker en tête, Aghion (gagné) en bas, placeholders derniers.
- **[C2]** `sync_google_contacts` : **`dry_run` par défaut TRUE** (simulation ventilée à créer/à MAJ/exclus, aucune écriture) ; gate qualité (exclut archivées + placeholders, ne pousse que les coordonnées **vérifiées** sauf `inclure_non_verifies:true`).
- **[C5]** Cohérence API : `find_cible` accepte `cible` (alias `query`) ; `get_dossier` accepte `cible`+`show` en plus de `cible_id`.

- **Estival** ✅ (décision Matt 28/06) : en saison (auto juin-juillet, ou `saison:"ete"`), le score **remonte** le léger/grand public/iconique (tag `estival`/`ete` +10, sujets sport/culture/cuisine/voyage… +6, badge « estival ☀ ») et **repousse** le dur/tech/corporate à septembre (watchlist cac40/sbf120 −8, sujets finance/tech/ia… −6, badge « à reporter (sept.) »). Le tag manuel `estival` prime (rattrape un iconique « business » type Ghosn). Diffusion visée août → début septembre.

**Reste de l'audit** : [D0-D3] = données (via connecteur/app, pas Claude Code) ; [C6] séparer reporting closing/prod ; [C7] pipeline d'ingestion de signaux.

---

## 🔭 Backlog issu du brief « retour de tests » (Lots 1-8)

> Priorités du brief : P0 = Lots 1-2 · P1 = Lots 3,4,5,8 · P2 = Lots 6,7.
> Contrainte d'ordre : **Lot 5 avant Lot 8** (la synchro a besoin des coordonnées d'appui).

### Lot 1 — Autorisation MCP par appel (P0)
Supprimer le « No approval received ». Déclarer les **hints MCP** par outil
(`readOnlyHint` sur `list_shows`/`list_cibles`/`get_dossier` ; `destructiveHint:false`
+ `idempotentHint` sur les écritures). Permet l'auto-autorisation des lectures côté client.
- **Note code** : nos `server.tool(...)` ne posent aucune annotation aujourd'hui → à vérifier que le SDK 1.26 expose bien les annotations dans la signature d'enregistrement.
- **Nuance** : dans la session, le blocage venait surtout du **bouton « Autoriser » non tapé** (l'écriture passe une fois approuvée). Les hints restent le bon correctif serveur + régler le connecteur en auto-autorisation côté Claude.

### Lot 2 — Dimension « watchlist » (P0) — cas CAC40
Facette de segmentation indépendante des sujets, filtrable et **affichable en colonne de board**.
- Tables `watchlist` (key/label/color) + `cible_watchlist` (jointure). Seed : `cac40`, `sbf120`, `licorne`, `ancien_invite_a_recycler`.
- `create_cible`/`update_cible` acceptent `watchlist: string[]` (clés/libellés, **création implicite refusée** → clé inconnue = erreur). `list_cibles` filtre par watchlist.
- Board : mode colonnes par watchlist.
- **Note code** : `sujets text[]` existe mais n'est pas filtrable ; le board groupe par archétype (invités) ou par stage (thématique) — voir `src/components/Board.tsx`.

### Lot 3 — Filtres `list_cibles` + `group_by` (P1)
Ajouter filtres `secteur`, `pays`, `envergure`, `sujets` (contains), `watchlist`.
Ajouter `group_by ∈ {stage, archetype, voie, watchlist, secteur, pays}` qui pilote les colonnes du board.
- **Note code** : `list_cibles` filtre aujourd'hui `voie`, `archetype`, `stage_key`, `kind` (sur la vue `cibles_enrichies`).

### Lot 4 — Appui : séparer nature et fonction (P1)
Distinguer la **nature** (ancien_invite, conseiller…) de la **fonction d'approche** (relais/prescripteur/lien).
- `appuis.type` → renommer en `nature` ; ajouter `role_approche text` (ou `est_relais boolean`).
- `add_appui` accepte `nature` + `role_approche`/`est_relais` ; garder `type` en **alias déprécié** une version.
- **Note code** : enum actuel `appuis.type` = ancien_invite | conseiller | entourage | contact_interne (`src/lib/domain.ts`).

### Lot 5 — Coordonnées portées par l'appui (P1) — *prérequis Lot 8*
Le relais est joint en premier → ses coordonnées doivent être structurées (pas en note libre).
- Option retenue : `contact` polymorphe (`owner_type ∈ {cible, appui}`, `owner_id`) ; ou `add_appui_contact` ; coordonnées en ligne dans `add_appui`.
- **Note code** : table `contacts` aujourd'hui liée à `cible_id` uniquement.

### Lot 6 — Enrichissement sourcé automatique (P2, fort levier)
Action copilote `enrichir_cible` : recherche web → proposition de role/organisation/secteur/pays/raison/sujets **avec sources**, en **validation humaine** ; `etat_recherche ∈ {a_enrichir, propose, valide}`.
- **Note code** : un moteur d'enrichissement **existe déjà** (`src/lib/enrichment/engine.ts`, action `enrichCibleAction`, bouton « Enrichir » sur la fiche) + `etat_recherche` est déjà un champ. → **Étendre**, ne pas refaire. Manque : sources persistées + champs role/org/secteur proposés (et pas seulement contacts).

### Lot 7 — Asymétrie `stage_key` (P2)
`list_cibles` filtre `stage_key` mais `create/update_cible` ne le posent pas.
- **Note code (tranché)** : les stages sont **stockés** (`cibles.stage_id` → table `stages`, exposé via la vue). Donc **exposer la pose du stage dans `update_cible`** avec validation des transitions. (L'app a déjà `moveCibleStage`.)

### Lot 8 — Synchro Magellan → Google Contacts (P1, priorité explicite)
Unidirectionnelle, Magellan = source de vérité. Cibles + relais (Lot 5) deviennent des contacts Google à jour, groupés (« GDIY Pipeline », « CAC40 »).
- **Auth (décide le zéro-touch)** : si `collision.studio` est sur **Google Workspace** → **compte de service + délégation domaine** (zéro reconnexion). Sinon app OAuth Internal (1 consentement) ; éviter External Testing (refresh 7 j). Scope `auth/contacts` (sensible).
- Lien stable : stocker `google_resource_name` + `google_etag` sur cible et appui. `updateContact` (updatePersonFields limité aux champs gérés) sinon `createContact`. Batch ≤200, backoff 429.
- Suppression conservatrice (retrait de groupe, pas de hard delete).
- **Note code** : réutiliser le **pattern du pont Folk** (`src/lib/folk/{client,write}.ts` : fetch best-effort + file) plutôt que dupliquer. Le calendrier utilise un **token utilisateur** (Supabase `provider_token`, calendar scope) qui **expire** → pour le zéro-touch contacts, viser le compte de service.

### Règle transverse — voie chaude par défaut
Si une cible a un appui `est_relais = true` → proposer **voie chaud** par défaut (modifiable). Dépend du Lot 4.

### Questions à trancher (réponses connues du code)
1. **Langage serveur MCP** → **TypeScript** (Next route + mcp-handler + SDK 1.26). ✔
2. **Stages dérivés ou stockés** → **stockés** (`stage_id`). ✔ → Lot 7 = exposer l'écriture.
3. **Compte Google Workspace ?** → à confirmer par Matt (probable pour `collision.studio`). Détermine l'archi du Lot 8.
4. **Pont Folk réutilisable ?** → **oui**, l'étendre (`src/lib/folk/*`). ✔

### Fixtures d'acceptation (à seeder quand utile)
- **Ariane Zagury** — GDIY, Rue Madame Fashion Group, fondatrice/PDG, mode/retail Asie, Hong Kong, international, voie chaude, pépite. Appui **Karine Schrenzel** (nature ancien_invite, est_relais true).
- **Antonio Filosa** — GDIY, Stellantis, CEO, automobile, international, voie chaude, big fish, watchlist CAC40. Appui **Daniele Milani** (contact_interne, est_relais true, tél +39 349 466 8771, LinkedIn antoniofilosa).

---

## 🧩 Tâches issues de la session (validation / Folk)

- [ ] **Test du pont Folk** (touche → interaction) sur une cible présente dans Folk (ex. Patrick Pouyanné). En attente.
- [ ] **Invitation envoyée depuis `contact@gdiy.fr`** : impossible via l'invitation Calendar (expéditeur = compte Google connecté). À décider : envoi **email Gmail** avec alias send-as (autre mécanisme).
- [ ] **Validation des coordonnées par l'invité** : la demande est dans le corps du mail ; reste à faire un **formulaire** qui ré-enregistre nom/prénom/email/mobile dans Magellan.
- [ ] **Liste d'équipe gdiy modifiable de façon persistante** (aujourd'hui éditable à chaque validation ; défauts en dur dans `src/lib/invitation.ts`). À déplacer dans la future page d'admin.
- [ ] **Reschedule sans événement préexistant** : si validé sans date puis reporté, on ne (re)crée pas les events — à compléter si besoin.

---

## 🏛️ Gros chantiers à cadrer

- **Page d'administration Magellan + rôles** : super admin (Matt), admin (Clémence), users (Mateo, Axel, Clément, Manon). Implique gestion des accès, permissions, **RLS par rôle** côté Supabase, et une UI d'admin (équipe, watchlists, gabarits d'invitation, connexions Google/Folk).
- **Refonte UI/UX complète** par Claude Design (voir `docs/CDC-fonctionnel-UX.md`). Tokens d'identité à figer depuis le Figma (id `ZI56QbnEsPRDjL5JXJ7oEz`).
