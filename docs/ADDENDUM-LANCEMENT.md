# Addendum de lancement (à donner à Claude Code AVEC le brief et les 3 fichiers)

## Prompt de lancement (à coller tel quel dans Claude Code)

```
Voici le brief consolidé (BRIEF-CLAUDE-CODE.md), le gabarit de fiche
(GABARIT-FICHE.md + fiche-gdiy-onesta_1.html) et le workflow CI (deploy.yml).

Mode d'exécution : AUTONOMIE MAXIMALE. Je suis indisponible 2 jours.
Règles :
1. Commite d'abord : deploy.yml dans .github/workflows/, le gabarit et sa
   spec dans docs/gabarits/, le brief dans docs/.
2. Exécute les sessions DANS CET ORDRE, sans m'attendre :
   S1a (code du runner ; il s'activera quand je poserai les secrets)
   → S1b (vue explicite + vitest 3 familles + smoke-mcp)
   → S1bis (suppression mode démo)
   → S2 partie scopes + audit (ne dépend pas de moi)
   → S2 partie Calendar compte de service : CODE-LA derrière un flag
     d'env GOOGLE_DELEGATION_READY=false ; bascule à true quand j'aurai
     fait la délégation Workspace
   → S4 (Folk : vérifie d'abord 15 min si l'API a une recherche)
   → S5 (Aujourd'hui + playbook + daily_five, remplace Dispo)
   → S6 (endpoint /api/loop/mcp)
   → S7 (feedback score)
   → S9 et S10 : code complet derrière le même flag
     (invitation enrichie + VCF + mails de prep + route /fiche/[episode]
     + génération depuis le gabarit).
3. Chaque session se termine par son test d'acceptation exécuté par toi
   (vitest + smoke-mcp, jamais le connecteur claude.ai comme seul juge)
   et UNE ligne de rapport : session, commit, acceptation OK/KO, reste.
4. Les 14 décisions du brief sont tranchées : ne les rouvre pas. Si tu
   rencontres un vrai bloquant, contourne-le proprement, note-le dans
   docs/BACKLOG.md section « À arbitrer », et continue la session suivante.
5. Migrations : tant que les secrets CI ne sont pas posés, continue à les
   appliquer manuellement AVANT de pousser, comme aujourd'hui. Dès que je
   te confirme les secrets + le hook, la CI prend le relais et tu arrêtes
   le manuel.
6. Style de tout texte utilisateur : pas de tiret cadratin, pas de « on »,
   sujet-verbe-complément, pas d'emoji.
À la fin, produis un rapport unique : sessions livrées, acceptations,
liste exacte de ce qui attend mes 5 gestes.
```

## Les 5 portes où Matt est requis (rien d'autre)

| Porte | Geste | Durée | Débloque |
|---|---|---|---|
| P1 | Secrets GitHub Actions : SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, SUPABASE_PROJECT_REF | 5 min | CI migrations |
| P2 | Vercel : couper l'auto-deploy main + créer le Deploy Hook + le poser en secret VERCEL_DEPLOY_HOOK | 5 min | Séquence migrations→deploy |
| P3 | GitHub : protéger main (no force push) | 2 min | Hygiène |
| P4 | Admin Workspace : délégation domaine du compte de service, scopes contacts + calendar + gmail.send, impersonation matt@collision.studio ; puis GOOGLE_DELEGATION_READY=true dans Vercel | 10 min | S2 Calendar, S9, S10 |
| P5 | Recette Camille (3 gestes connecteur) + test épisode avec Clémence | 10 min | Validation 0027 + acceptation S2 |

P1 et P3 sont faisables immédiatement, indépendamment de tout.
P2 attend que deploy.yml soit commité (sinon plus aucun déploiement).
P4 est faisable immédiatement aussi ; seul le flag attend le code.
