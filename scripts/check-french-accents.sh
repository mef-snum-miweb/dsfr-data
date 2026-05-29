#!/usr/bin/env bash
# Warn (NON-BLOCKING) about French UI labels written without accents.
#
# Scope volontairement réduit (cf. décision 2026-05-30) : UNIQUEMENT le contenu
# textuel des balises HTML (apps/**/*.html, packages/**/*.html). Sont ignorés :
#  - les fichiers .ts / .css / .md (commentaires de code, prompts, styles…),
#  - les attributs HTML (placeholder=…, title=…) et les commentaires <!-- … -->.
# Avant, le script grepait tout le contenu de tous les fichiers et bloquait la CI
# sur des commentaires de code — friction inutile. Il ne vise désormais que le
# texte réellement visible dans le HTML statique, et n'échoue JAMAIS (exit 0).
#
# Each pattern is a French word that has NO valid English / identifier meaning
# without its accent.
#
# Run locally: bash scripts/check-french-accents.sh
# Or via npm:  npm run check:accents
#
# Maintenance: ne pas ajouter de pattern ambigu avec l'anglais (selection,
# generation, definition…) — traiter au cas par cas en revue.

set -euo pipefail

# Sorted, deduped. Word boundaries applied by `git grep -wE` below.
# Excluded for bilingual overlap (would false-positive on English source):
#   present, presente, presents, presentes — "present" is also valid English.
#   series, Series — also valid English AND appears in HTML identifiers
#                    (`extra-series-container`, etc.). Singular `serie`/`Serie`
#                    is unambiguously French.
#   selection, generation, definition — handled case-by-case (not auto-checkable).
PATTERNS=(
  agreger Agreger agregation Agregation agregations Agregations agrege agreges
  accessibilite Accessibilite
  apercu Apercu
  caractere Caractere caracteres
  categorie Categorie categories Categories categoriel Categoriel categorielle categorielles
  cle Cle cles Cles
  creer Creer creee creees crees
  deja Deja
  defaut Defaut
  defini definie definis definies
  degrade Degrade
  detecte detectee detectes
  donnees Donnees
  ecran Ecran ecrans
  echec Echec echoue
  Etat Etats
  evenement Evenement evenements Evenements
  genere Genere generes generer Generer
  meme Meme memes
  methode Methode methodes
  numerique Numerique numeriques
  prefere Prefere
  prevu prevue prevus prevues
  previsualiser Previsualiser previsualisation
  realise realisee realisees
  recupere
  reglages Reglages
  requete Requete requetes
  reussi reussie reussite Reussite
  selectionne selectionnez Selectionnez selectionner Selectionner selectionnee selectionnes
  serie Serie
  specifique Specifique specifiques
  telecharge telechargee telecharger Telecharger telechargement Telechargement telechargements
  validite
  verifie verifier Verifier verifiez Verifiez
)

PATHS=(apps packages)

# Build a single ERE alternation: \b(word1|word2|…)\b
# IFS is scoped to the subshell, no leak to the parent shell.
# nosemgrep: bash.lang.security.ifs-tampering.ifs-tampering
joined=$(IFS='|'; echo "${PATTERNS[*]}")

# 1. git grep (honore .gitignore) sur les SEULS fichiers HTML.
raw=$(git grep -nwE "(${joined})" -- \
      "apps/**/*.html" "packages/**/*.html" \
      ':!**/dist/**' ':!**/node_modules/**' ':!**/*.min.*' 2>/dev/null || true)

# 2. Ne garder que les hits dont le mot survit au retrait des balises <…> et des
#    commentaires <!-- … --> : ce qui reste est le TEXTE entre balises (le
#    "contenu"). Les attributs et commentaires sont donc exclus.
matches=""
if [ -n "$raw" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    content=${line#*:*:}                                  # file:line:CONTENU
    stripped=$(printf '%s' "$content" | sed -E 's/<!--.*-->//g; s/<[^>]*>//g')
    if printf '%s' "$stripped" | grep -qwE "(${joined})"; then
      matches="${matches}${line}"$'\n'
    fi
  done <<EOF
$raw
EOF
fi

# Allowlist : grist.numerique.gouv.fr est un vrai nom de domaine (ASCII).
matches=$(printf '%s' "$matches" | grep -vE 'grist\.numerique\.gouv\.fr' || true)
matches=$(printf '%s' "$matches" | sed '/^[[:space:]]*$/d')

if [ -z "$matches" ]; then
  printf '\033[32m✓ Aucun libellé HTML dé-accentué.\033[0m\n'
  exit 0
fi

count=$(printf '%s\n' "$matches" | wc -l | tr -d ' ')
printf '\n\033[33m⚠ %d libellé(s) HTML potentiellement dé-accentué(s) — AVERTISSEMENT (non bloquant) :\033[0m\n\n' "$count"
printf '%s\n' "$matches"
printf '\n\033[33mCorrige si ce sont de vrais libellés UI (donnees → données). Scope : contenu des balises HTML uniquement.\033[0m\n'
# Non bloquant : ne fait jamais échouer la CI.
exit 0
