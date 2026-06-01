---
"dsfr-data": minor
---

feat(providers): auto-détection de plateforme et résolution d'URL pour l'ajout de sources

Nouveaux utilitaires exportés depuis `@dsfr-data/shared` :
- `resolveSourceUrl(url)` : reconnaît la plateforme d'une URL collée (page humaine OU URL d'API) et déduit l'URL d'API canonique, sans appel réseau.
- `parseDataGouvDataset(url)`, `dataGouvDatasetApiUrl(slug)`, `extractDataGouvResources(json)` : résolution d'une page de jeu de données data.gouv.fr en ses ressources interrogeables via l'API Tabular (filtre sur l'extra `analysis:parsing:parsing_table`).

La détection de provider reconnaît désormais les **URLs de page** en plus des URLs d'API : pages explorer OpenDataSoft (`/explore/dataset/` et `/explore/assets/`, toutes versions) et permaliens de ressource data.gouv (`/datasets/r/{uuid}`).
