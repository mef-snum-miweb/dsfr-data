---
'dsfr-data': patch
---

fix(ux): polish batch — 6 quick wins de la salve 2 du rapport d'audit UX 2026-05-26.

Petits ajustements indépendants extraits de la salve 2 du plan (mineurs + suggestions reportés après les 3 EPIC structurants déjà livrés). Pas d'issues GitHub dédiées — cf. plan `~/.claude/plans/je-veux-que-tu-vectorized-raven.md`.

- **S-H-3** : badge header `Beta 0.7.0` (orange `fr-badge--warning`, anxiogène) → **`Aperçu 0.7.0`** (bleu `fr-badge--info`) avec tooltip explicatif « Outil en évolution, vos exports restent stables ». Pour Marie (P1), le label « BETA » sur un site officiel suggère « instable / pas pour la prod ». « Aperçu » est neutre.
- **m-S-1** : tour Sources step 3 — « Sélectionnez une connexion pour parcourir ses tables… » (théorique au 1er accès) → **« Une fois une connexion ajoutée, vous pourrez parcourir ses tables… »** (cohérent quand zéro connexion).
- **m-S-2** : bouton « Rafraîchir » désormais masqué quand la source courante est de type `manual` ou `join` (pas de données distantes à rafraîchir). Réaffiché automatiquement quand l'utilisateur sélectionne une connexion API/Grist.
- **m-S-3** : couleurs des badges « API / Grist / Manuel / Jointure » alignées sur la palette DSFR officielle (`#000091` Bleu France / `#18753C` Vert émeraude / `#A558A0` Violet macaron / `#B34000` Orange terre-battue, toutes définies dans `packages/shared/src/constants/dsfr-palettes.ts`). Le violet custom `#9333ea` qui faisait l'objet du finding est remplacé ; les 3 autres sont aussi alignés pour la cohérence.
- **m-B-1** : tour Builder step 1 — retire la mention « cliquez sur une des cartes d'exemple » qui n'existent pas dans l'UI. Nouveau wording : « Commencez ici : choisissez une source de données existante dans la liste déroulante. Pas encore de source ? Créez-en une depuis l'app Sources. »
- **m-B-5** : `CHART_TYPE_LABELS.bar = 'Barres verticales'` → **`'Barres'`** pour aligner avec le libellé du bouton de la grille (« Barres »). Plus de divergence entre le bouton sélectionné et le résumé de la section quand collapsée.

**m-B-4 vérifié sans changement** : le feedback « Copié ! » sur le bouton « Copier le code » existe déjà (`apps/builder/src/ui/ui-helpers.ts:174-180`, swap d'innerHTML 2 secondes). L'audit suspectait son absence — c'était en fait déjà implémenté.
