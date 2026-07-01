# Vadim — contrat de serveur MCP + revue d'accès

> Vadim est un **agent externe** (stack OpenClaw, avec sa propre voix/comms —
> ex. notifications Telegram) qui **consomme** le serveur MCP Magellan pour une
> boucle de relance quotidienne/hebdo. Connexion à sens unique : **Vadim appelle,
> Magellan répond**. Magellan reste mince (ni ordonnanceur, ni notifications).
>
> Endpoint MCP : `https://magellan.collision.studio/api/mcp`

## Contrat (fourni par Matt, 2026-06-28)

**Outils utilisés par la boucle** : `list_cibles`, `log_touche`, `update_cible`, `add_appui`.

**Champs critiques à ne jamais casser** (tri décroissant de la boucle, présents en
projection compacte) : `voie`, `jours_depuis_touche`, `stage_key`,
`nb_relais_actionnables`, `dernier_signal_date`/`pertinence`/`signal_frais`, `score`, `badges`.

**Corrections demandées** : résolution par ID (accepter le nom, renvoyer l'ID,
désambiguïser sinon n'écrire rien) ; **idempotence** des écritures (retries).

**Garanties** : synchro Folk à chaque écriture ; réponses structurées, **clés stables**
(ne pas renommer une clé sans prévenir Vadim).

**Auth** : credential dédié Vadim, portée **lecture + log_touche + update_cible + add_appui**.
**Aucun endpoint destructif ni admin exposé à ce client.**

**Phase 3 (optionnel, ne pas construire avant besoin réel)** : webhook Magellan→Vadim
sur changement d'étape / nouveau signal. Seul cas où Magellan initie.

## Revue d'accès — état vs contrat (2026-06-28)

| Exigence du contrat | État Magellan | Action |
|---|---|---|
| Champs critiques en compact (score, badges, voie, jours, stage_key, nb_relais_actionnables, signal…) | ✅ tous présents dans `list_cibles` compact | — |
| Résolution par ID + désambiguïsation, ne rien écrire si ambigu | ✅ `resolveCible` (unique ou rien) ; les écritures renvoient désormais `cible_id` | fait |
| Idempotence des écritures | ✅ **`log_touche` : `idempotency_key`** (migration 0023) ; `add_appui` idempotent par nom | fait |
| Synchro Folk à chaque écriture | ⚠️ `log_touche`/`add_appui`/`add_contact` synchronisent Folk ; **`update_cible` ne synchronise pas** | à décider (mineur) |
| Clés stables | ✅ convention respectée | — |
| **Portée restreinte (pas de destructif/admin pour Vadim)** | ❌ **AUJOURD'HUI, tout compte authentifié voit TOUS les outils** — dont `delete_appui`, `delete_touche`, `archive_cible`, `sync_google_contacts`, `enrich_*` | **À CONSTRUIRE — bloquant avant de donner un credential à Vadim** |
| Notifications Telegram | N/A — **côté Vadim**, pas Magellan | rien à faire côté serveur |
| Webhook Phase 3 | non construit (volontaire) | ne pas construire |

### Le point bloquant : le scoping
Magellan n'a pas de **portée par client**. Un credential Vadim, tel quel, donnerait
accès aux outils **destructifs**. Le contrat l'interdit explicitement. Deux options
(décision Matt requise avant implémentation) :

- **Option B (recommandée)** : un **second endpoint** `/api/loop/mcp` (ou similaire)
  qui n'enregistre QUE les outils de la boucle (lectures + `log_touche` +
  `update_cible` + `add_appui`). Vadim se connecte à cet endpoint → les outils
  destructifs sont **physiquement absents**, rien à filtrer par requête. Isolation nette.
- **Option A** : garder un seul endpoint et **bloquer les outils destructifs** selon
  l'identité/scope du token (allowlist d'emails « boucle » en env). Plus léger, mais
  filtrage par requête, moins étanche.

*(Cf. aussi `docs/DEPLOY.md` pour la frontière de déploiement et `docs/BACKLOG.md`.)*
