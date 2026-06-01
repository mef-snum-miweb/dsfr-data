---
"dsfr-data": patch
---

fix(layout): `app-layout-builder` passe en page-scroll avec panneau droit sticky

Le layout splitté ne verrouille plus tout dans le viewport (où le footer DSFR + le header écrasaient la zone de travail). Désormais la page défile, le panneau droit est `sticky` et garde une hauteur ~pleine page : en scrollant, le header sort du champ pendant que le footer reste sous la ligne de flottaison, et l'aperçu de droite reste visible quand la colonne de gauche (config) est longue. La cause racine côté apps était `body { min-height: 100vh }` (hauteur indéfinie) qui empêchait toute borne ; les apps builder, builder-IA et sources sont alignées sur le modèle page-scroll.
