# Revue complète de Magellan

Document de passation pour une repasse générale par Claude (Fable).
Rédigé le 17 juillet 2026 par Claude Code, à la demande de Matthieu Stefani.
Le brief du commanditaire figure en section 12, augmenté en section 13.

---

## 1. Ce qu'est Magellan

Magellan est le moteur de conquête et de closing des podcasts de Collision
Productions. Trois shows : GDIY (Génération Do It Yourself, pipe invités,
navire amiral), CCG, Fleurons (pipe thématique). Utilisateurs : Matthieu
Stefani (hôte, décideur), Clémence Lepic (production), Matéo Dos Santos
(logistique), et un assistant IA maison, Vadim (OpenClaw), qui envoie les
mails et sert d'identité d'expéditeur.

Le produit couvre la chaîne complète : identifier des cibles (invités
potentiels), les qualifier et les scorer, tracer chaque touche, activer des
appuis (relais d'introduction), valider un enregistrement (invitation
Calendar automatique, studio réservé), générer une fiche de préparation
d'épisode par deep research, la challenger en équipe via MCP, et l'utiliser
en plateau comme console d'enregistrement.

Deux interfaces : l'app web « Cockpit » (board de pipe, dossiers de cibles,
page Aujourd'hui, stats, veille, copilote) et les fiches épisode
(`/fiches/{slug}`, design système GDIY distinct). Deux canaux d'action :
l'app elle-même, et surtout le serveur MCP consommé depuis Claude
(claude.ai, app desktop), qui est devenu le canal principal d'usage.

## 2. Objectifs produit et trajectoire

Objectif fondateur : industrialiser la conquête d'invités sans perdre la
discipline éditoriale maison (voie froide devant, relance toujours motivée,
peu de cibles bien choisies plutôt que du volume).

Trajectoire récente (deux semaines de sprint) :
- v1.1 : enrichissement asynchrone (S3), page Aujourd'hui (S5), hygiène API
  MCP (LOT H : registerTool + schémas zod stricts, erreurs structurées,
  create_cible atomique), scoring d'actionnabilité, portiers sur les appuis.
- Production épisode : invitation Calendar complète (texte logistique validé,
  FR/EN), mails de prep invité/staff (gabarits distincts, VCF individuels),
  identité d'envoi Vadim (impersonation Gmail d'une adresse principale,
  From sur alias), healthchecks d'intégrations.
- Fiches structurées : 3 itérations produit en 4 jours. Brief initial
  (19 sections, JSON par section, versioning, commentaires, statuts), puis
  handoff design GDIY (2 versions : PRÉPA/LIVE puis vue unique fusionnée),
  puis contrat v2 (Bloc A comprendre / Bloc B console, mécanique du succès,
  rigueur sources, URLs vérifiées), puis doctrine de profondeur (extraire le
  système, 3 familles de mécaniques, 3 couches, archétypes).
Ce rythme d'itération est une donnée de conception : le produit doit encaisser
des pivots hebdomadaires sans casse (d'où sections adressables, alias de
migration, contrats par section).

## 3. Architecture technique

- Next.js 14 App Router (TypeScript, Tailwind côté Cockpit), déployé sur
  Vercel (plan Hobby : contrainte structurante, voir §8).
- Supabase/Postgres. Deux clients : `createClient` (RLS, app authentifiée) et
  `createServiceClient` (service role, MCP et génération). ~35 migrations SQL
  appliquées à la main par Matthieu (registre docs/MIGRATIONS-EN-ATTENTE.md),
  pas encore de chaîne CI de migration.
- MCP : `mcp-handler` + SDK 1.26. Endpoint principal OAuth (HS256 maison,
  scopes read/write/admin, fail-open sur jetons legacy sans scope), endpoint
  restreint `/api/loop/mcp` pour la boucle Vadim (allowlist LOOP_TOOLS,
  lecture + 3 écritures, rien de destructif). ~37 outils exposés.
- Google : compte de service + délégation domaine (JWT jose). Gmail (envoi,
  impersonation d'adresse principale, From alias), Calendar (invitations,
  studio, injection du lien fiche). Contacts (sync par lots).
- Folk (CRM miroir) : écriture des touches, alliés, coordonnées.
- Anthropic : recherche web (`web_search` server tool) pour enrichissement et
  génération de fiches. Modèles : Haiku 4.5 en file rapide (drainage
  waitUntil), Sonnet en cron profond. Copilote in-app sur Opus.
- File de jobs : table `enrichment_jobs` réutilisée pour la génération de
  fiches (objectif `fiche:<groupe>`). Drainage : `kickQueue()` (waitUntil,
  budget ~50 s, 2-3 jobs) déclenché par les appels MCP chauds, l'ouverture
  des fiches et la page Aujourd'hui ; cron quotidien en secours (Hobby).
  Retry 2 tentatives, requalification des jobs bloqués après 10 minutes.

## 4. Modèle de données (essentiel)

- `shows` (config par show : expéditeur, staff avec flag in_vcf), `stages`
  (étapes de pipe), `cibles` (+ vue `cibles_enrichies` : score, badges,
  résurgence), `contacts` (typés, dont « portier »), `appuis` (+ coordonnées),
  `touches` (journal), `signals` (veille), `episodes` (Calendar, prep),
  `watchlists`, `mcp_audit` (journal des écritures MCP).
- Fiches : `fiches` (slug unique, statut draft → en_challenge → finale →
  verrouillee, version), `fiche_sections` (une ligne par section, JSON,
  position par fiche, version), `fiche_section_versions` (archive avant
  chaque écrasement, rollback), `fiche_comments` (challenge ancré),
  `fiche_notes` (matière brute, flag integrated).

## 5. Le système de fiches (cœur actuel du produit)

Catalogue de 23 sections stables (src/lib/fiche/sections.ts) :
- Chrome : sticky_header, entete, checklist_prerec, footer.
- Bloc A « comprendre » (lecture 48 h avant) : enjeu (+ leçon transférable),
  recit_canonique, mecanique_succes (obligatoire), univers (+ distinctions
  sectorielles), personnel (sourcé public uniquement), a_lire (hiérarchisé,
  URLs vérifiées).
- Bloc B « console » (pendant l'enregistrement) : trente_secondes, chiffres
  (jamais vide), parcours, playbook (section reine), entourage, anecdotes,
  tensions, questions_recurrentes, questions_reseaux (questions clips),
  sequencage, dix_questions, zone_grise, sources.

Génération : 4 recherches web par fiche (portrait, chiffres, angles,
déroulé), une par job, déclenchées automatiquement à `validate_cible` (et
manuellement par `generate_fiche`). Prompts porteurs de la doctrine (§ suiv.),
du contrat v2 (interdits d'annuaire, chiffres sourcés datés, URLs jamais
reconstruites et vérifiées en HTTP), du style maison. Robustesse acquise par
itération : plafond 8192 tokens, « finisher JSON » quand le modèle clôt son
tour en narration, erreurs verbeuses avec extrait de la réponse brute.

Doctrine de profondeur (grille permanente) : extraire le système et non
l'histoire ; mécaniques d'action, de réflexion, d'innovation ; couches A
(mécanique personnelle, 60 %), B (état de l'art, subordonnée, 20 %), C
(leçon transférable explicite, 20 %) ; calibration par archétype (fondateur
par défaut, dirigeant coté, artiste, sportif, avocat, médecin, politique en
neutralité, hybrides croisés) ; test de qualité des questions (critère,
seuil, arbitrage, cas précis).

Challenge : get_fiche / get_section (renvoie le `contrat`, l'exemple JSON
exact attendu) / update_section (versionné) / add_comment / resolve_comment /
add_note / set_status (gate : en_challenge refusé si mécanique, univers ou
chiffres vides) / suggest_questions_reseaux.

## 6. UX et UI

- Cockpit (app) : identité « papier froid, cobalt », Space Grotesk +
  JetBrains Mono. Board par étapes, dossier de cible, page Aujourd'hui
  (daily five), stats séparées closing/production, import, veille, copilote.
- Fiches : design système GDIY au pixel depuis handoff Claude Design
  (2 itérations). Noir/blanc éditorial, Tungsten Condensed/Compressed
  (woff2 auto-hébergées), mono pour labels et données, hairlines, radii 0,
  jaune #F4C435 (alertes), rouge #E63946 (REC/CLIP), crème #EFE9DC (zone
  grise). Vue unique fusionnée : header sticky avec REC (verrouillé tant que
  la checklist n'est pas 100 %), nav de blocs sticky, Bloc A en mode lecture,
  ancre `#console`, déroulé avec questions à rayer au timecode, barre
  CLIP/CARNET/RÉGIE, drawers. Bandeau d'alerte si un groupe de génération
  échoue, journal de génération en pied.
- État plateau (checklist, questions posées, chrono, carnet, régie) :
  localStorage par appareil (clé gdiy-fiche-{slug}). La régie n'est PAS
  temps réel (marquée « à venir »), c'est le premier manque UX connu.
- Accès fiches : login Magellan (Supabase auth via middleware), URLs propres
  `/fiches/prenom-nom`, jamais indexées. L'ancien système de lien signé
  (`/fiche/{uuid}?t=jwt`) subsiste en legacy.

## 7. Économie de tokens (état et pistes)

Postes de consommation Anthropic actuels :
1. Génération de fiche : 4 appels web_search (Haiku en file, Sonnet en cron),
   3-4 recherches par appel, max_tokens 8192, + finisher éventuel + retry ×2.
   Ordre de grandeur : la fiche complète coûte 8 à 12 appels modèle.
2. Enrichissement cible (profil/contacts) : Haiku, 3-5 recherches.
3. suggest_questions_reseaux : 1 appel, 4 recherches.
4. Copilote in-app : Opus, à la demande.
5. Veille (signaux) : batch.
Points d'attention pour la repasse :
- Le retry ×2 relance TOUTE la recherche (recherches web incluses) même si
  l'échec est un JSON illisible en bout de course ; le finisher couvre déjà
  ce cas, le retry complet est peut-être surdimensionné.
- Les échecs en cascade d'hier (crédit épuisé) ont montré qu'un job échoué
  se relance manuellement : pas de backoff ni de circuit breaker si l'API
  est durablement indisponible ; risque de brûler des tokens en re-kicks.
- Pas de télémétrie de coût : aucun suivi tokens/fiche, tokens/outil,
  tokens/semaine. Impossible aujourd'hui de dire ce qu'une fiche coûte.
- Le choix Haiku (file) vs Sonnet (cron) date d'une contrainte de timeout
  MCP 60 s devenue partiellement obsolète depuis le passage en jobs :
  à réévaluer (qualité/prix par groupe ; le groupe angles mérite peut-être
  un modèle supérieur, le portrait non).
- get_fiche renvoie la fiche INTÉGRALE (sections + contrats) : lourd pour le
  challenge conversationnel ; une projection compacte par défaut économiserait
  les tokens côté client Claude.

## 8. Frictions et dettes connues (honnêteté de passation)

1. Plan Vercel Hobby : cron quotidien maximum, fonctions courtes. Le drainage
   par waitUntil fonctionne mais les jobs longs meurent (timeout 10 min
   requalifié), et la génération avance par à-coups (rechargements de page).
   Un passage Pro (cron minute, maxDuration 300) simplifierait la moitié du
   système de file.
2. Connecteur MCP dans les sessions Claude Code distantes : instable (vit
   avec la présence du client). Contourné par le déclenchement automatique à
   la validation ; reste gênant pour l'exploitation à distance.
3. Migrations SQL manuelles (Matthieu copie-colle dans Supabase). La chaîne
   CI (P1/P2 + baseline) est spécifiée mais pas allumée.
4. Pas de monitoring : ni alerte crédit API (la panne d'hier a coûté une
   demi-journée), ni alerte jobs failed, ni uptime. Le journal de génération
   sur la fiche est la seule surface visible.
5. Régie non temps réel ; état plateau non partagé entre appareils ;
   commentaires de challenge non affichés sur la page fiche.
6. Legacy à purger : ancien système de fiche HTML (fiche/build.ts,
   generate.ts, css.ts, route /fiche/[episode], colonnes fiche_html), tests
   Onesta associés, LOOP_TOOLS à réviser pour inclure les outils fiches.
7. Scopes OAuth MCP : fail-open pour les jetons sans scope (décision assumée
   pour ne pas verrouiller Matthieu, à re-durcir).
8. Doublons de cibles possibles (cas Tordjman) : pas de contrainte d'unicité
   ni de fusion assistée.

## 9. Sécurité : périmètre d'audit demandé

L'audit doit couvrir au minimum :
- Le serveur MCP : OAuth maison (HS256, secret unique), gating
  requiredScope, fail-open legacy (§8.7), DESTRUCTIVE_TOOLS, audit mcp_audit
  (best-effort : est-ce suffisant ?), endpoint /api/loop/mcp.
- La RLS Supabase : cohérence des policies (lecture authentifiée, écritures
  service role), tables fiches (commentaires/notes en RW authentifié),
  risque d'accès croisé entre shows s'il y a un jour plusieurs organisations.
- Les identités Google : étendue de la délégation domaine (gmail.send,
  calendar.events, contacts), clé de service dans les variables Vercel,
  impersonation (EPISODE_SENDER), surface d'abus si la clé fuit.
- La vérification HTTP des URLs à la génération (`urlOk`) : c'est un fetch
  sortant vers des URLs fournies par un modèle : évaluer le risque SSRF
  (bloquer IP privées, schémas, redirections) même si l'environnement Vercel
  limite la portée.
- Les liens signés legacy (/fiche/{uuid}?t=jwt, durée 1 an, même secret que
  l'OAuth MCP) : à faire expirer ou séparer les secrets.
- Le middleware d'auth (matcher : exclusions statiques dont /fonts), les
  entrées non authentifiées (manifest, oauth), CRON_SECRET.
- Les contenus générés : la génération écrit du JSON rendu ensuite en React
  (échappé par défaut), mais les URLs sont rendues en <a href> : validation
  safeUrl à revoir sous l'angle attaque (javascript: est bloqué, data: ?).
- Secrets et journaux : erreurs API recopiées dans enrichment_jobs.error et
  affichées dans le journal de fiche (vérifier qu'aucun secret n'y transite).

## 10. Boucles d'amélioration automatique (demande : progresser sans Claude Code en permanence)

Existant mobilisable : mcp_audit journalise déjà chaque écriture MCP
(outil, acteur, payload, succès, détail) ; enrichment_jobs journalise la
génération ; les fiches sont versionnées section par section (les diffs
humains vs génération sont donc reconstructibles).

Pistes à instruire par la repasse, par ordre de coût croissant :
1. Alerte et bilan hebdomadaire automatiques : un cron qui compile
   mcp_audit + jobs (échecs, outils utilisés/inutilisés, temps de drainage)
   et poste un rapport (mail Vadim ou section dédiée dans l'app).
2. Boucle d'apprentissage éditoriale : à chaque set_status finale ou
   verrouillee, comparer les sections générées à leur version finale
   (fiche_section_versions) et en tirer des amendements de prompts ;
   les amendements s'accumulent dans une table `doctrine_amendements`
   injectée dans les prompts (la doctrine devient vivante sans redéploiement).
3. Outil MCP `feedback` (une ligne : ce qui a manqué en plateau), consommé
   par la même boucle.
4. Auto-review de code périodique : une Routine Claude Code planifiée
   (hebdomadaire) qui lit les journaux, propose un lot de correctifs en PR,
   et n'exige de Matthieu qu'une relecture. Point de vigilance : garder les
   migrations et les secrets hors de la boucle automatique.
5. Post-épisode : ingestion du mémo vocal post-rec et du transcript (Plaud
   est déjà connecté côté Claude) pour boucler génération → réel → doctrine.

## 11. MCP pour IA tierces (OpenClaw « Vadim » et autres)

Existant : le serveur MCP principal est déjà standard (streamable HTTP,
OAuth) et consommable en théorie par tout client MCP ; l'endpoint
/api/loop/mcp offre déjà un sous-ensemble sûr pensé pour Vadim (lecture +
log_touche, update_cible, add_appui, aucun outil destructif).
Manque pour un usage tiers réel :
- Émission de jetons par agent (API key ou client_credentials OAuth), avec
  scope et identité propres (mcp_audit distinguerait vadim / openclaw /
  autre), révocation, et quotas par agent.
- Une politique d'outils par agent (Vadim n'a pas besoin de cancel_episode).
- Une documentation d'intégration courte (URL, auth, liste d'outils, style
  des erreurs) et un environnement de test (cibles is_test).
- Décision produit : quelles écritures un agent non-Claude a le droit de
  faire sans humain dans la boucle (proposition : celles de LOOP_TOOLS,
  plus add_note/add_comment sur les fiches, rien d'autre).

## 12. Brief du commanditaire (verbatim, 17 juillet 2026)

« Peux-tu me faire une revue complète de ce qu'est Magellan, ses objectifs,
son UX, son UI, ses process, son code, etc ? L'objectif de ce récapitulatif
est de le donner à Claude (Fable) qui va faire une repasse générale, pour
voir si on ne s'est pas perdus en route, si on répond bien aux besoins de
GDIY et des autres podcasts, si on ne consomme pas trop de tokens
inutilement, si on consomme les bons tokens, et surtout ce qu'on peut faire
en mieux, plus précis. J'aimerais voir comment on peut améliorer Magellan en
boucles automatiques avec notre usage, sans avoir à venir sur Claude Code en
permanence, si c'est possible. Avec aussi une demande d'audit de sécurité.
Et la création d'un MCP pour que je puisse faire dialoguer d'autres IA et
mon assistant OpenClaw "Vadim" avec Magellan. »

## 13. Brief augmenté : questions à trancher par Matthieu

Posées du point de vue combiné ingénieur de premier rang, consultant
éditorial et mentor stratégique. Chaque réponse oriente la repasse.

Stratégie et périmètre
1. Magellan restera-t-il un outil interne mono-équipe, ou a-t-il vocation à
   servir d'autres productions (multi-tenant) ? La réponse change l'audit
   sécurité (RLS par organisation), le modèle de jetons MCP et le niveau
   d'industrialisation à viser.
2. Quel est LE indicateur de succès de Magellan à 6 mois : nombre d'épisodes
   closés, délai cible→enregistrement, qualité de fiche (note de Matthieu
   après plateau), temps d'équipe économisé ? Sans métrique élue, la repasse
   optimisera au jugé.
3. CCG et Fleurons : le système de fiches doit-il leur être étendu (avec
   quels archétypes, quelle doctrine propre), ou GDIY reste-t-il seul servi
   en 2026 ?
4. Le budget mensuel acceptable pour l'API Anthropic (génération + veille +
   copilote) : quel plafond ? Faut-il une coupure automatique ou une alerte
   à 80 % ?
5. Vercel Hobby : le passage Pro (~20 $/mois) supprime la moitié de la
   complexité de la file. Y a-t-il une raison de ne pas le faire ?

Éditorial
6. La fiche idéale, à froid : combien de minutes de lecture pour le Bloc A ?
   (La doctrine dit « lu 48 h avant » ; la génération actuelle produit
   10-15 minutes ; faut-il une contrainte de longueur par section ?)
7. Après un enregistrement, qu'est-ce qui a le plus manqué à la fiche ?
   (Un exemple concret par épisode nourrirait la boucle d'apprentissage
   mieux que toute spéculation.)
8. Le challenge Matthieu/Clémence : sur les fiches déjà passées, quelles
   sections avez-vous récrites en profondeur ? (fiche_section_versions le
   dira : autoriser la repasse à analyser ces diffs ?)
9. Les questions clips en plateau : lesquelles ont réellement produit un
   short publié ? Un marquage « clip utilisé » fermerait la boucle.

Boucles automatiques
10. Quel canal pour les rapports automatiques : mail de Vadim, section dans
    l'app, message Claude ? Et quelle fréquence (hebdo semble juste) ?
11. Jusqu'où l'automatisation a-t-elle le droit d'aller sans validation :
    amender ses propres prompts ? ouvrir des PR de code ? appliquer des
    migrations ? (Recommandation : oui / oui avec relecture / jamais.)

MCP tiers
12. Qui sont les agents visés au-delà de Vadim (outil interne d'un tiers,
    GPT, agent de Clémence ?) et quelles ACTIONS doivent-ils pouvoir faire,
    précisément ? La liste blanche d'outils par agent découle de là.
13. Vadim (OpenClaw) : parle-t-il MCP nativement ou faut-il aussi une API
    REST simple en parallèle ?

Sécurité et gouvernance
14. Qui d'autre que toi a (ou aura) un compte Magellan et un jeton MCP ?
    Faut-il des rôles par personne (Clémence en write sans admin) ?
15. Les fiches contiennent de la matière sensible (zone grise, personnel,
    notes internes sur des personnes réelles). Quelle politique de rétention
    et d'accès veux-tu par défaut (purge après diffusion ? accès Clémence
    partout ?) ?

## 14. Où tout se trouve

- Code : github.com/mattintouch/collision (branches main et
  claude/magellan-collision-studio-xsi8k6, synchrones).
- Docs internes : docs/ (BRIEF-CLAUDE-CODE, ADDENDUM-LANCEMENT,
  MIGRATIONS-EN-ATTENTE, INFRA-IDENTITE, SESSIONS-RESTANTES,
  design-fiches-gdiy/ : brief, README handoff, prototype, CONTRAT-FICHE-V2,
  DOCTRINE-PROFONDEUR, WORKFLOW-CHALLENGE).
- Tests : 103 (vitest), contrats MCP, scopes, MIME, domaine, fiches.
- Production : magellan.collision.studio (Vercel), Supabase, connecteur MCP
  « Magellan » dans claude.ai.
