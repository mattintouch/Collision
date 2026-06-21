# Base Magellan (Supabase)

Base Postgres unique. Schéma du cahier des charges §4, RLS par rôle et par show (§11).

## Ordre des migrations

1. `migrations/0001_schema.sql` — types, tables, triggers (compteur de touche, updated_at).
2. `migrations/0002_rls.sql` — fonctions d'aide + politiques RLS + création de profil à l'inscription.
3. `migrations/0003_functions.sql` — `validate_cible()` (bascule épisode) + vue `cibles_enrichies` (résurgence).
4. `migrations/0004_contacts.sql` — table `contacts` (enrichissement) + RLS.
5. `seed.sql` — 3 shows, leurs étapes, cibles de test.

## Local

```bash
supabase start
supabase db reset   # rejoue les migrations puis le seed
```

## Distant (au branchement)

```bash
supabase link --project-ref <ref>
supabase db push           # applique les migrations
psql "$DATABASE_URL" -f supabase/seed.sql
```

## Permissions

- **admin** (`profiles.type = 'admin'`) : accès total + gestion utilisateurs/shows.
- **interne** : lecture + écriture sur les shows listés dans `user_shows`.
- **externe** : lecture seule sur ses shows.

Donner un accès : insérer dans `user_shows (user_id, show_id, role)`.
Promouvoir admin : `update profiles set type = 'admin' where email = '...';`
