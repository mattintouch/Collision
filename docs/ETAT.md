# Magellan — État du projet (débrief)

Moteur de conquête et de closing par podcast pour **Collision Productions**.
Pas un CRM, pas un outil de contenu : un moteur de closing pour cibles
difficiles, dont le but est d'« arrêter les trous dans la raquette ».

Repo : `mattintouch/Collision` · Branche : `claude/magellan-collision-studio-xsi8k6`

---

## Ce qui est construit (Tranche 1, étapes 0→5)

- **Étape 0 — Socle** : Next.js 14 (App Router) en PWA, déploiement Vercel.
- **Étape 1 — Base** : schéma Postgres sur Supabase (shows, étapes configurables,
  cible polymorphe personne/entreprise, appuis, touches, signaux, épisodes,
  contacts), RLS par rôle et par show, seed des 3 shows + cibles de test.
- **Étape 2 — Serveur MCP** (`mcp-server/`) : expose la base en lecture/écriture
  (list_cibles, get_dossier, create_cible, log_touche, validate_cible) ;
  branchable comme connecteur Claude.
- **Étape 3 — App** : sélecteur de show ; board par archétype (invités) ou par
  étape + raison de sélection (Fleurons), voie froide en tête ; dossier cible
  (relance avec raison, journal, capture, appuis, signaux) ; page Dispo (liste
  classée avec « pourquoi maintenant ») ; création de cible, log de touche,
  validation → épisode.
- **Étape 4 — Copilote** : panneau conversationnel par show, branché sur la base
  (boucle d'outils API Claude, modèle `claude-opus-4-8`) + Google Calendar
  (créneaux libres) ; style maison, discipline de relance. Repli heuristique
  hors-ligne (mode démo).
- **Étape 5 — Veille + enrichissement** : veille web par cible (digest filtré →
  signaux → résurgence) ; enrichissement contacts (email/téléphone/agence,
  sources publiques, RGPD) pour joindre les cibles difficiles. Le copilote
  indique la meilleure voie de contact au moment de rédiger.

Le moteur de résurgence (anti-oubli) relie tout : signaux + temps écoulé +
priorité → un « pourquoi maintenant » et un conseil (relancer / attendre /
passer par un appui), repris dans le board, la dispo et le copilote.

---

## État du branchement (live)

- **Supabase** : projet créé (ref `ppfhkscoerxlikzxclhz`). Schéma + RLS + seed
  appliqués (via `supabase/setup_all.sql`). 3 shows + cibles de test en base.
- **Auth** : Google OAuth branché (client Web), restriction aux domaines
  `stefani.fr` / `collision.studio` vérifiée côté app. Scope `calendar.readonly`
  demandé pour le copilote.
- **Vercel** : déployé en production sur **https://magellancollision.vercel.app**
  (branche Magellan promue en production). Variables d'env posées :
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key).
- **Compte** : `matt@stefani.fr` passé en rôle **admin** (accès total).
  → L'app est fonctionnelle et persiste dans la vraie base.

Mode démo automatique tant que Supabase n'est pas branché ; ici il est branché,
donc on est en mode réel (sauf l'IA, voir ci-dessous).

---

## Ce qui reste

1. **Clé Claude** : ajouter `ANTHROPIC_API_KEY` (secret) dans Vercel + redeploy
   → active copilote IA, veille web réelle, enrichissement réel.
   (Optionnel : `ANTHROPIC_MODEL`, défaut `claude-opus-4-8`.)
2. **Import Folk** (cahier des charges §14.2) : ✅ construit via l'API Folk.
   Page `/[show]/import` (bouton « Importer (Folk) » sur le board) : choisir un
   groupe Folk → aperçu → import en cibles (+ emails/téléphones en contacts,
   dédoublonnage par nom). Reste à brancher : `FOLK_API_KEY` (clé API Folk,
   serveur uniquement) dans Vercel, puis redeploy.
3. **Google Calendar durable** : persister/rafraîchir le refresh token Google
   (le provider_token actuel n'est frais qu'après connexion).
4. **Vision** : lecture des captures d'écran par l'IA (la capture par texte
   fonctionne déjà).
5. **Identité visuelle** : récupérer les tokens (couleurs/typos) du Figma et les
   logos du Drive (placeholders actuels dans `tailwind.config.ts` /
   `public/logos/`).
6. **Domaine** : brancher `magellan.collision.studio` sur Vercel (ajouter le
   domaine côté Vercel + ajouter l'URL aux Redirect URLs Supabase).

---

## Repères techniques

- Migrations : `supabase/migrations/0001→0004` + `supabase/seed.sql`
  (ou `supabase/setup_all.sql` = tout en un, délimiteurs `$fn$`).
- App : `src/app/` (routes), `src/components/`, `src/lib/`
  (`domain.ts` = résurgence, `copilot/`, `veille/`, `enrichment/`, `calendar.ts`).
- Guide de branchement détaillé : `docs/BRANCHEMENT.md`.
