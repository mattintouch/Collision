# Magellan

Moteur de conquête et de closing par podcast pour **Collision Productions**.
Pas un CRM, pas un outil de contenu : un moteur de closing pour cibles
difficiles, qui arrête les trous dans la raquette.

Nom de projet : Magellan (domaine `magellan.collision.studio` branché ultérieurement).

## État (Tranche 1 — Socle + Board, Étapes 0→3)

| Étape | Périmètre | Statut |
|---|---|---|
| 0 — Socle | Next.js PWA, déploiement Vercel, Supabase, Google OAuth (2 domaines) | ✅ scaffold |
| 1 — Base | Schéma §4, RLS par rôle/show, étapes configurables, seed 3 shows + cibles de test | ✅ migrations |
| 2 — MCP | Serveur MCP lecture/écriture, connecteur Claude | ✅ `mcp-server/` |
| 3 — App | Sélecteur de show, board (voie/archétype, ou raison pour Fleurons), dossier cible, capture, dispo classée | ✅ |
| 4 — Copilote | Panneau conversationnel branché sur la base + Google Calendar (créneaux libres), dispo classée, suggestion d'appuis, rédaction style maison, discipline de relance | ✅ |
| 5 — Veille | Job d'actualité des cibles, digest | ⏳ à venir |
| 6 — Continuité | Bascule cible → épisode (RPC `validate_cible` déjà en place) | ◑ amorcé |

## Stack

- **Front** : Next.js 14 (App Router) en PWA. Desktop d'abord, mobile pour Matthieu.
- **Base / Auth** : Supabase (Postgres, RLS, Google OAuth restreint à `stefani.fr` / `collision.studio`).
- **MCP** : serveur stdio TypeScript (`mcp-server/`), branché comme connecteur Claude et consommé par le copilote.
- **Copilote** : API route `/api/copilot` sur l'API Claude (`claude-opus-4-8`) avec boucle d'outils ; repli heuristique en mode démo.
- **Déploiement** : Vercel.

## Démarrage

```bash
npm install
cp .env.example .env.local   # vide => mode démo (données locales calées sur le seed)
npm run dev                  # http://localhost:3000
```

**Mode démo** : tant que `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
ne sont pas renseignés, l'app tourne sur des données locales (`src/lib/demo.ts`)
sans auth, pour voir l'app tourner avant branchement.

## Branchement Supabase

1. Créer le projet Supabase, configurer Google OAuth (2 domaines).
2. Appliquer les migrations puis le seed — voir `supabase/README.md`.
3. Renseigner `.env.local` (cf. `.env.example`).
4. Builder le serveur MCP — voir `mcp-server/README.md`.

## Modèle de données

Voir `supabase/migrations/` (§4 du cahier des charges) :
shows · stages (configurables) · profiles · user_shows · cibles (polymorphe
personne/entreprise) · appuis · touches · signals · episodes.
Vue `cibles_enrichies` pour le moteur de résurgence ; RPC `validate_cible` pour
la bascule en épisode.

## Identité visuelle (§10, décision ouverte §14.1)

Palette : noir, blanc, jaune (signature Collision). Tokens placeholders dans
`tailwind.config.ts` — à remplacer par les hex/typographies exacts du Figma
identité (id `ZI56QbnEsPRDjL5JXJ7oEz`). Logos à déposer dans `public/logos/`.

## Structure

```
src/app/                 # routes (board, dispo, dossier, login, auth)
src/components/           # UI (board, carte cible, formulaires, modal)
src/lib/                  # domaine, types, accès données, Supabase, actions, démo
supabase/migrations/      # schéma, RLS, fonctions
supabase/seed.sql         # 3 shows + cibles de test
mcp-server/               # serveur MCP
```
