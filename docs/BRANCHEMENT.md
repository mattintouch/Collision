# Magellan — Guide de branchement (sur ton ordi)

Objectif : passer du **mode démo** au **mode réel** (Supabase + Google + IA), en local.
Compte ~30 min la première fois. Ordre recommandé : Supabase → Google → IA → lancer.

---

## 0. Récupérer le code

```bash
git clone <url-du-repo> Collision
cd Collision
git checkout claude/magellan-collision-studio-xsi8k6
npm install
```

(Node 20+ requis. Vérifie : `node --version`.)

---

## 1. Supabase (base + auth)

### 1.1 Créer le projet
1. Va sur https://supabase.com → **New project**. Région Europe (Paris/Frankfurt).
2. Note le mot de passe Postgres (tu n'en auras pas besoin si tu passes par l'éditeur SQL).
3. Une fois le projet prêt : **Settings → API**, récupère :
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** (secret) → `SUPABASE_SERVICE_ROLE_KEY`

### 1.2 Créer le schéma + le seed
Le plus simple : **Dashboard → SQL Editor → New query**. Colle et exécute, **dans l'ordre**, le contenu de chaque fichier :

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_functions.sql`
4. `supabase/migrations/0004_contacts.sql`
5. `supabase/seed.sql`

(Alternative CLI : `supabase link --project-ref <ref>` puis `supabase db push`, puis
`psql "<connection string>" -f supabase/seed.sql`. L'éditeur SQL reste le plus fiable.)

---

## 2. Google OAuth (connexion + Calendar)

### 2.1 Google Cloud Console
1. https://console.cloud.google.com → crée/choisis un projet.
2. **APIs & Services → Library** : active **Google Calendar API**.
3. **OAuth consent screen** :
   - Type : *Internal* si tu gères un Google Workspace sur stefani.fr/collision.studio, sinon *External*.
   - Ajoute le scope `.../auth/calendar.readonly`.
4. **Credentials → Create credentials → OAuth client ID** :
   - Type : **Web application**.
   - **Authorized redirect URI** :
     `https://<TON-REF>.supabase.co/auth/v1/callback`
     (remplace `<TON-REF>` ; visible dans l'URL Supabase).
   - Récupère **Client ID** et **Client secret**.

### 2.2 Brancher dans Supabase
1. **Authentication → Providers → Google** : *Enable*, colle Client ID + secret, **Save**.
2. **Authentication → URL Configuration** :
   - **Site URL** : `http://localhost:3000`
   - **Redirect URLs** : ajoute `http://localhost:3000/auth/callback`
   (plus tard, ajoute aussi l'URL Vercel de prod.)

> La restriction aux domaines `stefani.fr` et `collision.studio` est vérifiée
> côté app (dans `/auth/callback`). Une adresse hors de ces domaines est
> déconnectée automatiquement.

---

## 3. Clé API Claude (copilote, veille, enrichissement)

1. https://console.anthropic.com → **API keys → Create key**.
2. Ajoute un moyen de paiement / crédit (**Billing**) — facturé à l'usage.
3. Garde la clé pour l'étape suivante.

---

## 4. Fichier `.env.local`

À la racine du projet :

```bash
cp .env.example .env.local
```

Puis remplis :

```bash
NEXT_PUBLIC_SUPABASE_URL=https://TON-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...        # anon public
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # service_role (secret)

ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8             # ou claude-sonnet-4-6 (moins cher)

GOOGLE_OAUTH_ALLOWED_DOMAINS=stefani.fr,collision.studio
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Dès que `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` sont remplis,
le **mode démo se désactive** automatiquement.

---

## 5. Lancer

```bash
npm run dev      # http://localhost:3000
```

1. Tu es redirigé vers `/login` → **Continuer avec Google** → choisis ton compte `@stefani.fr`.
2. Au premier login, ton profil est créé en rôle **externe** (aucun accès aux shows).
3. Donne-toi les droits **admin** (accès total). Dans Supabase → SQL Editor :

```sql
update public.profiles set type = 'admin' where email = 'matt@stefani.fr';
```

Reconnecte-toi / rafraîchis : tu vois les 3 shows, le board, la dispo, la veille, le copilote.

> Pour donner un accès **par show** à un collaborateur (sans le passer admin) :
> ```sql
> insert into public.user_shows (user_id, show_id, role)
> select p.id, s.id, 'interne'
> from public.profiles p, public.shows s
> where p.email = 'collègue@collision.studio' and s.slug = 'gdiy';
> ```

---

## 6. Vérifier que tout est branché

- **Board** : les cibles de test s'affichent (données venant de Supabase, plus la bannière « mode démo »).
- **Copilote** : pose « qui engager cette semaine ? » → le badge passe de `démo` à `IA`.
- **Veille** : « Lancer la veille » → digest web réel ; les signaux apparaissent ensuite dans la résurgence.
- **Dossier cible → Enrichir** : voies de contact réelles, enregistrées en base.
- **Créneaux** : « mes créneaux libres » dans le copilote → lit ton Google Calendar.

---

## 7. Serveur MCP (connecteur Claude) — optionnel

```bash
cd mcp-server
npm install
npm run build
```

Puis dans la config MCP de Claude (Desktop / Code), voir `mcp-server/README.md`
(renseigne `NEXT_PUBLIC_SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`).

---

## 8. Déploiement Vercel (plus tard)

1. Importe le repo sur Vercel.
2. **Settings → Environment Variables** : recopie le `.env.local` (sans `NEXT_PUBLIC_SITE_URL` local — mets l'URL de prod).
3. Dans Supabase **URL Configuration** et dans Google **redirect URIs** : ajoute l'URL de prod
   (`https://magellan.collision.studio/auth/callback` une fois le domaine branché).
4. Plan **Pro** requis pour un usage commercial/équipe.

---

## Limites connues à ce stade

- **Google Calendar** : le `provider_token` n'est pas encore rafraîchi automatiquement
  (frais juste après connexion). Pour une dispo live durable, prévoir la persistance du refresh token.
- **Tokens Figma + logos** : placeholders dans `tailwind.config.ts` et `public/logos/`
  tant que la DA n'est pas récupérée.
- **Vision (captures d'écran)** : la capture par texte fonctionne ; la lecture d'image par l'IA reste à brancher.
