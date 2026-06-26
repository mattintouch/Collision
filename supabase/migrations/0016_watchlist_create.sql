-- Autoriser tout utilisateur connecté à créer un tag (watchlist) depuis le board
-- — création volontaire (Sport, Politique…). Lecture déjà ouverte ; suppression
-- reste réservée à l'admin.

create policy watchlists_insert_authed on public.watchlists
  for insert with check (auth.uid() is not null);
