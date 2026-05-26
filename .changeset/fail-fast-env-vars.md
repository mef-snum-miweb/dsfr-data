---
'dsfr-data': patch
---

build: fail-fast sur les variables d'environnement requises au lieu de fallback silencieux vers le domaine de référence (closes #168 P1 step 3-4, PR-3 du plan de découpage).

**Nouveau script `scripts/validate-build-env.ts`** exécuté en `prebuild:all` (via `validate:build-env`). Échoue avec un message clair si `VITE_PROXY_URL` manque. Bypass explicite via `DSFR_DATA_DEV_BUILD=1` pour les builds dev/test sans `.env`.

**Fail-fast runtime côté Express** (`server/src/utils/mailer.ts`) : plus de fallback vers `https://chartsbuilder.matge.com` si `APP_URL` manque — l'envoi d'email throw à la première utilisation avec un message indiquant la résolution. Évite d'envoyer un email avec un lien pointant vers la mauvaise instance.

**MCP server** (`mcp-server/src/index.ts`) : ajout de la variable d'environnement `DSFR_DATA_BASE_URL` comme alternative à `--url`. Le default `chartsbuilder.matge.com` est conservé (renommé `DEFAULT_PUBLIC_INSTANCE`) — exception assumée car le MCP est un tool public utilisé pour la découverte (`npx dsfr-data-mcp`).

**Préservation du déploiement de référence** : les scripts `docker/deploy.sh` et `docker/deploy-server.sh` génèrent automatiquement `VITE_PROXY_URL` et `APP_URL` à partir de `APP_DOMAIN` si absents du `.env`. Le déploiement de référence continue de fonctionner sans intervention manuelle.

**Workflows CI adaptés** : `release.yml` (Tauri) utilise `DSFR_DATA_DEV_BUILD=1`, `docker-scan.yml` (Trivy) passe `--build-arg VITE_PROXY_URL=https://example.test`, `dast.yml` ajoute les vars au `.env` généré.

`.env.example` restructuré : marquage explicite `[REQUISE]` / `[optionnelle]` / `[serveur]` et section `APP_URL` ajoutée.
