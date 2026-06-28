# Magellan — Déploiement (règle durable)

> Comment le site passe en production. Lis ça avant de toucher au déploiement.

## ⛔ Frontière de déploiement — Magellan ↔ Collision Studio (RÈGLE DURE)

Magellan se déploie **uniquement** sur `magellan.collision.studio`, projet Vercel
**`magellancollision`** — id `prj_q3c1aM5zRB1mAWOZxhs49VPVUyUT`, team
`mattintouchs-projects` (`team_rqk6MLWrEtE42BcrAx1SxTlz`).

Sur la **même team** existe un AUTRE projet, **`collision-studio`**
(id `prj_G9qKeTuNETz6ElANDkfSdkvMHDaa`), qui sert le site marketing sur
`collision.studio` et `www.collision.studio`. **Ne jamais le toucher** — géré ailleurs.

1. **GitHub** : le repo `mattintouch/Collision` doit être lié *uniquement* à
   `magellancollision`. S'il apparaît dans un autre projet Vercel → signaler à
   Matthieu, ne pas corriger soi-même.
2. **Vercel CLI/API** : toujours scoper à ce projet
   (`--scope mattintouchs-projects`, cwd avec le bon `.vercel/project.json`).
   Avant tout `vercel deploy`/`vercel domains`, vérifier
   `cat .vercel/project.json` → doit montrer `prj_q3c1aM5zRB1mAWOZxhs49VPVUyUT`.
   Sinon STOP + prévenir Matthieu (mauvais dossier).
3. **Domaines** : ne configurer que `magellan.collision.studio` (et
   `*.magellan.collision.studio`). Jamais l'apex `collision.studio` ni `www`.
4. **DNS (OVH, zone `collision.studio` partagée)** : ne modifier que le record
   `magellan`. Jamais `A @`, `CNAME www`, `MX`, `SPF`, `DKIM`, `_resend.*`, NS.
5. **Env vars** : ne jamais réutiliser les secrets du projet marketing
   (`RESEND_API_KEY`…). Besoin de clés → les demander à Matthieu.

> Incident évité par ces règles : un push sur `mattintouch/Collision` avait
> déclenché un auto-deploy sur `collision-studio` (qui hébergeait temporairement
> la même intégration GitHub) → `www.collision.studio` a redirigé vers
> `/gdiy/board` ~15 min. Lien GitHub côté marketing supprimé depuis.

> Note : `.vercel/` est gitignoré → le `project.json` n'est pas versionné ; ces
> ids font foi. Les déploiements se font par **push git** (pas de CLI), donc le
> risque CLI ne se présente que si quelqu'un lance Vercel à la main.

## La règle (zéro manipulation côté Matt)

La production est **`https://magellan.collision.studio`**, hébergée sur **Vercel**,
connectée au repo GitHub `mattintouch/Collision` (depuis le 21/06).

**Branche de production (réglage Vercel actuel) : `claude/magellan-collision-studio-xsi8k6`.**

➡️ **Pousser un commit sur cette branche = déploiement automatique en prod.**
C'est tout. Pas de bouton à cliquer, pas de réglage à changer au quotidien.

Vérifier qu'un déploiement est bien en ligne : Vercel → **Deployments** → le
déploiement **Production** du haut doit afficher le **SHA = HEAD de la branche**,
statut **Ready**, domaine `magellan.collision.studio`.

## `main`

`main` existe et est **maintenu en miroir** de la branche de prod (même commit).
Ce n'est **pas** la branche déployée aujourd'hui, mais elle est toujours à jour :
le jour où l'on bascule Vercel sur `main`, tout est déjà prêt.

Convention pour toute session/agent : après un push sur la branche de prod,
mettre `main` au même commit —
`git push origin claude/magellan-collision-studio-xsi8k6:main`.

## Migrations Supabase (manuel, important)

Les migrations SQL (`supabase/migrations/00xx_*.sql`) ne sont **pas** appliquées
par le déploiement. Il faut les exécuter à la main dans Supabase (SQL editor)
**avant** le redeploy qui en dépend, sinon l'app plante sur une colonne absente.

## Amélioration optionnelle (un jour, 2 min avec quelqu'un de technique)

Pour une convention plus standard (prod = `main`, branche `claude/…` = dev) :
Vercel → **Settings → Environments → Production → Branch Tracking** → mettre
**`main`** → Save. Non requis : l'actuel fonctionne et est stable.

> Note annexe (hors Magellan) : la branche **par défaut** du repo GitHub est
> `claude/european-series-landing-QTvs6` (un autre projet). Sans impact sur le
> déploiement Magellan, mais à savoir si tu ouvres des PR.
