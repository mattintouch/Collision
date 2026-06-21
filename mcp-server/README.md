# Serveur MCP Magellan

Expose la base Supabase en lecture/écriture (cahier des charges §9, Étape 2).
Se branche comme connecteur dans Claude et est consommé par le copilote de l'app.

## Outils exposés

| Outil | Rôle |
|---|---|
| `list_shows` | Liste les shows et leurs étapes. |
| `list_cibles` | Liste/filtre les cibles d'un show (voie, archétype, étape, type). |
| `get_dossier` | Dossier complet d'une cible (appuis, journal, signaux). |
| `create_cible` | Crée une cible (personne ou entreprise). |
| `log_touche` | Logge une touche, remet le compteur à zéro. |
| `validate_cible` | Bascule la cible en épisode avec son contexte. |

## Build

```bash
cd mcp-server
npm install
npm run build
```

## Variables d'environnement

- `NEXT_PUBLIC_SUPABASE_URL` (ou `SUPABASE_URL`)
- `SUPABASE_SERVICE_ROLE_KEY` (clé service role — accès serveur de confiance, bypass RLS)

## Brancher dans Claude (Desktop / Code)

Ajouter au fichier de config MCP :

```json
{
  "mcpServers": {
    "magellan": {
      "command": "node",
      "args": ["/chemin/absolu/Collision/mcp-server/dist/index.js"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://VOTRE-PROJET.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "votre-service-role-key"
      }
    }
  }
}
```

> La clé service role contourne la RLS. Réserver ce connecteur à un usage
> serveur/admin de confiance. Le passage d'un contexte utilisateur (RLS par
> show) est prévu pour une itération ultérieure.
