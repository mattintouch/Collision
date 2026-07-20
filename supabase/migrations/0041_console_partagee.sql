-- Session Yaël Braun-Pivet (20/07), lot A : console de fiche partagée.
--
-- A1 : chaque saisie de la console (clip, note, message régie, coche de
-- checklist, question posée) devient une LIGNE EN BASE portant l'identité du
-- compte réellement connecté. L'identité est résolue côté serveur par les
-- DÉFAUTS de colonne (auth.uid() et le JWT de la session) : le client n'envoie
-- jamais d'auteur, et la policy d'insertion rejette toute valeur contrefaite.
--
-- A2 : la session d'enregistrement (REC) devient une ligne horodatée : début,
-- fin, qui a lancé, qui a arrêté. L'état REC survit au rechargement et se
-- partage entre opérateurs.
--
-- Temps réel : les deux tables sont ajoutées à la publication Realtime de
-- Supabase ; le client bascule en polling court (2 s) si le canal échoue.

create table if not exists public.fiche_rec_sessions (
  id          uuid primary key default gen_random_uuid(),
  fiche_id    uuid not null references public.fiches(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  started_by  text not null default coalesce(auth.jwt() ->> 'email', 'service'),
  ended_by    text,
  email_envoye_at timestamptz  -- flux de fin (lot B1) : idempotence de l'envoi
);
create index if not exists fiche_rec_sessions_fiche_idx on public.fiche_rec_sessions(fiche_id, started_at desc);

create table if not exists public.fiche_console_events (
  id           uuid primary key default gen_random_uuid(),
  fiche_id     uuid not null references public.fiches(id) on delete cascade,
  session_id   uuid references public.fiche_rec_sessions(id) on delete set null,
  created_at   timestamptz not null default now(),
  author_id    uuid not null default auth.uid(),
  author_email text not null default coalesce(auth.jwt() ->> 'email', ''),
  kind         text not null check (kind in ('clip', 'note', 'chat', 'check', 'question')),
  timecode     text,                               -- relatif au début du REC ; null = hors enregistrement
  payload      jsonb not null default '{}'::jsonb  -- {text} | {index, checked} | {num, asked}
);
create index if not exists fiche_console_events_fiche_idx on public.fiche_console_events(fiche_id, created_at);

alter table public.fiche_rec_sessions enable row level security;
alter table public.fiche_console_events enable row level security;

-- Lecture : toute l'équipe authentifiée.
create policy fiche_rec_sessions_read on public.fiche_rec_sessions
  for select using (auth.uid() is not null);
create policy fiche_console_events_read on public.fiche_console_events
  for select using (auth.uid() is not null);

-- Écriture : authentifié, et l'auteur est CELUI DU JETON (aucune identité
-- fournie par le client ne peut s'y substituer). La clôture de session passe
-- par la route serveur (service role) : pas de policy update.
create policy fiche_rec_sessions_insert on public.fiche_rec_sessions
  for insert with check (
    auth.uid() is not null
    and started_by = coalesce(auth.jwt() ->> 'email', '')
  );
create policy fiche_console_events_insert on public.fiche_console_events
  for insert with check (
    author_id = auth.uid()
    and author_email = coalesce(auth.jwt() ->> 'email', '')
  );

-- Temps réel (idempotent : tolère une table déjà publiée).
do $$
begin
  alter publication supabase_realtime add table public.fiche_console_events;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.fiche_rec_sessions;
exception when duplicate_object then null;
end $$;
