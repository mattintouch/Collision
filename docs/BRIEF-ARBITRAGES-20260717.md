# Brief Claude Code : arbitrages du 17 juillet 2026 et chantiers séquencés

Destination : docs/ du repo collision (suite de docs/REVUE-MAGELLAN.md, commit 74445cd).
Source : session de repasse Claude (Fable) du 17 juillet 2026, arbitrages rendus par Matthieu Stefani.
Statut : décisions actées, à exécuter dans l'ordre ci-dessous. Chaque chantier fait l'objet d'une PR relue par Matthieu avant merge.

## 1. Décisions actées

1. Métrique de succès à 6 mois. Primaire : nombre d'épisodes closés par trimestre (closé = cible passée à confirmé ou au-delà). Qualité : note de fiche donnée par Matthieu après chaque plateau, échelle 1 à 5. Cette note doit être instrumentée (voir chantier 2, point 4). Toute optimisation future se justifie contre ces deux chiffres.
2. Vercel : passage au plan Pro validé. C'est un prérequis des chantiers 1 et 2 (cron à la minute, maxDuration 300, suppression de la moitié de la complexité de la file décrite en §7 et §8.1 de la revue).
3. Budget API Anthropic : plafond de 200 euros par mois. Alerte email à 80 pour cent, coupure des générations non urgentes à 100 pour cent, override manuel réservé à l'admin. Le plafond sera recalibré une fois la télémétrie de coût en place (chantier 3).
4. Wow effect invité (expérience différenciée artiste, sportif, dirigeant coté) : validé sur le principe, explicitement mis en stock. Ne rien construire sur ce sujet tant que l'adoption interne (Clémence) n'est pas acquise. À verser au backlog produit dès que celui-ci existe.
5. Ordre des chantiers : 1 récap hebdo et backlog, 2 gate anti fiche vide et alertes, 3 télémétrie de coût, 4 besoins éditoriaux. Le nettoyage du stock de cibles est hors périmètre Claude Code (voir section 7).

## 2. Chantier 1 : récap hebdo et backlog produit

Objectif : visibilité en push de tout ce qui bouge dans Magellan, et capture des demandes d'évolution de l'équipe sans copier-coller, sans application directe au code.

1. Table `product_backlog` : id, created_at, auteur (acteur MCP ou user app), source (mcp_feedback, email, session), contenu brut, contexte auto (outil ou écran concerné, cible concernée le cas échéant), statut (nouveau, a_faire, a_preciser, rejete, livre), commentaire de triage, pr_url.
2. Outil MCP `feedback` : une ligne de texte, le contexte est capté automatiquement (acteur du jeton, dernier outil appelé, cible en cours si déductible). Ajouter l'outil à LOOP_TOOLS pour que Vadim et l'équipe puissent le poser. Aucun droit d'écriture ailleurs.
3. Cron hebdomadaire, lundi 08h00 Europe/Paris (possible dès Vercel Pro). Il compile trois sources : mcp_audit (écritures de la semaine, par acteur et par outil), enrichment_jobs (générations réussies, échouées, temps), product_backlog (items nouveaux). Il produit UN email envoyé via l'identité Vadim (impersonation Gmail existante, cf. INFRA-IDENTITE) aux destinataires configurés par show.
4. Format de l'email, deux sections. Section A « ce qui a bougé » : cibles créées, avancées d'étape, touches, fiches générées, échecs. Section B « demandes produit » : chaque item nouveau avec un triage proposé (à faire, à préciser, à rejeter) et une justification d'une ligne. Pas de troisième section, pas de graphiques.
5. Boucle de validation : Matthieu valide ou rejette (réponse dans Claude via MCP, qui met à jour le statut). Une Routine Claude Code hebdomadaire lit les items « a_faire », ouvre les PR correspondantes, renseigne pr_url. Relecture humaine obligatoire avant merge.
6. Garde-fous : le MCP écrit dans le backlog, jamais dans le code. Migrations SQL et secrets restent hors de toute boucle automatique.

## 3. Chantier 2 : gate anti fiche vide et alertes de génération

Contexte déclencheur : la fiche Ben Smith servie quasi vide sans qu'aucune alerte ne remonte (échec silencieux).

1. Règle produit : une fiche dont une section obligatoire (mecanique_succes, univers, chiffres) est vide n'est JAMAIS servie comme présentable. Elle est en état « génération échouée » ou « incomplète », visuellement distinct, avec la cause affichée. Le gate existant de set_status est le modèle, il faut l'équivalent au rendu.
2. Alerte push : si un groupe de génération échoue après ses retries, email immédiat via l'identité Vadim (pas seulement le bandeau in-app, personne ne recharge la page pour vérifier).
3. Robustesse API : backoff exponentiel et circuit breaker en cas d'indisponibilité durable de l'API Anthropic (référence : la panne crédit qui a coûté une demi-journée et des re-kicks en boucle). Le retry complet qui relance toutes les recherches web est à réévaluer, le finisher JSON couvre déjà l'échec de fin de parcours (revue §7).
4. Instrumentation de la métrique qualité : un moyen minimal de capturer la note post plateau de Matthieu (1 à 5), soit un champ sur la fiche verrouillée, soit un micro outil MCP `note_fiche`. La note alimente la boucle éditoriale (fiche_section_versions) et le récap hebdo.

## 4. Chantier 3 : télémétrie de coût et plafond

1. Enregistrer tokens entrée et sortie par job dans enrichment_jobs (le SDK les renvoie), plus le modèle utilisé.
2. Vue d'agrégation : coût estimé par fiche, par outil, par semaine. Une ligne de synthèse dans le récap hebdo.
3. Alerte à 80 pour cent du plafond mensuel (200 euros), coupure des générations non urgentes à 100 pour cent, override admin.
4. Une fois deux ou trois semaines de données : réévaluer l'affectation Haiku contre Sonnet par groupe de génération (revue §7 : le groupe angles mérite peut-être mieux, le portrait non). Décision sur données, plus au jugé.

## 5. Chantier 4 : besoins éditoriaux dans le daily five (la brique produit du mois)

Constat déclencheur (cas Belkaid, 17/07/2026) : les critères d'éligibilité éditoriale de GDIY n'existent nulle part dans le modèle de données. Une DG d'institution scientifique de rang mondial est ressortie troisième du pipe alors qu'elle n'est pas un invité GDIY (pas entrepreneure, pas de communauté, pas de traction attendue). Ni le score ni un assistant ne peuvent appliquer une règle qui n'est pas écrite.

1. Critères d'éligibilité par show, en dur dans la config du show. Pour GDIY : entrepreneur ou bâtisseur d'un système, notoriété ou communauté forte, traction d'audience attendue. Évalués en un indicateur d'éligibilité distinct du score d'actionnabilité (ne pas mélanger valeur éditoriale et accessibilité, défaut déjà documenté du score).
2. Table `besoins_editoriaux` : show, période, contrainte en clair (exemple réel : « 1 femme, épisode estival, closing sous 15 jours »), critères structurés quand c'est possible (genre, archétype d'épisode, échéance), statut (ouvert, couvert, expiré), cible qui l'a couvert.
3. daily_five et le copilote évaluent le pipe contre les besoins ouverts : chaque besoin non couvert par au moins deux cibles actionnables remonte en alerte dans le récap hebdo et sur la page Aujourd'hui.
4. Règle de la brique respectée : cette fonctionnalité remplace la question récurrente « qui a-t-on pour la case X », elle n'ajoute pas de surface. Aucun nouvel écran, tout passe par le daily five et le récap existants.
5. Corriger au passage le modificateur estival : il conflate date d'enregistrement et date de publication (défaut déjà flaggé).

## 6. Régressions et vérifications MCP (constats de la session du 17/07)

1. enrich_cible avec apply true : erreur d'exécution, le mode proposition fonctionne. À corriger avant la passe d'enrichissement de masse. Contournement en cours : proposition puis application manuelle.
2. update_cible sur kind personne : les champs raison_de_selection, secteur et pays sont rejetés. À corriger. Contournement en cours : passage par note.
3. list_cibles par slug (« gdiy ») : a fonctionné en session du 17/07, le bug « Show introuvable » n'a pas été reproduit. Confirmer que le correctif est bien en production et clore le point.
4. Constat positif à conserver : add_appui a résolu automatiquement les coordonnées d'un relais (email et téléphone, match haute confiance) et lié Folk. C'est le niveau de service attendu partout.

## 7. Hors périmètre Claude Code

1. Nettoyage du stock : plus de 100 cibles froides vides à score 26, doublons (deux fiches Michel Leclercq), placeholders corrompus (une cible nommée « fondé The Chinese Pulse il y a 10 ans après av »). Sera traité par Claude (Fable) via MCP en session de tri dédiée. Ne pas scripter de purge côté code.
2. Casting estival : opérationnel, géré en direct via MCP (Sézalory, Léna Situations, Receveur, Dorange, Nabilla, Léa Elui, Mister V sont à jour dans le pipe au 17/07).

## 8. Garde-fous permanents

1. Migrations SQL : jamais automatiques, registre MIGRATIONS-EN-ATTENTE inchangé.
2. Secrets : hors de toute boucle automatique, aucun secret dans les journaux visibles (à re-vérifier au chantier 2, les erreurs API sont recopiées dans enrichment_jobs.error).
3. Toute écriture produit passe par PR relue par Matthieu.
4. La doctrine des fiches n'est amendée que par la boucle éditoriale validée, jamais par inférence silencieuse.
