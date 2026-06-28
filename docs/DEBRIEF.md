# Magellan — Débrief complet & protocole d'audit MCP

> Rédigé le 2026-06-28. Document **autoportant** : conçu pour être partagé tel quel
> à Claude.ai (via le connecteur MCP « Magellan ») afin qu'il **audite l'outil en
> live** puis rende une **analyse priorisée des chantiers**.
>
> Repo : `mattintouch/Collision` · Branche (= prod, pas de `main`) : `claude/magellan-collision-studio-xsi8k6`
> Stack : Next.js 14 (App Router) + TypeScript + Tailwind (PWA) · Supabase/Postgres (RLS) ·
> serveur MCP via `mcp-handler` + `@modelcontextprotocol/sdk` 1.26 (route `src/app/api/[transport]/route.ts`) ·
> ponts Folk + Google (People API) · déploiement Vercel.

---

## 1. Ce qu'est Magellan (en une phrase)

Un **moteur de conquête et de closing d'invités podcast** pour Collision Productions
(shows : **GDIY**, **CCG/Combien Ça Gagne**, **Fleurons**). Pas un CRM, pas un outil
de contenu : un moteur qui **empêche les trous dans la raquette** — relancer la bonne
cible, au bon moment, avec une raison, par la bonne voie (froide/chaude via un relais).

Le cœur logique est le **moteur de résurgence** : signaux + temps écoulé + priorité →
un « pourquoi maintenant » + un conseil (relancer / attendre / passer par un appui),
repris partout (board, dispo, copilote).

---

## 2. Inventaire des outils MCP (surface exposée à Claude.ai)

Route : `src/lib/mcp/tools.ts`. Tous passent par le **client service** Supabase.
Annotations posées par outil (readOnly / destructive / idempotent / openWorld).

| Outil | Type | Rôle |
|---|---|---|
| `list_shows` | lecture | Liste les 3 shows (slug, nom, type de pipe). |
| `list_cibles` | lecture | Cibles d'un show, enrichies. Filtres : `voie, archetype, stage_key, kind, secteur, pays, envergure, sujet, watchlist, q (nom), limit, full`. **Projection compacte par défaut** (anti-pull massif). |
| `find_cible` | lecture | Résout **une** cible par nom/réf et renvoie sa fiche compacte. |
| `get_dossier` | lecture | Dossier complet d'une cible (appuis, touches, signaux, contacts). |
| `create_cible` | écriture | Crée une cible. **Sensible au kind** (personne vs entreprise). |
| `update_cible` | écriture | MAJ champs **kind-aware** + `stage` (pose l'étape) + `note`/`note_priorite`. |
| `add_appui` | écriture | Ajoute un appui (`nature`, `est_relais`, tel/email inline). |
| `add_contact` | écriture | Ajoute une coordonnée à une cible. |
| `log_touche` | écriture | Journalise une touche (+ `date`), **miroir Folk** (interaction). |
| `validate_cible` | écriture | Bascule la cible en **épisode**. |
| `sync_google_contacts` | écriture/openWorld | Synchro show → Google Contacts par lots. `limit`, **`dry_run`**. |
| `enrich_cible` / `enrich_colonne` | écriture/openWorld | Enrichissement web sourcé (propose, écrit si `apply=true`). |

**Conventions de résolution** (utiles pour l'audit) :
- `show` accepte le **slug** (`gdiy`, `ccg`, `fleurons`) — désormais **insensible à la casse** — ou l'id (uuid).
- `cible` accepte un **nom partiel** (match unique requis) ou un id.

---

## 3. Ce qui fonctionne bien (consolidé)

- **Connecteur MCP** stable : OAuth 2.1 + PKCE maison, login fiabilisé (`next` via cookie),
  annotations par outil. La résolution de show par slug ne casse plus (bug `gdiy`/`GDIY` corrigé).
- **Board réel** (`BoardDnd`) : glisser-déposer, **« grouper par »** (archétype/étape/voie/watchlist/secteur),
  barre de filtres (recherche/voie/watchlist/archivés/done), **multi-sélection + actions de masse**
  (archiver, supprimer, tagger/créer une watchlist), **priorité manuelle 1-5** (tri en tête, badge ★).
- **Fiche v2** : édition inline nom/rôle/orga/secteur, coordonnées **cliquables** (mailto/tel/site),
  éditeur de tags, liens alliés (cible↔cible), ajout **manuel** de contacts, import **Google Contacts**, enrichissement.
- **Épisodes** : onglet dédié (Programmé/Enregistré/Publié), les enregistrés/publiés **sortent du board prospect**,
  bouton **Réactiver** (seconde vie d'un ancien invité).
- **Validation → épisode** : mini-calendrier, réservation Studio 71, lien claude.ai pré-rempli,
  annuler/reprogrammer (sync Google Calendar), gabarit d'invitation GDIY (FR/EN).
- **Watchlists** comme **facette de filtre** (décision tranchée : pas une colonne), seed CAC40… + création à la volée.
- **Pont Folk** idempotent (crée la personne si absente avant d'écrire l'interaction).
- **Moteur de résurgence + veille + enrichissement** : la chaîne signaux → « pourquoi maintenant » est en place.

Migrations **0001 → 0017** appliquées (confirmé).

---

## 4. Chantiers fraîchement livrés / en cours de validation

- **Synchro Google Contacts (Lot 8)** — code livré (compte de service JWT `jose`, impersonation,
  upsert People API champs gérés + etag, groupes show/watchlist/relais), **chunké** (lot 150,
  non-synchro d'abord, `restants`) pour tenir dans les 60 s Vercel. **Dernier correctif poussé**
  (commit `1a4ffce`) : remontée de la **vraie erreur** Google (plus de message générique),
  mode **`dry_run`**, slug insensible à la casse, warmup du cache `searchContacts`
  (le « Aucune coordonnée trouvée pour Emmanuel Faber »). → **À re-tester en réel** (redeploy + « retest »).
- **Refonte UI 2026 « Cockpit »** : fondations posées (fonts Space Grotesk/JetBrains Mono, tokens,
  palette froid/chaud, `.card`/`.chip`/`.btn-jaune`) + carte board redessinée (`TargetCard`).
  **Reste** : header/wordmark, fiche, login, copilote, dispo, veille, import, réglages.

---

## 5. Ce qui reste / vision future (par thème)

### A. Fiabilisation (P0/P1)
- **Re-tester la synchro Google** jusqu'à `restants = 0` ; trancher le **dédoublonnage** définitif.
- **Google Calendar durable** : persister/rafraîchir le refresh token (le `provider_token` expire).
- **Envoi depuis `contact@gdiy.fr`** : impossible via l'invitation Calendar (expéditeur = compte connecté).
  → décider d'un envoi **Gmail send-as** (alias).

### B. Acquisition de coordonnées (P1, fort levier)
- **Mini-questionnaire invité** : formulaire **public** envoyé à l'invité (idéalement à la sortie de
  l'épisode) pour qu'il renseigne lui-même ses coordonnées → ré-enregistrées dans Magellan. Gros morceau.
- **Validation des coordonnées par l'invité** (même brique formulaire).

### C. Tri & segmentation (P1/P2)
- **Rationaliser les critères de tri** : formaliser un scoring cadré (priorité 1-5 + résurgence + voie déjà en place).
- **Tag « estival »** (programmation août : épisodes légers/iconiques — Valentin Kretz, Carlos Ghosn,
  Thibaud InShape, Gad Elmaleh). *Créable dès maintenant via l'éditeur de tags.*

### D. Refonte UI complète (P1, transverse)
- Appliquer le design system Cockpit aux écrans restants (cf. §4).

### E. Administration & rôles (gros chantier à cadrer)
- Page d'admin + **RLS par rôle** : super admin (Matt), admin (Clémence), users (Mateo, Axel, Clément, Manon).
- Y déplacer : équipe par défaut des invitations, watchlists, gabarits, connexions Google/Folk.

### F. Décisions de schéma en suspens
- **Prénom/nom séparés** (impacte mapping Google/Folk) — à trancher.

---

## 6. Risques & dettes connues

- **Timeout Vercel 60 s** : toute opération de masse (synchro, enrichissement de colonne) doit
  rester chunkée/bornée. Ne pas réintroduire de pull complet.
- **`cibles_enrichies`** (vue Postgres) **fige `c.*`** : toute nouvelle colonne sur `cibles` exige
  de **recréer la vue** dans la migration. Source d'erreurs silencieuses si oublié.
- **Folk interactions = write-only** (pas de lecture possible) : on ne peut pas afficher la dernière
  interaction Folk ; on s'appuie sur la dernière touche Magellan.
- **`ETAT.md`** est **obsolète** (antérieur à la refonte MCP/route). Ce `DEBRIEF.md` + `BACKLOG.md` font foi.

---

## 7. Protocole d'audit MCP (à faire exécuter par Claude.ai)

> **But** : un audit **non destructif** que Claude.ai lance via le connecteur Magellan, puis
> dont il tire une analyse priorisée. Les étapes 7.1 sont **lecture seule** (sûres). L'étape 7.2
> (écriture) est **optionnelle** et confinée à une cible jetable.

### 7.1 — Sonde lecture seule (sans risque)

Exécuter dans l'ordre et noter les anomalies :

1. `list_shows` → vérifier que les 3 shows reviennent avec slugs `gdiy`, `ccg`, `fleurons`.
2. `list_cibles { show: "GDIY" }` → **doit résoudre** (test de l'insensibilité à la casse) et renvoyer une projection compacte.
3. `list_cibles { show: "gdiy", limit: 5, full: true }` → comparer compact vs complet ; vérifier que `watchlist_keys`, `jours_depuis_touche`, `signal_frais`, `nb_appuis` sont peuplés.
4. `list_cibles { show: "gdiy", watchlist: "cac40" }` → la facette watchlist filtre bien (et renvoie une erreur claire sur clé inconnue, ex. `watchlist: "inexistante"`).
5. `list_cibles { show: "gdiy", voie: "chaud" }` puis `{ archetype: "big_fish" }` → les filtres se combinent.
6. `find_cible { show: "gdiy", cible: "<un nom connu>" }` → résolution unique + fiche compacte.
7. `get_dossier` sur cette cible → cohérence appuis/touches/signaux/contacts vs la fiche web.
8. `sync_google_contacts { show: "gdiy", dry_run: true }` → **compte sans écrire** ; vérifier `restants` plausible et `ok:true`. *(Si la synchro Google n'est pas configurée, l'outil renvoie un diagnostic explicite sur `GOOGLE_SA_KEY`/`GOOGLE_IMPERSONATE_EMAIL` — c'est attendu.)*

**Grille de lecture pour Claude** (à remplir) :
- Couverture : les filtres annoncés répondent-ils tous ? Lesquels manquent pour le tri visé (§5.C) ?
- Qualité des données : champs vides massifs (rôle/orga/secteur, coordonnées) → où l'enrichissement aurait le plus d'impact ?
- Ergonomie agent : messages d'erreur lisibles ? Résolutions (slug/nom) robustes ?

### 7.2 — Bac à sable écriture (optionnel, à confiner)

Sur une **cible jetable** explicitement créée pour l'audit :

1. `create_cible { show: "gdiy", nom: "ZZ Test Audit", kind: "personne", role: "Test" }`.
2. `update_cible` : poser `note_priorite`, `voie: "chaud"`, un `stage`, vérifier le **kind-awareness** (un champ entreprise sur une personne doit être refusé proprement).
3. `add_appui { est_relais: true, telephone: "+33 6 00 00 00 00" }` → vérifier la voie chaude par défaut.
4. `add_contact` + `log_touche { date: "..." }` → vérifier le miroir Folk best-effort.
5. **Nettoyage** : archiver/supprimer la cible de test (via l'app ou un futur outil).

### 7.3 — Questions d'analyse à poser à Claude.ai

> Copier-coller après l'audit :

```
À partir de l'audit MCP ci-dessus et du débrief Magellan :
1. Classe les chantiers de la §5 par ROI (impact closing × effort), en justifiant.
2. Identifie les 3 prochaines actions à plus fort levier pour les 2 prochaines semaines.
3. Repère les incohérences de données révélées par list_cibles/get_dossier
   (champs manquants critiques) et propose un plan d'enrichissement ciblé.
4. Évalue les risques §6 : lesquels bloquent l'usage quotidien vs sont cosmétiques ?
5. Propose un modèle de scoring de tri concret (formule priorité 1-5 + résurgence
   + voie + tag estival) implémentable sans gros refactor.
```

---

## 8. Comment partager ce débrief à Claude.ai

1. S'assurer que le **connecteur MCP « Magellan »** est branché et coché dans Claude.ai.
2. Coller ce document (ou son lien repo) dans une conversation.
3. Demander : *« Lance le protocole d'audit §7.1, puis réponds aux questions §7.3. »*
4. Pour l'audit écriture (§7.2), l'autoriser explicitement et confiner à la cible « ZZ Test Audit ».

---

*Documents liés : `docs/BACKLOG.md` (tâches détaillées + fixtures d'acceptation),
`docs/CDC-fonctionnel-UX.md` (cahier des charges UX), `docs/BRANCHEMENT.md` (config infra).
`docs/ETAT.md` est obsolète.*
