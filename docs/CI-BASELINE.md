# Allumer la chaîne CI (P1/P2) — baseline + secrets

> OBSOLÈTE (décision actée du 24/07, handoff Fable) : les migrations restent
> MANUELLES, la CI n'applique aucun SQL. L'étape migrations de deploy.yml a
> été retirée ; la baseline ci-dessous ne sert plus qu'en cas de revirement
> futur. La CI des PR (ci.yml), elle, tourne depuis le début.

But : que chaque merge sur `main` applique les migrations puis déploie, sans
jamais recoller de SQL à la main. Deux gestes : baseline (une fois) + secrets.

## 1. Baseline (une seule fois, éditeur SQL Supabase)

Les migrations 0001→0031 sont DÉJÀ appliquées à la main. Il faut le dire à
Supabase, sinon le premier `supabase db push` tenterait de les rejouer et
échouerait (objets déjà existants). Ce SQL déclare l'historique comme appliqué.

```sql
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version    text primary key,
  statements text[],
  name       text
);
insert into supabase_migrations.schema_migrations (version, name) values
  ('0001','schema'), ('0002','rls'), ('0003','functions'), ('0004','contacts'),
  ('0005','auto_onboard'), ('0006','user_prefs'), ('0007','appui_link'),
  ('0008','validation_board'), ('0009','folk_link'), ('0010','episode_calendar'),
  ('0011','watchlist'), ('0012','appui_nature'), ('0013','cible_archive'),
  ('0014','appui_contacts'), ('0015','google_contacts'), ('0016','watchlist_create'),
  ('0017','note_priorite'), ('0018','score_relais'), ('0019','photo_ville'),
  ('0020','personne_geo'), ('0021','personne_raison'), ('0022','mcp_audit'),
  ('0023','touche_idempotence'), ('0024','touche_resultat'), ('0025','cible_playbook'),
  ('0026','enrichment_jobs'), ('0027','portier_appui_folk'), ('0028','view_explicite'),
  ('0029','folk_mirror'), ('0030','cible_snooze'), ('0031','episode_fiche')
on conflict (version) do nothing;
```

Résultat attendu : « Success ». Après ça, `db push` verra 0001→0031 comme
appliquées et n'exécutera que les migrations FUTURES (0032+).

## 2. Secrets GitHub (P1) — repo mattintouch/Collision → Settings → Secrets and variables → Actions

Onglet **Secrets** :
- `SUPABASE_ACCESS_TOKEN` : jeton personnel Supabase (Account → Access Tokens).
- `SUPABASE_DB_PASSWORD` : mot de passe base (Project Settings → Database).
- `SUPABASE_PROJECT_REF` : la référence du projet (Project Settings → General,
  ou le sous-domaine de l'URL Supabase).
- `VERCEL_DEPLOY_HOOK` : URL du Deploy Hook (voir P2).

(Le workflow deploy.yml lit exactement ces noms.)

## 3. Deploy Hook Vercel (P2)

1. Vercel → projet `magellancollision` → Settings → Git → **Deploy Hooks**.
2. Créer un hook (nom « ci », branche `main`) → copier l'URL → la poser dans le
   secret GitHub `VERCEL_DEPLOY_HOOK`.
3. **Après un premier merge réussi via la chaîne**, couper l'auto-deploy Vercel
   sur `main` (Settings → Git → Production Branch / Ignored Build Step) pour que
   la chaîne CI soit la seule voie de prod. Jamais avant le premier succès.

## 4. Vérifier

Faire un petit commit sur `main` (ou re-merge). L'onglet **Actions** doit montrer
`deploy` : Typecheck + tests → migrations (rien à appliquer, tout est baseliné)
→ Deploy Hook. Une migration future cassée bloquera le déploiement, dans l'ordre.
