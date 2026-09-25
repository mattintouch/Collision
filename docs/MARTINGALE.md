# La Martingale dans Magellan

Brief du 25 septembre 2026 (Matt), source : spec workflow v2 de Lhou Lagrange
du 23 septembre. Ce document porte l'état des prérequis, les décisions prises
sans arbitrage et les questions encore ouvertes.

Cadre rappelé : Magellan est la source de vérité, Notion passe en lecture seule
après un import unique, aucun enum Postgres nouveau, toute écriture large passe
par une simulation, et les étapes GDIY ne sont jamais clonées.

## 1. Prérequis

### 1.1 CRON_SECRET et crons Vercel : en place

`CRON_SECRET` est bien renseigné sur Vercel (cible production). Les crons
déclarés dans `vercel.json` sont l'enrichissement (toutes les 5 minutes), le
récap hebdo (lundi 06h00 UTC), le rebouclage du backlog (05h00 UTC) et
désormais les automatisations La Martingale (06h30 UTC).

En revanche, la « Routine hebdomadaire GDIY » ne repart pas, parce qu'elle n'a
jamais tourné : constat du 21/09, aucune Routine de ce nom n'a jamais été créée
sur le compte, alors que son endpoint et son prompt étaient écrits depuis le
20/07. Elle a été remplacée le 21/09 par le lancement en un clic depuis le
récap du lundi. Cette chaîne attend une seule chose pour être active :
`DEV_LINK_SECRET` dans les variables d'environnement Vercel.

Point de sécurité relevé au passage, sans rapport avec ce brief mais à traiter :
`MCP_OAUTH_SECRET` est enregistré en type « encrypted » et Vercel le signale
`readable-secret`, alors que tous les autres secrets du projet sont en type
« sensitive », non lisibles depuis l'API. À repasser en « sensitive ».

### 1.2 Identité d'envoi par show : décision à prendre

Aujourd'hui, tout part de la boîte impersonée par le compte de service
(`GMAIL_IMPERSONATE`, domaine Collision). Les colonnes `sender_email` et
`sender_name` existent déjà sur `shows` (migration 0033, appliquée en base
malgré ce qu'indiquait le registre), mais **aucun code ne les lit** : le
mécanisme d'expéditeur par show reste à construire, quelle que soit l'option
retenue. La migration 0055 renseigne `lhou@orsomedia.io` et `Lhou Lagrange` sur
le show : c'est l'intention, pas encore l'implémentation.

**Option 1, délégation Google Workspace sur orsomedia.io.**
Prérequis : Orso est sur Google Workspace, et un administrateur Orso autorise
le compte de service Magellan (son client ID, scope `gmail.send`) dans la
console d'administration, exactement comme cela a été fait pour
collision.studio. Coût d'exploitation : nul une fois posé. Aucun jeton à
renouveler, aucun reconsentement, aucune expiration. Le code à écrire se réduit
à lire `shows.sender_email` et à impersonner cette boîte au lieu de la boîte par
défaut. Risque : la décision appartient à un administrateur d'une autre
organisation, et l'option tombe si Orso n'est pas sur Workspace.

**Option 2, connexion OAuth de Lhou avec refresh token.**
Prérequis : un écran de consentement Google, le scope `gmail.send` qui est un
scope sensible, et un stockage chiffré du refresh token côté Magellan. Coût
d'exploitation : récurrent. Un refresh token Google se révoque tout seul dans
plusieurs cas (changement de mot de passe, révocation manuelle, longue
inactivité) ; il faut donc surveiller l'expiration, détecter la panne d'envoi et
refaire consentir Lhou. Le code à écrire est nettement plus gros : flux
d'autorisation, stockage, rafraîchissement, gestion des révocations. Avantage :
aucune dépendance à un administrateur Orso, et cela fonctionne même sur une
adresse hors Workspace.

**Recommandation : option 1.** Elle est la moins coûteuse à exploiter, de loin,
et réutilise une mécanique déjà en production. La seule question à poser à Orso
est : « êtes-vous sur Google Workspace, et un admin peut-il autoriser un compte
de service sur le domaine ? ». Si la réponse est non, l'option 2 devient la
seule possible, et son coût de maintenance doit être accepté d'avance.

**Rien n'est implémenté** tant que Matt n'a pas tranché, conformément au brief.

### 1.3 Accès restreint à un seul show : en partie livré

État des lieux, en trois morceaux.

**Côté application, cela existait déjà et fonctionne.** La RLS filtre par show
depuis la migration 0002 : `user_shows` porte les accès, `has_show_access` et
`can_write_show` les appliquent sur les shows, étapes, cibles, appuis, touches,
signaux et épisodes. Aucun développement n'était nécessaire là.

**Côté connecteur MCP, le périmètre n'existait pas, et c'était le vrai trou.**
Les outils MCP passent par le client service role, qui contourne la RLS par
construction. Un membre restreint à La Martingale voyait donc tout GDIY dès
qu'il branchait son connecteur. C'est livré ici : le jeton d'accès porte
désormais la liste des shows autorisés quand le membre est `externe`, chaque
appel d'outil s'exécute dans un contexte qui porte cette liste, et les points de
résolution la consultent (un show par slug ou par id, une cible par id, la liste
des shows). Hors périmètre, la ressource répond introuvable plutôt
qu'interdite : un externe n'a pas à apprendre l'existence des shows des autres.
Pour débrancher : cesser de poser `shows` dans le jeton.

**L'accueil des nouveaux membres était contradictoire avec tout cela.** Le
trigger de la migration 0005 donnait à chaque nouvel arrivant le rôle interne et
l'accès à tous les shows, au motif que la connexion Google était restreinte aux
domaines de la maison. La migration 0055 le corrige : un membre d'un domaine de
la maison garde le comportement actuel, un membre d'un autre domaine arrive en
`externe` sans aucun show, et Matt lui ouvre le sien à la main.

**Le périmètre se lit dans `user_shows`, jamais dans le rôle.** Le rôle dit ce
qu'un membre a le droit de faire (lire, écrire), `user_shows` dit où : ce sont
deux questions distinctes, et les confondre coûte cher. Une première version de
ce chantier posait le périmètre pour les seuls membres `externe` ; or un
`externe` n'a que le scope lecture côté MCP. Lhou aurait donc été enfermée en
lecture seule, alors que le brief lui demande de travailler sur son show. Un
membre qui a accès à tous les shows n'a pas de périmètre du tout, ce qui laisse
l'équipe actuelle strictement inchangée.

**Reste à faire, côté configuration, hors code.**
1. Ajouter `orsomedia.io` à `GOOGLE_OAUTH_ALLOWED_DOMAINS` sur Vercel. Sans
   cela, Lhou ne peut pas se connecter du tout : la liste par défaut est
   `stefani.fr,collision.studio`.
2. Après leur première connexion, ouvrir `la-martingale` à Lhou et Christofer
   (une ligne `user_shows` chacun, la requête est dans la migration 0055), et
   retirer les lignes `user_shows` que le trigger aurait posées ailleurs si
   leur compte existait avant la migration 0055.
3. Laisser leur `profiles.type` à `interne` : c'est ce rôle qui ouvre l'écriture
   côté connecteur, et le périmètre vient de `user_shows`. Puis reconnecter leur
   connecteur : rôle et périmètre sont figés dans le jeton à son émission.

## 2. Décisions prises sans arbitrage

1. **`priorite` n'est pas touchée.** Le brief demande un texte à deux valeurs,
   `normale` et `haute`. La colonne existe déjà en enum Postgres partagé avec
   GDIY (`haute`, `moyenne`, `basse`). Changer un enum partagé pour renommer une
   valeur coûterait plus que l'équivalence : « normale » se lit « moyenne », qui
   est déjà la valeur par défaut. Les délais de relance reposent sur cette
   lecture.
2. **Les nouveaux champs ouverts sont du texte avec CHECK**, conformément au
   cadre : `statut_sortie`, `mode_envoi`, type et statut des calls, type et
   statut des brouillons. Les familles de thème sont une table de référence.
3. **Les brouillons d'email ont leur table.** Le brief 2.5 impose que toute
   relance, refus, brief, logistique ou sortie de La Martingale soit un
   brouillon jusqu'à validation : cela demande un endroit où les poser.
   `email_brouillons` sert à cela, et GDIY ne l'utilise pas.
4. **La date de publication se lit dans les touches.** La règle « publié depuis
   14 jours » a besoin d'une date de passage en publié. Plutôt qu'une colonne de
   plus, le passage écrit une touche de canal `publication`, et la date de
   diffusion sert de repli.
5. **Le cron tourne à 06h30 UTC**, après le rebouclage du backlog de 05h00 et le
   récap du lundi de 06h00, pour ne pas croiser leurs écritures.

## 3. Hypothèses, maintenues telles quelles

Ces points sont marqués Hypothèse dans la spec de Lhou. Ils le restent ici, et
le code ne tranche pas à sa place.

1. **Déclencheurs de `redac_a_faire` et `en_montage`** (brief 2.1, étapes 9 et
   10). Les deux étapes existent dans le pipe, mais aucune automatisation ne les
   alimente : les transitions restent manuelles tant que Lhou n'a pas confirmé
   ce qui les déclenche.
2. **Plan Granola d'Orso** (brief 3.3). L'API personnelle et les webhooks ne
   sont disponibles qu'à partir du plan Business ou Enterprise. Rien n'est
   construit côté Granola tant que le plan n'est pas confirmé ; la table
   `cible_calls` porte déjà `transcript` et `resume`, remplissables à la main.
3. **Périmètre de Cédric** (brief lot C). Lecture seule, à confirmer.

## 4. Questions à Lhou, avant la suite du lot A

1. Sur quel plan Granola Orso se trouve (personnel, Business, Enterprise) ?
2. La table de correspondance des statuts et thématiques Notion vers les étapes
   et les familles de Magellan. **L'import est bloqué tant qu'elle manque** :
   sans elle, aucune simulation honnête n'est possible.
3. Les deux fiches de référence, Vallet et Weinberg, en HTML. **Le lot B est
   bloqué tant qu'elles manquent** : le modèle de fiche se calque sur elles.
4. Ce qui déclenche `redac_a_faire` et `en_montage`.
5. Qui prévenir en cas de report de tournage.

Deux questions supplémentaires, apparues en écrivant le lot A :

6. Orso est-il sur Google Workspace, et un administrateur peut-il autoriser un
   compte de service sur le domaine (prérequis 1.2, option 1) ?
7. Le texte de la relance automatique. Celui posé dans le code est un brouillon
   sobre, écrit pour être relu et réécrit, pas pour être envoyé tel quel.

## 5. Ce qui est livré, et ce qui ne l'est pas

Livré : le périmètre par show côté MCP, le correctif d'accueil, le show et son
pipe de 13 étapes, les familles de thème, les champs de cible, les calls, les
brouillons d'email, la rotation des familles, les quatre automatisations
quotidiennes avec leur mode simulation.

Non livré, et pourquoi : l'expéditeur par show attend la décision de Matt
(1.2) ; l'import Notion attend la table de correspondance de Lhou (2.6) ; le
modèle de fiche attend les fiches de référence (lot B) ; le lot C attend deux
invités réels passés dans le pipe.
