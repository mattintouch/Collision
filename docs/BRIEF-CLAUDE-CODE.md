# Magellan — Brief général v1.1 + Tranche Production (pour Claude Code)

> Consolidation des arbitrages Fable 5 des 2026-07-02/03, à jour de l'état
> constaté (migrations 0026-0027 appliquées, `main` = prod, enrichissement
> asynchrone actif, type de contact `portier` livré). Ce document remplace
> le séquençage de `PLAN-V1.1.md` là où il en diffère ; les décisions ici
> sont **tranchées**, ne pas les rouvrir sans signal de Matt.
> Style de tout texte produit : pas de tiret cadratin, pas de « on »,
> sujet-verbe-complément, soutenu non littéraire, pas d'emoji dans le code
> destiné aux utilisateurs.

---

## 0. État constaté (ne pas refaire)

- `main` = branche de prod, Vercel auto-déploie (temporaire, voir S1a).
- Enrichissement asynchrone : livré (migration 0026, cron, `CRON_SECRET`).
- Pont Folk enrichi : `appuis.folk_id`, type de contact `portier`,
  `match_confidence` + candidats sur `add_appui` (migration 0027).
- Recette Camille en cours côté Matt (add_appui → add_appui_contact portier
  → get_dossier).

## 1. Décisions verrouillées (journal d'arbitrage)

1. **Runner de migrations = GitHub Action sur merge→main**, jamais un step
   de build Vercel. Séquence stricte : Action applique les migrations
   (Supabase CLI) **puis** déclenche le déploiement via Deploy Hook.
   L'auto-deploy Vercel sur main sera coupé par Matt **après** livraison
   de l'Action. Secrets fournis par Matt : `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_DB_PASSWORD`, `VERCEL_DEPLOY_HOOK`.
2. **Vue `cibles_enrichies`** : colonnes explicites + script `gen:view`
   qui produit la migration de recréation. Fin du `c.*` figé.
3. **Tests = trois familles, rien de plus** : contrat MCP (snapshot des
   clés compactes de `list_cibles`, contrat Vadim), golden tests
   `domain.ts` (10 cas réels figés, score + isPlaceholder, dont estival
   et cac40), idempotence + kind-aware. `tsc && vitest` en CI.
4. **`smoke-mcp`** : script d'appel HTTP direct de l'endpoint MCP avec un
   token (hors client claude.ai), pour que les acceptations MCP soient
   vérifiables sans dépendre de la stabilité du connecteur.
5. **Mode démo** : à supprimer, mais en fin de socle (S1bis), hors chemin
   critique.
6. **Scopes MCP** : claims `read/write/admin` mappés depuis
   `profiles.type` à l'émission du token. Matt + Clémence = admin,
   équipe = write. Gating dans `W()` : écriture exige `write`,
   destructif (`delete_*`, `archive_cible`, `sync_google_contacts`,
   `enrich_* apply`) exige `admin`. `mcp_audit.actor` = email du token,
   jamais nul.
7. **Google Calendar et Gmail = compte de service + délégation de
   domaine collision.studio**, impersonation configurable
   **`EPISODE_SENDER`** (valeur initiale `matt@collision.studio`).
   Abandon du `provider_token` Supabase pour Calendar. Plan B documenté
   seulement : capture du `provider_refresh_token` (access_type=offline).
   Scopes délégués (geste Matt) : contacts, calendar, gmail.send.
   `contact@gdiy.fr` n'est PAS utilisable (simple alias de renvoi).
8. **Vadim = endpoint dédié `/api/loop/mcp`** (Option B). Outils
   enregistrés, exhaustivement : list_shows, list_cibles, find_cible,
   get_dossier, daily_five, log_touche, update_cible, add_appui. Aucun
   destructif présent physiquement. S'ajoute aux scopes (deux mécanismes,
   deux menaces, voulu).
9. **`enrich_cible` async a changé de contrat** (job_id + poll) :
   documenter le nouveau shape dans la description de l'outil ; Vadim
   n'est pas consommateur, pas de versioning à construire.
10. **L'enrichissement produit désormais des figures structurées**
    (valeur, unité, libellé, source, confiance) en plus de la prose :
    c'est l'aliment des sections chiffres/graphiques de la fiche (S10).
11. **« Aujourd'hui » remplace la page Dispo** (même moteur de sélection,
    plus l'action prête). Pas de deuxième écran de tri.
12. **Plaud** : aucun code. Le pont est opéré dans claude.ai (connecteurs
    Plaud + Magellan côte à côte). Ne rien construire avant preuve
    d'usage répété.
13. **Pas de co-édition riche de texte** (pas de clone de Google Docs).
    La collaboration = curation + commentaires (S11) + live (S12).
14. **UI gelée pour Clémence** pendant ses 2 premières semaines : pas de
    changement d'interface non annoncé ; les frictions vont au journal,
    correctifs par lot hebdomadaire.

## 2. Socle : ce qui reste (ordre strict)

### S1a — Runner de migrations + CI (bloquant tout)
GitHub Action `deploy.yml` : sur push main → `supabase db push` (ou apply
script idempotent des fichiers `supabase/migrations/`) → si succès, POST
sur `VERCEL_DEPLOY_HOOK`. Échec de migration = pas de deploy. Ajouter
`tsc && vitest` dans le même workflow, avant les migrations.
**Acceptation** : une migration volontairement cassée bloque le deploy ;
un merge propre migre puis déploie, dans cet ordre, visible dans les logs.

### S1b — Vue explicite + tests + smoke-mcp
Livrer les points 2, 3, 4 du journal. Les golden tests utilisent des cas
réels de la base (Tony Parker en tête, Aghion « gagné » en bas, « XX
Hugel » placeholder, un estival, un cac40 en juillet).
**Acceptation** : `vitest` vert en CI ; `npm run smoke-mcp` exécute
list_shows + list_cibles + get_dossier en HTTP direct et vérifie les clés.

### S1bis — Suppression du mode démo (fin de journée, non bloquant)

### S2 — Multi-utilisateur (pack Clem)
Points 6 et 7 du journal : scopes + audit fiable + Calendar sur compte de
service (`EPISODE_SENDER`). Ajouter l'undo d'archivage de masse sur le
board (désarchiver la dernière sélection).
**Acceptation** : Clémence valide un épisode de test, invitation créée
via le compte de service, organisateur `matt@collision.studio` ; son
écriture MCP apparaît dans mcp_audit avec son email ; un token `write`
ne peut pas appeler delete_touche (vérifié par smoke-mcp).

### S4 — Folk miroir (si l'API Folk n'a pas de recherche : vérifier en 15 min d'abord)
Table miroir `folk_people` rafraîchie par le cron existant (1 h),
`nom_normalise` + pg_trgm, matching flou dans resolve/auto-attach.
**Acceptation** : resolve_contact < 500 ms ; « Edouard Meylan » matche
« Édouard Meylan ».

### S5 — Aujourd'hui + playbook
- Champ `playbook` jsonb sur cible : canal recommandé, langue, angle,
  contrainte de fenêtre, personne d'entrée (souvent un appui `portier`).
- Route `/[show]/aujourdhui` : 5 cibles max par score, chacune rendue
  comme action prête (qui, pourquoi maintenant, par quel chemin, brouillon
  de message rédigé par le copilote, adapté canal + langue + style maison).
  Boutons : copier, touche loggée (log_touche pré-rempli), reporter.
- Outil MCP lecture `daily_five` (même sélection).
- La route remplace Dispo (redirection), onglet en premier dans la nav.
**Acceptation** : ouvrir, copier, logger : 3 gestes, moins de 60 s ; la
cible loggée sort de la liste du jour.

### S6 — Endpoint Vadim (1 h, après S2)
Point 8 du journal.
**Acceptation** : le client sur /api/loop/mcp liste exactement 8 outils ;
smoke-mcp confirme l'absence des destructifs ; idempotence des 3
écritures vérifiée.

### S7 — Feedback du score
Champ `resultat` sur touches (reponse_positive | reponse_negative |
silence | avance_stage), demandé au log de la touche suivante ;
show_stats étendu (taux de réponse par tranche de score, par voie,
conversion fenêtre de résurgence vs hors fenêtre) ; poids du score en
config modifiable sans deploy. Tuning : septembre, sur chiffres.

## 3. Tranche Production (S9→S12) — objectif : cycle complet jusqu'au record

Prérequis : S2 livré + délégation Workspace faite par Matt.
La fiche épisode est la surface commune : elle verrouille l'ordre.

### S9 — Invitation complète + VCF
- `validate_cible` enrichi : participants systématiques (Matt, Clémence,
  invité, staff éventuel), corps d'événement complet (accès Studio 71,
  parking, durée 2-3 h, contact jour J), création via compte de service.
- Génération VCF serveur depuis les fiches (invité, staff, Matt, Clémence,
  chacun reçoit les autres). Contrainte : Google Calendar n'accepte pas
  de PJ arbitraire → les VCF partent en PJ du mail de préparation (S10),
  avec lien de secours dans la description de l'événement.
**Acceptation** : validation d'un épisode de test → événement avec tous
les participants + réservation studio + description complète.

### S10 — Mails de préparation + fiche HTML
- Envoi Gmail via compte de service (`EPISODE_SENDER`), deux gabarits :
  invité et staff. PJ : les VCF. Contient le lien fiche + (plus tard) le
  lien formulaire de coordonnées (S8). Relecture avant envoi conservée.
- **Gabarit fiche = la fiche Onesta, codifiée.** Structure fixe en 10
  sections : 00 Lecture stratégique · 01 Mission · 02 À verrouiller ·
  03 Qui · 04 En chiffres (graphiques SVG natifs + figures) · 05 Questions
  réseaux · 06 Questions profondes (3 axes) · 07 Masterclass ·
  08 À verrouiller à l'arrivée · 09 Sources. Tokens exacts :
  paper #F4F5F1, paper-deep #E7E9E3, ink #1B1D1E, cobalt #1B3FBF,
  cobalt-deep #142E8C, amber #B5790A, amber-band #F6E8C8, labels et
  données en mono, mobile-first, autonome. Référence :
  `fiche-gdiy-onesta_1.html` (à déposer dans le repo comme gabarit).
- Génération par le copilote depuis le dossier enrichi (dont les figures
  structurées du point 10) ; servie sur route `/fiche/[episode]`, lien
  signé, régénérable. **Une section sans matière s'affiche comme manquante**
  (contrôle qualité de prep), jamais remplie de vide.
- Le fine-tuning du prompt de fiche = chantier ultérieur, après 3-4
  fiches réelles générées. Ne pas optimiser à vide.
**Acceptation** : depuis un épisode validé, générer la fiche, l'ouvrir
sur mobile, envoyer le mail de prep de test avec VCF en PJ.

### S11 — Salle de prep (collaboration asynchrone)
Sur la fiche épisode : liste de curation (liens articles/vidéos, statut
lu/à lire, auteur de l'ajout) + fil de commentaires ancrés aux sections.
Supabase Realtime, auth Magellan. Remplace l'usage Google Docs de prep.

### S12 — Mode live (pendant l'enregistrement)
Sur la fiche, pour tout utilisateur Magellan connecté dessus en même
temps : **présence** (qui est sur la fiche), **chat** en marge, message
marquable **prioritaire** (s'épingle en surimpression discrète en haut
de la fiche de Matt jusqu'à balayage : fonction topeuse), bouton
**moment** (marqueur horodaté relatif au début d'enregistrement + note).
Chat et moments persistés sur l'épisode ; export de la liste des moments
pour la post-prod. Supabase Realtime (Broadcast + Presence), pas
d'infrastructure nouvelle.
**Acceptation** : deux comptes sur la même fiche, l'un épingle une
question prioritaire visible chez l'autre en < 2 s, trois moments posés
ressortent horodatés sur l'épisode.

## 4. Ce que Matt fournit (interfaces, rien d'autre à lui demander)

| Élément | Où | Débloque |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` | Secrets GitHub Actions | S1a |
| `VERCEL_DEPLOY_HOOK` (après livraison de l'Action) | Secret GitHub Actions | S1a |
| Coupure auto-deploy Vercel sur main | Dashboard Vercel | S1a (après l'Action) |
| Protection de `main` | GitHub Settings | S0 reliquat |
| Délégation domaine (contacts + calendar + gmail.send) sur le client ID du compte de service, impersonation `matt@collision.studio` | Admin Workspace | S2, S9, S10 |
| Fichier `fiche-gdiy-onesta_1.html` | dépôt dans `docs/gabarits/` | S10 |
| Recette Camille (3 gestes connecteur) | claude.ai | validation 0027 |

## 5. Hors périmètre (rappel, inchangé)

RLS propagée via MCP · pipeline signaux C7 (décision septembre sur les
chiffres S7) · prénom/nom séparés · co-édition riche de texte · webhook
Magellan→Vadim (Phase 3, interdit par le contrat) · refonte UI des
panneaux (après le journal de friction Clem).
