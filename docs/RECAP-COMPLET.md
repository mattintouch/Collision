# Magellan — Récap complet (état au 2026-06-28, pour challenge par Claude)

> Document autoportant à coller dans Claude pour challenger l'outil : architecture,
> fonctionnalités, **flux de validation d'un enregistrement** (spec + état), outils
> MCP, intégrations, manques connus, et questions ouvertes.
>
> Repo `mattintouch/Collision` · prod auto-déployée depuis `claude/magellan-collision-studio-xsi8k6`
> → `https://magellan.collision.studio` (cf. `docs/DEPLOY.md`). Protocole d'audit MCP : `docs/DEBRIEF.md` §7.

## 1. Ce qu'est Magellan
Moteur de conquête/closing d'invités podcast pour Collision (shows **GDIY**, **CCG**,
**Fleurons**). Pas un CRM : un moteur anti-« trous dans la raquette ». Cœur =
**score d'actionnabilité** + **résurgence** (relancer la bonne cible, au bon moment,
par la bonne voie froid/chaud).

## 2. Stack
Next.js 14 (App Router) + TS + Tailwind (PWA) · Supabase/Postgres (RLS, vues
`security_invoker`) · MCP via `mcp-handler` + SDK 1.26 (`src/app/api/[transport]/route.ts`,
endpoint `/api/mcp`, OAuth 2.1+PKCE maison) · ponts Google (People/Calendar) + Folk · Vercel.

## 3. Modèle de données (cibles)
- **Cible polymorphe** `personne` / `entreprise` (contraintes CHECK par kind).
- Champs : nom, role/organisation/archetype (personne) ; secteur/pays/envergure/
  raison_de_selection/etat_recherche (entreprise) ; priorite, voie (froid/chaud),
  sujets[], note, **note_priorite 1-5**, canal_reel, via_qui, archive, stage_id, folk_id,
  google_resource_name.
- **Appuis** (alliés) : nature + **est_relais** + coordonnées propres ; lien cible↔cible.
- **Touches** (journal), **signals** (actu, pertinence 1-5), **contacts** (verifie),
  **watchlists** (tags : cac40…), **episodes** (snapshot à la validation).
- Vue `cibles_enrichies` : ajoute stage_key/label, jours_depuis_touche, dernier_signal,
  signal_frais, watchlist_keys, nb_appuis, **nb_relais_actionnables**.

## 4. Score d'actionnabilité (read-time, `src/lib/domain.ts`)
0–100 = base priorité (note_priorite×8 ou archétype) + signal frais (≤14j ×4) + voie
(chaud +15) + relais actionnable (+6/relais joignable) + résurgence (fenêtre 1–2× cadence)
+ momentum stage (qualifie/contacte +8 ; ≥confirme −10) + **modificateur estival**.
- **Estival** (juin–juillet ou `saison:"ete"`) : tag `estival`/sujets légers **+**, CAC40/
  sujets durs **−** (programmation août grand public ; le dur repart en septembre).
- Placeholders (noms factices) relégués + exclus. Le board et `list_cibles` trient par score.

## 5. Écrans
- **Board** (`BoardDnd`) : DnD, **grouper par** (archétype/étape/voie/watchlist/secteur),
  filtres, **multi-sélection + actions de masse**, priorité 1-5, **score + badges** sur carte,
  tri par score.
- **Fiche cible** : édition inline, coordonnées cliquables, tags, appuis, journal, **Enrichir**,
  ajout contact manuel + import Google.
- **Épisodes** : liste par étape (programmé/enregistré/publié), réactivation. *(lecture seule)*
- Dispo / Veille / Copilote.

## 6. Flux de validation d'un enregistrement — SPEC CIBLE + ÉTAT

**Objectif** : quand un RDV est validé, Magellan doit (a) créer l'événement agenda,
(b) envoyer un email validable/éditable aux participants avec un **formulaire qui remplit
la fiche**, (c) ouvrir une **fiche enregistrement éditable/enrichissable (idéalement via MCP)**.

| Étape | Cible | État | Manque |
|---|---|---|---|
| Événement agenda | horaire+lieu validés ; défaut Studio 71 mar/jeu 9h30 ; **exceptions fréquentes** | ✅ modale règle date/heure/lieu ; réservation studio -1h/+1h ; event Google depuis le compte connecté | ⚠️ **pas de détection de conflit** avec les créneaux pré-bookés (freeBusy existe, non utilisé à la création) |
| Email participants | « ravis d'enregistrer » : date/lieu/prépa **+ formulaire** qui remplit la fiche ; **validable + éditable à chaque envoi** | ⚠️ gabarit FR/EN éditable+validable dans la modale | ❌ envoyé **comme invitation Calendar** (pas un vrai email ; expéditeur = compte connecté, pas `contact@gdiy.fr`) ; ❌ **formulaire public inexistant** |
| Fiche enregistrement | **modifiable + enrichissable**, si possible **via MCP** | ⚠️ épisode créé (snapshot) ; report/annulation re-sync Google | ❌ **pas de page épisode éditable** ; ❌ **aucun outil MCP épisode** (`validate_cible` = RPC brut, pas d'agenda/email ; pas d'`update_episode`/`enrich_episode`) |

**3 chantiers manquants, par valeur :** (1) **formulaire public invité** → écrit dans
`contacts`/fiche (résout le problème de coordonnées) ; (2) **fiche épisode éditable + outils
MCP** (notes/angle/prépa) ; (3) **email réel** (Gmail `contact@gdiy.fr`) **+ garde-fou
anti-conflit** d'agenda.

## 7. Outils MCP (endpoint `/api/mcp`, 15)
Lecture : `list_shows`, `list_cibles` (score, filtres, `saison`, `score_min`, `include_archived`),
`find_cible`, `get_dossier`. Écriture : `create_cible`, `update_cible` (kind-aware + `stage` +
**`kind` éditable**), `add_appui`, `add_contact`, `log_touche`, **`archive_cible`**,
**`delete_touche`**, `validate_cible`. Ouverts : `sync_google_contacts` (dry_run par défaut),
`enrich_cible`, `enrich_colonne`.

## 8. Intégrations
- **Google** : OAuth connexion (domaines stefani.fr/collision.studio) ; **Calendar** (event +
  réservation studio, via provider_token utilisateur — *expire, refresh non persistant*) ;
  **People/Contacts** (compte de service + délégation, synchro Magellan→Google, dry_run + gate qualité).
- **Folk** : `folk_id`, push des touches (interactions write-only côté Folk).

## 9. Manques / roadmap
- Validation : formulaire public, fiche épisode éditable + MCP épisode, email réel, anti-conflit.
- **Refonte UI Cockpit** : faite sur board/carte ; reste header, fiche, login, copilote, dispo, veille, import, réglages.
- **Admin + rôles RLS** (super-admin/admin/users), gestion équipe/gabarits/connexions.
- **Pipeline d'ingestion de signaux** (presse/levées/nominations) — `signals` sous-alimenté.
- Reporting closing vs production séparé ; refresh token Google durable ; prénom/nom séparés ?

## 10. Données (hygiène, à faire côté connecteur)
Champs souvent vides (secteur/pays/envergure, note_priorite, raison_de_selection) ; relais
non flaggés ; placeholders à archiver ; touches de test à purger ; types à corriger
(ex. « Helsing » personne→entreprise). Outils dispo : `enrich_cible`, `update_cible`,
`archive_cible`, `delete_touche`, `add_appui`.

## 11. Comment challenger (prompts pour Claude)
```
À partir de ce récap + de l'audit live (docs/DEBRIEF §7) :
1. Le flux de validation (§6) : le découpage en 3 chantiers est-il le bon ? Qu'est-ce
   qui manque ou est mal priorisé ? Propose le MVP du formulaire public invité.
2. Le score (§4) : la formule tient-elle ? Cas où elle classerait mal une cible ?
3. Quels outils MCP épisode créer (schémas) pour piloter un enregistrement via Claude ?
4. Risques d'architecture (auth Google qui expire, snapshot épisode immuable, RLS) ?
5. Trois prochaines actions à plus fort levier, avec justification ROI.
```
