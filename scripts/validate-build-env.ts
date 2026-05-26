#!/usr/bin/env node
/**
 * Validation des variables d'environnement requises au build de production.
 *
 * Cf. issue #168 (PR-3) — fail-fast plutôt que fallback silencieux vers le
 * domaine du déploiement de référence.
 *
 * Bypassable explicitement via `--allow-missing` (utilisé par les tests
 * Vitest et la CI pour les jobs qui ne déploient pas).
 *
 * Skip implicite en mode dev (Vite dev server) :
 *   - NODE_ENV=development → le proxy Vite gère les appels API
 *   - DSFR_DATA_DEV_BUILD=1 → opt-in explicite pour `vite build` local sans `.env`
 */

const REQUIRED_VARS = [
  {
    name: 'VITE_PROXY_URL',
    hint: 'URL de base du proxy CORS pour les appels API en production.',
    example: 'VITE_PROXY_URL=https://votre-domaine.example.com',
  },
] as const;

const isDevMode = process.env.NODE_ENV === 'development' || process.env.DSFR_DATA_DEV_BUILD === '1';
const allowMissing = process.argv.includes('--allow-missing');

if (isDevMode || allowMissing) {
  process.exit(0);
}

const missing = REQUIRED_VARS.filter((v) => !process.env[v.name]);

if (missing.length === 0) {
  process.exit(0);
}

console.error('\n[31m✗ Build env validation failed[0m\n');
console.error('Les variables suivantes doivent être définies pour un build de production :\n');
for (const v of missing) {
  console.error(`  [1m${v.name}[0m`);
  console.error(`    ${v.hint}`);
  console.error(`    Exemple : ${v.example}\n`);
}
console.error('Comment résoudre :');
console.error('  - Ajouter ces variables à `.env` à la racine du repo, puis relancer le build.');
console.error(
  '  - Pour un déploiement Docker : ces variables sont propagées via `build.args` dans'
);
console.error('    docker-compose.yml. Voir `docker/deploy-server.sh`.');
console.error(
  '  - Pour un build dev sans .env (ex: tests) : `DSFR_DATA_DEV_BUILD=1 npm run build:all`'
);
console.error('    ou ajouter `--allow-missing` au script.');
console.error('\nCf. issue #168 (PR-3) pour le contexte de cette règle.\n');

process.exit(1);
