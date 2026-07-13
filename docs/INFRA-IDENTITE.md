# Identité d'envoi — topologie Workspace (à ne pas oublier)

## Fait (confirmé par Matt, 04/07/2026)
- Le Workspace Google a **stefani.fr en domaine PRINCIPAL** et **collision.studio
  en domaine SECONDAIRE**.
- Presque tous les comptes ont leur **adresse principale en `@stefani.fr`** et une
  **adresse secondaire (alias) en `@collision.studio`**. Vadim aussi :
  - principale : `vadim@stefani.fr`
  - alias : `vadim@collision.studio`

## Conséquence pour l'impersonation (règle)
La délégation domain-wide ne peut impersoner qu'une **adresse PRINCIPALE**, jamais
un alias. Donc :
- **Impersonation** (Gmail + Calendar) = la principale → `vadim@stefani.fr`
  → `EPISODE_SENDER = vadim@stefani.fr`.
- **Adresse d'affichage** (From des mails) = l'alias → `vadim@collision.studio`
  → `EPISODE_FROM_EMAIL = vadim@collision.studio`.
- `EPISODE_SENDER_NAME = "Vadim, assistant IA de l'équipe Collision"`.

C'est la config en place. NE PAS changer l'adresse principale du compte
(structure partagée par tous les comptes).

## Limite connue (assumée)
- **Mails** : From = `vadim@collision.studio` (alias). OK.
- **Calendar** : l'organisateur d'un événement est TOUJOURS la boîte impersonée
  (la principale) = `vadim@stefani.fr` ; l'API ne permet pas de mettre un alias
  comme organisateur. On réduit l'écart en soignant le **nom affiché** du compte
  Vadim (« Vadim, Collision » plutôt que « Vadim Stefani »), mais l'e-mail
  organisateur reste `vadim@stefani.fr`. Non bloquant.
