---
'dsfr-data': patch
---

fix(app-sidemenu): la contrainte `flex: 0 0 220px` était posée sur le `<nav class="guide-sidemenu">` interne au lieu du host `<app-sidemenu>`, qui est en réalité l'enfant direct du flex container `.guide-layout`. Résultat : la largeur n'était pas contrainte et les libellés longs (« Élections des chambres d'agriculture 2025 — Résultats », etc.) restaient sur une seule ligne, élargissant le menu latéral au-delà de la spec DSFR.

Maintenant : les règles flex / sticky / overflow sont posées sur `app-sidemenu` directement (light DOM, donc sélecteur de tag valide), les libellés wrappent sur 2 lignes dans une colonne de 220px.
