# Magellan — Déploiement (règle durable)

> Comment le site passe en production. Lis ça avant de toucher au déploiement.

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
