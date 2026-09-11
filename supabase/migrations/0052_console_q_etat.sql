-- Chantier UX 2 du 11/09 : masquage et mise en avant des questions de la
-- fiche, persistés EN BASE par fiche (plusieurs utilisateurs, plusieurs
-- appareils : jamais localStorage, décision actée pour le dernier-lu en 0043).
-- Un événement kind='q_etat' (payload {qid, etat: masquee|surlignee|null})
-- porte l'override d'une question ; l'état se réduit du flux comme la
-- checklist et les questions rayées, la synchro temps réel de la console
-- (broadcast, rattrapage, polling) est héritée sans nouveau code.
-- Même geste que 0043 : la contrainte kind s'élargit d'une valeur.

alter table public.fiche_console_events drop constraint if exists fiche_console_events_kind_check;
alter table public.fiche_console_events add constraint fiche_console_events_kind_check
  check (kind in ('clip', 'note', 'chat', 'check', 'question', 'lu', 'q_etat'));
