-- Contrat serveur Vadim — idempotence des écritures de touche : un client de
-- boucle (Vadim) peut réessayer un appel ; sans garde-fou, log_touche crée un
-- doublon. Une clé d'idempotence optionnelle + index unique partiel garantit
-- qu'un même appel réémis n'insère qu'une fois.

alter table public.touches add column if not exists idempotency_key text;
create unique index if not exists touches_idempotency_key_uidx
  on public.touches (idempotency_key)
  where idempotency_key is not null;
