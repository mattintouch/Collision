# MCP FEEDBACK

Journal des frictions, régressions et constats rencontrés EN USAGE RÉEL des
outils MCP de Magellan. Pratique citée par les briefs (contrat v3, v3.1,
handoff du 24/07) : ce fichier est la directive permanente. Une entrée par
constat, datée, avec l'état (ouvert, corrigé, hors périmètre) et le correctif
le cas échéant. Fable s'y documente pendant le travail MCP réel.

## 24/07/2026 — P0 du handoff : confirmation des deux régressions d'écriture

1. **update_cible sur une personne (raison_de_selection, secteur, pays)** :
   CORRIGÉ, confirmé par test. Les quatre champs (role inclus) s'écrivent sur
   une cible personne de test. Correctif d'origine : migration 0036
   (ré-assertion des contraintes kind) + messages actionnables (PR 1).
2. **enrich_cible avec apply=true** : CORRIGÉ, confirmé par test réel sur
   Tarik Benabdallah (gdiy). Job abouti, écriture NON destructive vérifiée :
   raison_de_selection et sujets remplis, 2 réseaux ajoutés, les champs déjà
   remplis (role, organisation, secteur, pays) non touchés.
   La passe d'enrichissement de masse peut démarrer.
3. **Constat annexe du test 2 (nouveau, corrigé dans la foulée)** : les
   balises de citation de l'API (`<cite index="...">`) fuyaient dans les
   champs écrits (vu sur raison_de_selection de Tarik). Correctif :
   stripCitations appliqué à toute sortie JSON de la recherche web
   (src/lib/ai/websearch.ts), donnée de Tarik nettoyée à la main via
   update_cible. Les fiches générées avant le correctif peuvent porter des
   balises résiduelles : la passe de rédaction les nettoiera à la prochaine
   régénération.
4. **Méthodologie** : un test apply=true sur une cible fictive échoue en
   « recherche sans résultat exploitable » sans exercer le chemin d'écriture.
   Tester les chemins d'écriture d'enrichissement sur une cible RÉELLE à
   champs partiellement vides (l'écriture est non destructive).

## 24/07/2026 — correction d'un constat erroné du récap du 22/07

Le récap envoyé à Fable affirmait « 173 tests verts mais lancés à la main,
la CI n'est pas allumée ». C'était FAUX : deux workflows GitHub Actions
(ci.yml : typecheck + tests + smoke MCP sur chaque PR et chaque push de
branche claude/** ; deploy.yml : garde de main) tournent depuis le début,
tous les runs récents sont verts. La tâche 5 du handoff, fondée sur ce
constat, est donc déjà satisfaite pour l'essentiel ; le seul écart réel
était l'étape de migrations automatiques de deploy.yml (inerte, gardée par
des secrets jamais posés) qui contredisait la décision actée « migrations
manuelles » : retirée. Leçon : vérifier l'existence d'un mécanisme
(.github/workflows, runs Actions) avant de l'affirmer absent dans une revue.

## Historique repris des briefs précédents

1. 17/07 : dérive base/registre sur la contrainte kind (0001 encore active
   malgré 0021). Leçon au registre des migrations : vérifier la contrainte
   réelle en base avant de chercher un bug de code. CORRIGÉ (0036).
2. 20/07 : `get_fiche` renvoie 55 Ko et plus, coûteux en tokens sur chaque
   aller-retour de challenge. OUVERT, correctif prévu (paramètre sections,
   tâche 4 du handoff). Noter la contrainte MCP : un nouveau paramètre
   tableau n'est utilisable que dans une conversation neuve et peut arriver
   typé en chaîne dans une session déjà ouverte.
3. 21/07 : le connecteur MCP claude.ai vit avec la présence du client de
   l'utilisateur ; les relances asynchrones pilotées depuis Claude Code
   doivent prévoir un réessai (déconnexions fréquentes entre deux messages).
   COMPORTEMENT STRUCTUREL, contourné par retries programmés.
