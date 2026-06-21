-- Magellan — Seed (§12, Étape 1).
-- Trois shows, leurs étapes configurables, et un jeu de cibles de test.
-- Idempotent : peut être rejoué (on conflict do nothing / upsert par slug).

-- ---------------------------------------------------------------------------
-- Shows
-- ---------------------------------------------------------------------------
insert into public.shows (slug, nom, type_pipe, couleur) values
  ('gdiy',     'Génération Do It Yourself', 'invites',    '#1FB46A'),
  ('ccg',      'Combien ça gagne',          'invites',    '#3B82F6'),
  ('fleurons', 'Fleuron(s)',                'thematique', '#B45CFF')
on conflict (slug) do update
  set nom = excluded.nom, type_pipe = excluded.type_pipe, couleur = excluded.couleur;

-- ---------------------------------------------------------------------------
-- Étapes par show
-- ---------------------------------------------------------------------------
-- Pipes invités (GDIY, CCG) : Confirmé = validation invité -> bascule épisode.
insert into public.stages (show_id, key, label, position, is_final)
select s.id, v.key, v.label, v.position, v.is_final
from public.shows s
join (values
  ('identifie',  'Identifié',  1, false),
  ('qualifie',   'Qualifié',   2, false),
  ('contacte',   'Contacté',   3, false),
  ('confirme',   'Confirmé',   4, true),
  ('programme',  'Programmé',  5, false),
  ('enregistre', 'Enregistré', 6, false),
  ('publie',     'Publié',     7, false)
) as v(key, label, position, is_final) on true
where s.type_pipe = 'invites'
on conflict (show_id, key) do nothing;

-- Pipe thématique (Fleurons) : Décidé = validation éditoriale -> bascule épisode.
insert into public.stages (show_id, key, label, position, is_final)
select s.id, v.key, v.label, v.position, v.is_final
from public.shows s
join (values
  ('identifie', 'Identifié',              1, false),
  ('qualifie',  'Qualifié (raison validée)', 2, false),
  ('recherche', 'Recherche',              3, false),
  ('decide',    'Décidé',                 4, true),
  ('produit',   'Produit',                5, false)
) as v(key, label, position, is_final) on true
where s.slug = 'fleurons'
on conflict (show_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- Cibles de test — GDIY (personnes)
-- ---------------------------------------------------------------------------
with show as (select id from public.shows where slug = 'gdiy'),
     stg as (select key, id from public.stages where show_id = (select id from show))
insert into public.cibles
  (show_id, kind, nom, stage_id, priorite, voie, sujets, canal_reel, via_qui,
   date_derniere_touche, role, organisation, archetype)
select (select id from show), 'personne', d.nom,
       (select id from stg where key = d.stage_key),
       d.priorite::priorite_type, d.voie::voie_type, d.sujets, d.canal, d.via,
       d.derniere::timestamptz, d.role, d.org, d.arch::archetype_type
from (values
  ('Tony Parker',        'qualifie', 'haute',   'froid', array['sport','reconversion','business'], 'Instagram DM', 'Agent sportif', now() - interval '12 days', 'Entrepreneur, ex-NBA', 'Infinity Nine', 'big_fish'),
  ('Camille Étienne',    'contacte', 'moyenne', 'chaud', array['écologie','activisme'],            'Email',        'Ancien invité',  now() - interval '4 days',  'Activiste',          'Indépendante',  'pepite'),
  ('Un chef étoilé local','identifie','basse',  'froid', array['cuisine','artisanat'],             null,           null,             null,                        'Chef',               'Restaurant',    'quick_win')
) as d(nom, stage_key, priorite, voie, sujets, canal, via, derniere, role, org, arch)
where not exists (select 1 from public.cibles c where c.show_id = (select id from show) and c.nom = d.nom);

-- ---------------------------------------------------------------------------
-- Cibles de test — CCG (personnes : un métier, un revenu, une trajectoire)
-- ---------------------------------------------------------------------------
with show as (select id from public.shows where slug = 'ccg'),
     stg as (select key, id from public.stages where show_id = (select id from show))
insert into public.cibles
  (show_id, kind, nom, stage_id, priorite, voie, sujets, canal_reel, via_qui,
   date_derniere_touche, role, organisation, archetype)
select (select id from show), 'personne', d.nom,
       (select id from stg where key = d.stage_key),
       d.priorite::priorite_type, d.voie::voie_type, d.sujets, d.canal, d.via,
       d.derniere::timestamptz, d.role, d.org, d.arch::archetype_type
from (values
  ('Plombier indépendant',  'identifie', 'moyenne', 'froid', array['artisanat','revenus'],     null,        null,           null,                       'Plombier',         'À son compte',  'quick_win'),
  ('Trader prop firm',      'qualifie',  'haute',   'chaud', array['finance','trajectoire'],   'LinkedIn',  'Contact interne', now() - interval '20 days', 'Trader',           'Prop firm',     'big_fish'),
  ('Berger transhumant',    'identifie', 'basse',   'froid', array['ruralité','métier rare'],  null,        null,           null,                       'Berger',           'Indépendant',   'pepite')
) as d(nom, stage_key, priorite, voie, sujets, canal, via, derniere, role, org, arch)
where not exists (select 1 from public.cibles c where c.show_id = (select id from show) and c.nom = d.nom);

-- ---------------------------------------------------------------------------
-- Cibles de test — Fleurons (entreprises / marques)
-- ---------------------------------------------------------------------------
with show as (select id from public.shows where slug = 'fleurons'),
     stg as (select key, id from public.stages where show_id = (select id from show))
insert into public.cibles
  (show_id, kind, nom, stage_id, priorite, voie, sujets, canal_reel, via_qui,
   date_derniere_touche, secteur, pays, envergure, raison_de_selection, etat_recherche)
select (select id from show), 'entreprise', d.nom,
       (select id from stg where key = d.stage_key),
       d.priorite::priorite_type, d.voie::voie_type, d.sujets, d.canal, d.via,
       d.derniere::timestamptz, d.secteur, d.pays, d.envergure::envergure_type, d.raison, d.etat
from (values
  ('Michelin',     'qualifie', 'haute',   'froid', array['industrie','innovation'], null,    null,            null,                       'Pneumatique', 'France', 'international', 'Fleuron industriel mondial, virage hydrogène et matériaux', 'Sources publiques rassemblées, contacts presse à identifier'),
  ('Patagonia FR', 'recherche','moyenne', 'froid', array['mode','engagement'],      'Email', 'Contact RP',    now() - interval '8 days',  'Textile',     'France', 'international', 'Modèle de marque à mission, pertinence éditoriale forte',   'Entretien préliminaire fait, recherche terrain en cours'),
  ('Une maison de champagne', 'identifie','basse','froid', array['terroir','luxe'], null,    null,            null,                       'Vin',         'France', 'fr',           'Savoir-faire patrimonial, angle transmission',             'À lancer')
) as d(nom, stage_key, priorite, voie, sujets, canal, via, derniere, secteur, pays, envergure, raison, etat)
where not exists (select 1 from public.cibles c where c.show_id = (select id from show) and c.nom = d.nom);

-- ---------------------------------------------------------------------------
-- Appuis, touches et signaux de démonstration (rattachés par nom de cible)
-- ---------------------------------------------------------------------------
insert into public.appuis (cible_id, nom, organisation, type, note)
select c.id, a.nom, a.org, a.type::appui_type, a.note
from public.cibles c
join (values
  ('Tony Parker',     'Un ancien invité commun', 'GDIY', 'ancien_invite',  'Peut faire une intro chaleureuse'),
  ('Trader prop firm','Membre de l''équipe',      'Collision', 'contact_interne', 'A déjà échangé en DM')
) as a(cible_nom, nom, org, type, note) on a.cible_nom = c.nom
where not exists (select 1 from public.appuis ap where ap.cible_id = c.id and ap.nom = a.nom);

insert into public.touches (cible_id, date, canal, contenu, source)
select c.id, now() - interval '4 days', 'Email', 'Premier message envoyé, pas encore de réponse.', 'saisie'
from public.cibles c where c.nom = 'Camille Étienne'
and not exists (select 1 from public.touches t where t.cible_id = c.id);

insert into public.signals (cible_id, type, date, source, pertinence, resume)
select c.id, s.type::signal_type, now() - interval '6 days', s.source, s.pertinence, s.resume
from public.cibles c
join (values
  ('Tony Parker', 'mouvement_entreprise', 'Presse éco', 5, 'Nouvelle levée annoncée pour Infinity Nine'),
  ('Michelin',    'nomination',           'Communiqué', 4, 'Nouveau patron de la division innovation')
) as s(cible_nom, type, source, pertinence, resume) on s.cible_nom = c.nom
where not exists (select 1 from public.signals sg where sg.cible_id = c.id);
