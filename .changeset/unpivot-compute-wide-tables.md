---
"dsfr-data": minor
---

feat(core): consommer un tableur "wide" en HTML pur — `dsfr-data-unpivot` + attribut `compute`

Deux ajouts qui transforment n'importe quel tableur orienté présentation (temps dans les noms de colonnes) en source consommable par le pipeline, sans une ligne de JavaScript.

- **Nouveau composant `<dsfr-data-unpivot>`** — transformateur pur (frère de `dsfr-data-join`, aucun fetch HTTP) qui bascule un tableau « wide » en « long/tidy » (colonnes → lignes). Attributs : `id-cols`, `value-cols` / `value-cols-pattern` (motif `c{YYYY}_{MM}` avec tokens date à largeur fixe), `var-name`, `var-format`, `value-name`, `drop-empty`. La valeur reste brute — le typage est délégué à `numeric-auto` en aval. Un nouveau mois (nouvelle colonne) est déplié sans changer le HTML.
- **Nouvel attribut `compute` sur `<dsfr-data-normalize>`** — colonnes calculées ligne à ligne (en dernier, sur valeurs déjà typées). Couvre la mise à l'échelle (`pct = valeur * 100`) et la clé composite (`groupe = Indicateurs + ' / ' + Sous_theme`). Arithmétique `+ - * /`, concaténation texte, parenthèses. Évaluateur d'expression sûr maison (tokenizer + descente récursive), jamais `eval()`. Hors périmètre : conditions, fonctions, calculs sur valeurs agrégées.
- **Nouvel attribut `series-field` sur `<dsfr-data-chart>`** — mode multi-séries à partir de données long/tidy : les valeurs distinctes d'une colonne-clé deviennent autant de séries (complémentaire du mode large `value-fields`). C'est le consommateur naturel de `dsfr-data-unpivot` : `unpivot` → tidy → `series-field` rend N courbes. S'applique à bar/line/radar, prioritaire sur `value-fields`. Aucun changement dans `@gouvfr/dsfr-chart` (qui supporte déjà le multi-séries nativement).

Inclus dans le bundle `core`. Skills builder-IA et specs mis à jour.
