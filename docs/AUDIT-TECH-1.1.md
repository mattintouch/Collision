# Magellan — Dossier technique pour challenge (vers v1.1)

> Document destiné à être soumis à un modèle tiers (Fable 5) pour **challenger**
> l'architecture, le code, les choix, et viser un produit « le plus proche du
> parfait » en v1.1. Écrit honnêtement, faiblesses incluses. 2026-06-28.
>
> Repo `mattintouch/Collision` · prod `https://magellan.collision.studio`
> (Vercel `magellancollision`, auto-deploy depuis `claude/magellan-collision-studio-xsi8k6`).
> Docs liés : `RECAP-COMPLET.md`, `DEBRIEF.md` (protocole d'audit MCP), `VADIM-CONTRAT.md`, `DEPLOY.md`, `BACKLOG.md`.

## 0. En une phrase
Moteur de conquête/closing d'invités podcast (shows GDIY, CCG, Fleurons) pour Collision
Productions. Source de vérité du pipe + surface d'outils MCP. Cœur : un **score
d'actionnabilité** + **moteur de résurgence** qui fait remonter « qui travailler maintenant ».

## 1. Stack & architecture
- **Front/app** : Next.js 14 App Router, TypeScript, Tailwind (PWA). Server Components + Server Actions.
- **DB** : Supabase/Postgres. RLS `security_invoker` sur les vues. Deux clients :
  `createClient` (server, session utilisateur, RLS) pour l'app ; `createServiceClient`
  (service-role, **bypass RLS**) pour le MCP.
- **MCP** : `mcp-handler` + `@modelcontextprotocol/sdk` 1.26, route unique
  `src/app/api/[transport]/route.ts` → endpoint `/api/mcp`. OAuth 2.1 + PKCE maison
  (`/.well-known/oauth-*`, `/api/oauth/*`, `src/lib/mcp/oauth.ts`). `maxDuration = 60`.
- **Intégrations** : Folk (CRM, read+write partiel), Google People (Contacts) + Google
  Calendar, Anthropic (recherche web pour veille/enrichissement).
- **Déploiement** : push git → auto-deploy Vercel. Migrations SQL **appliquées à la main**
  dans Supabase (pas de runner). Cf. la frontière de déploiement dans `DEPLOY.md`.

## 2. Modèle de données (23 migrations, `supabase/migrations/0001→0023`)
- **cibles** (polymorphe personne/entreprise ; contraintes CHECK par kind, relâchées
  0020/0021 pour permettre secteur/pays/ville/raison sur une personne). Champs clés :
  kind, nom, stage_id, priorite, voie (froid/chaud), sujets[], note, **note_priorite 1-5**,
  canal_reel, via_qui, archive, **folk_id**, **google_resource_name**, **photo_url**, **ville**,
  role/organisation/archetype (personne), secteur/pays/envergure/raison_de_selection/etat_recherche.
- **appuis** (alliés/relais : nature, est_relais, ally_cible_id, google_resource_name).
- **touches** (journal ; trigger `bump_derniere_touche` à l'insert ; **idempotency_key** 0023).
- **signals** (actu : type, date, pertinence 1-5).
- **contacts** (email/tel/réseau… ; owner cible_id **ou** appui_id ; `verifie`).
- **watchlists** + `cible_watchlists` (tags : cac40…).
- **episodes** (snapshot JSONB du contexte à la validation ; gcal_event_id, lieu, attendees, statut_prod).
- **mcp_audit** (0022 : journal des écritures MCP).
- **Vue `cibles_enrichies`** : `c.*` + stage_key/label/position, jours_depuis_touche,
  dernier_signal_*, signal_frais, watchlist_keys, nb_appuis, **nb_relais_actionnables**.
  ⚠️ `c.*` est **figé à la création** → toute nouvelle colonne exige de **recréer la vue**
  (source d'erreurs répétées, cf. §8).

## 3. Fonctionnalités
### App (Next.js) — 22 composants
Board DnD (grouper-par, filtres, multi-sélection + actions de masse, priorité 1-5,
**score + badges** sur carte, tri par score) · Fiche cible (édition inline, coordonnées
cliquables, tags, appuis, journal, Enrichir, ajout manuel + import Google, **avatar photo**,
ville) · Épisodes (par étape + panneau **Repères** closing/production) · Dispo · Veille ·
Copilote (chat, boucle d'outils Anthropic, repli heuristique) · Réglages · Login. Design
system « Cockpit » (fonts Space Grotesk/JetBrains Mono, tokens, dégradé d'accent, shimmer).
### MCP — 20 outils
- **Lecture (6)** : `list_shows`, `list_cibles` (score, filtres voie/archetype/stage/kind/
  secteur/pays/ville/sujet/watchlist/q, `saison`, `score_min`, `include_archived`),
  `find_cible`, `get_dossier` (+ bloc `contacts_externes` auto-résolu), `resolve_contact`
  (Folk→Google), `show_stats` (funnel closing vs production).
- **Écriture (14)** : `create_cible`, `update_cible` (kind-aware, `stage`, kind éditable),
  `add_appui` (idempotent, auto-attach coords), `update_appui`, `delete_appui`, `add_contact`
  (write-back Folk mail+tel), `log_touche` (idempotency_key, miroir Folk), `archive_cible`,
  `delete_touche`, `validate_cible`, `attach_resolved_contacts`, `sync_google_contacts`
  (dry_run défaut true), `enrich_cible`/`enrich_colonne` (recherche web, Haiku).
- Toutes les écritures passent par un wrapper `W()` → **journal d'audit** best-effort.

## 4. Moteur de score (`src/lib/domain.ts`, read-time, 0–100)
base priorité (note_priorite×8 ou fallback archétype) + signal frais (≤14j × pertinence×4)
+ voie (chaud +15) + relais actionnable (+6/relais joignable, cap 18) + résurgence (fenêtre
1–2× cadence : 14j froid/21j chaud) + momentum stage (qualifie/contacte +8 ; ≥confirme −10)
+ **modificateur estival** (juin-juillet : tag `estival`/sujets légers +, cac40/tech −).
Placeholders (noms factices) détectés et relégués. Tri board + `list_cibles` par score.
**Non validé contre des résultats réels** (pas de boucle de feedback — cf. §8).

## 5. Intégrations & quirks
- **Folk** (`src/lib/folk/*`) : lecture `fetchFolkPeople()` = **récupère tout le carnet**
  (pas d'endpoint de recherche par nom exposé). Écriture : `updatePerson` (phones/emails/
  description) + `POST /interactions` (**write-only**, pas de lecture des interactions).
  `resolve_contact`/auto-attach : match par nom normalisé. `folk_id` persisté depuis peu.
- **Google People** (`src/lib/google/contacts.ts`) : compte de service + délégation domaine
  (JWT `jose`, impersonation). `sync_google_contacts` = Magellan→Google unidirectionnel,
  chunké (lot 150), gate qualité (verifié, non-placeholder), dry_run défaut. `searchContacts`
  a un **quirk de warmup** (renvoie vide à froid → on réchauffe puis on réessaie).
- **Google Calendar** (`src/lib/calendar.ts`) : événement + réservation Studio 71 (-1h/+1h),
  via **provider_token utilisateur** (session Supabase) → **expire, non rafraîchi** (§8).
- **Anthropic** (`src/lib/ai/websearch.ts`) : boucle d'outils `web_search`. Veille = modèle
  par défaut (opus) ; **enrichissement = Haiku** (`ENRICH_MODEL`) + `allowed_callers:["direct"]`
  + 2 recherches, pour tenir sous le **plafond ~60 s du client MCP** (§8).

## 6. Auth & déploiement
- OAuth 2.1 + PKCE, vérif JWT par requête MCP (`experimental_withMcpAuth`). **Aucune portée
  par client** : tout compte authentifié voit **tous** les outils (y c. destructifs) — bloquant
  pour le client externe Vadim (`VADIM-CONTRAT.md`, décision en cours).
- MCP = **service-role** → **bypass RLS** : god-mode sur toutes les données de tous les shows.
- Deploy auto sur push ; migrations manuelles (ordering hazard, §8). Team Vercel = plan payant
  (maxDuration réglable), mais **le client MCP coupe un appel à ~60 s** → c'est LA contrainte dure.

## 7. Ce qui marche bien
Score + tri actionnable, board complet, fiche v2, épisodes + reporting séparé, résolution de
contacts Folk→Google + auto-attach + write-back, enrichissement web sourcé non destructif,
idempotence (touche, appui), journal d'audit, synchro Google chunkée + gate, hygiène (archive/
delete/placeholder). tsc vert. Erreurs MCP lisibles (plus de crash opaque).

## 8. Problèmes techniques & dette (honnête, priorisé)
1. **Aucun test automatisé.** tsc est le seul garde-fou ; pas de vitest/jest, pas de tests
   unitaires (score, placeholder, matching, kindAwarePatch) ni de contrat MCP. Risque majeur pour « produit parfait ».
2. **Enrichissement vs plafond 60 s du client MCP.** Haiku + 2 recherches est un contournement,
   pas robuste (latence web variable). Le vrai fix = **enrichissement asynchrone** (lancer + poller).
3. **Folk `fetchFolkPeople` = O(tout le carnet) à chaque `resolve_contact`/auto-attach/get_dossier
   sans coords.** +5-10 s, ne passe pas à l'échelle. Besoin d'un endpoint de recherche Folk ou d'un cache.
4. **Migrations manuelles** (pas de runner) → **ordering hazard** récurrent (code déployé avant
   SQL appliqué → plantage colonne absente). Vécu plusieurs fois cette session.
5. **Vue `cibles_enrichies` fige `c.*`** → recréation manuelle à chaque colonne (fragile, oublié = bug silencieux).
6. **Pas de portée par client MCP** (Vadim atteindrait les outils destructifs). Sécurité.
7. **MCP en service-role = bypass RLS.** Pas de contrôle d'accès par utilisateur/show côté MCP.
8. **Google Calendar : provider_token qui expire, non rafraîchi** → l'invitation casse après péremption.
9. **Score heuristique non validé** (pas de boucle de feedback : la relance a-t-elle converti ?).
10. **Fiabilité du connecteur** : coupures transitoires du transport MCP (côté client/runtime) — dégradent l'UX agent.
11. **Trous de qualité enrichissement** : Haiku plus superficiel, `photo_url` heuristique, **sources non persistées** en base.
12. **Folk partiel** : `update_cible` ne synchronise pas Folk ; interactions write-only.
13. **`any` / cast** dans le wrapper `W()` et le widening du select PostgREST → trous de typage.
14. **Demo mode (`demo.ts`)** doit être synchronisé à la main avec le schéma (fragile).
15. **Pas d'observabilité** structurée (hors `mcp_audit`), pas de rate-limiting sur les écritures MCP.
16. **Audit `actor`** dépend de `authInfo.extra.email` — peut être nul.

## 9. Pistes d'optimisation (à challenger)
- **Enrichissement asynchrone** (job + statut `etat_recherche` + poll) → échappe au 60 s, permet plus de recherches et de la qualité.
- **Résolution Folk** : endpoint de recherche par nom si dispo, sinon cache mémoire TTL (attention serverless : cache par instance) ou table de miroir Folk rafraîchie périodiquement.
- **Runner de migrations** (Supabase CLI en CI, ou script d'apply au deploy) pour tuer l'ordering hazard.
- **Vue** : passer à une liste de colonnes explicite + lint, ou générer la recréation.
- **Score** : rendre les poids configurables + **boucle de feedback** (résultat de relance → tuning) ; éventuellement un vrai modèle.
- **Scoping MCP** (Vadim) : endpoint restreint `/api/loop/mcp` ou claims de scope + gating.
- **RLS à travers le MCP** : propager l'identité et vérifier l'accès show, au lieu du service-role god-mode.
- **Google** : persister/rafraîchir le refresh token pour un Calendar durable ; idem envoi `contact@gdiy.fr` (Gmail send-as).
- **Tests** : vitest sur `domain` (score/placeholder), `contacts/resolve`, `stats`, `folk/write`, + tests de contrat des outils MCP (schémas & clés stables — le contrat Vadim en dépend).
- **Persister les sources d'enrichissement** + confiance, et un `photo_url` validé (image directe).
- **Idempotence étendue** (update_cible/add_contact) si le client de boucle réessaie.
- **Découplage** : extraire la logique métier des handlers MCP (déjà partiellement fait via `domain`/`stats`/`resolve`) pour testabilité.

## 10. Décisions ouvertes
- **Scoping Vadim** : endpoint dédié (reco) vs allowlist d'identité vs rien (`VADIM-CONTRAT.md`).
- **Prénom/nom séparés** (impacte mapping Google/Folk).
- **Refonte UI** : shell/login/board faits ; panneaux interactifs (copilote/veille/import) restent fonctionnels non « refondus ».
- **Formulaire public invité** (collecte coordonnées à la sortie d'épisode) — gros levier, non construit.
- **C7 — pipeline d'ingestion de signaux** (presse/levées/nominations) : à la demande vs cron.
- **Reporting** : `update_cible` doit-il synchroniser Folk ?

## 11. Prompts de challenge pour Fable 5
```
Tu es un architecte/relecteur senior. À partir de ce dossier (et du repo si accessible) :
1. Attaque les §8 (dette) : quels problèmes sont réellement bloquants pour une v1.1 fiable,
   lesquels sont cosmétiques ? Classe par risque × effort.
2. Le plafond 60 s du client MCP contraint l'enrichissement web. Propose l'architecture
   asynchrone la plus simple qui tienne (job, statut, poll) sans sur-ingénierie.
3. Résolution de contacts Folk en O(tout le carnet) : propose une stratégie qui passe à l'échelle
   (search API, cache, table miroir) avec ses compromis serverless.
4. Sécurité : MCP en service-role (bypass RLS) + pas de scoping par client. Quel modèle d'accès
   pour (a) l'app multi-utilisateurs, (b) le client externe Vadim en lecture + 3 écritures ?
5. Le score (§4) est heuristique. Propose une boucle de feedback measurable et un plan de test.
6. Quels tests écrire en premier (plus haut ROI) pour verrouiller les régressions vues cette session
   (kind-aware, slug, idempotence, non-destructif, score) ?
7. Donne un plan v1.1 priorisé (impact × effort) sur 3-4 semaines.
```
