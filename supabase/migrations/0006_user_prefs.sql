-- Magellan — préférences utilisateur.
-- Show par défaut affiché à la connexion (personnalisable dans Réglages).
-- Modifiable par chacun sur son propre profil (policy profiles_self_update).

alter table public.profiles
  add column if not exists default_show_slug text;
