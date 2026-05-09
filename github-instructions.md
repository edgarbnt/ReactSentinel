# GitHub Instructions — Sprint Work

## Objectif
Ce document décrit le mode opératoire à suivre pour n’importe quel sprint dans ce dépôt.

## Principes généraux
- Lire d’abord le contexte utile : `BLUEPRINT.md`, le(s) document(s) de sprint, puis le code concerné.
- Identifier les tickets parents, leur ordre, et les sous-tâches associées avant d’écrire du code.
- Travailler **un ticket parent à la fois**.
- Créer **une branche par ticket parent** avant l’implémentation.
- Ne jamais committer sauf demande explicite.
- Utiliser `context-mode` aux moments utiles : découverte du code, validation, ou recherche de précédents.

## Ordre d’exécution
1. Repérer les tickets parents du sprint.
2. Confirmer l’ordre d’exécution via le titre, l’ID, ou les consignes Jira.
3. Si l’ordre n’est pas évident, le signaler avant d’avancer.
4. Traiter les parents dans l’ordre validé.

## Règles par ticket parent
- Créer la branche dédiée avant toute modification.
- Suivre la convention de nommage du sprint. Si aucune convention précise n’est fournie, utiliser un nom dérivé du parent, clair et stable.
- Implémenter les sous-tâches une par une.
- Après chaque sous-tâche :
  - tester le changement,
  - corriger si nécessaire,
  - ne passer à la suite qu’après validation.
- Ne marquer une sous-tâche comme terminée dans Jira qu’après réussite du test correspondant.
- Ne marquer le parent comme terminé qu’une fois toutes ses sous-tâches validées.

## Règles de test
- Tester le comportement réellement modifié, pas seulement la compilation.
- Préférer les tests ciblés puis exécuter les vérifications plus larges si elles existent déjà dans le dépôt.
- En cas d’échec, corriger la cause racine avant de continuer.

## Règles de mise en œuvre
- Faire des changements chirurgicaux.
- Réutiliser les helpers, patterns et conventions déjà présents.
- Éviter d’introduire des abstractions inutiles.
- Garder les erreurs visibles et explicites.

## Fin de tâche
- S’arrêter dès que le périmètre demandé est atteint.
- Ne pas enchaîner sur d’autres tickets sans instruction.
- Signaler clairement ce qui a été terminé et ce qui reste hors périmètre.
