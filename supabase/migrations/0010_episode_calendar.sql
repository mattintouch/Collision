-- Magellan — ids des événements Google Calendar liés à un épisode, pour pouvoir
-- les mettre à jour (report) ou les supprimer (annulation) plus tard.
--  - gcal_event_id        : l'enregistrement (invitation aux participants)
--  - gcal_studio_event_id : la réservation Studio 71 (-1h / +1h), bloc sans invités

alter table public.episodes
  add column if not exists gcal_event_id text,
  add column if not exists gcal_studio_event_id text;
