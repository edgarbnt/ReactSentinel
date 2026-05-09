# GitHub Instructions — Sprint Work (Mode Autonome)

## Objectif
Ce document définit le mode opératoire pour réaliser l'intégralité d'un sprint de manière autonome. L'objectif est d'enchaîner l'exécution de tous les tickets parents sans interruption, en garantissant la continuité du code et la traçabilité des changements.

## Principes généraux
- **Autonomie complète** : Une fois le sprint lancé, tu dois traiter tous les tickets identifiés les uns après les autres sans attendre de validation pour passer au suivant.
- **Analyse initiale** : Lire le contexte (`BLUEPRINT.md`, docs de sprint, code). Identifier la liste complète des tickets parents et définir leur ordre logique d'exécution.
- **Workflow Git incrémental** : Chaque ticket parent possède sa propre branche. Pour maintenir la continuité, chaque nouvelle branche doit être créée à partir de la branche du ticket précédent.
- **Utilisation du Context-mode** : Privilégie les outils `ctx_*` pour analyser des logs, des fichiers volumineux ou synthétiser des zones du codebase. Utilise Bash uniquement pour les actions (Git, modifications de fichiers, exécution de tests).

## Ordre d’exécution
1. **Planification** : Repérer tous les tickets parents du sprint.
2. **Séquençage** : Valider l'ordre d'exécution (via ID Jira, priorité ou dépendances logiques).
3. **Exécution continue** : Traiter les parents dans l'ordre établi, de manière fluide et sans pause entre deux tickets.

## Workflow par Ticket Parent
Pour chaque ticket parent, suivre rigoureusement ce cycle de vie :

### 1. Gestion des branches
- **Premier ticket** : Créer une branche dédiée à partir de la branche de référence (`main` ou `develop`).
- **Tickets suivants** : Créer la nouvelle branche **à partir de la branche du ticket parent précédent**. 
- *Nommage* : Utiliser la convention du sprint ou un nom clair dérivé de l'ID du ticket.

### 2. Implémentation et Tests
- Implémenter les sous-tâches une par une.
- Après chaque sous-tâche :
    - Tester le comportement (pas seulement la compilation).
    - En cas d'échec, corriger la cause racine avant de poursuivre.
- Une sous-tâche n'est considérée finie que si son test est validé.

### 3. Finalisation et Passage au suivant
Une fois toutes les sous-tâches d'un parent validées :
- **Commit** : Créer un commit regroupant les modifications du ticket.
- **Push** : Pousser la branche sur le dépôt distant.
- **Transition** : Créer immédiatement la branche pour le ticket suivant (en se basant sur la branche actuelle) et reprendre à l'étape 1.

## Règles de mise en œuvre
- **Changements chirurgicaux** : Ne modifier que le strict nécessaire.
- **Réutilisation** : Employer les helpers, patterns et conventions déjà présents dans le projet.
- **Visibilité** : Garder les erreurs explicites et documenter brièvement les choix techniques complexes dans le message de commit.

## Fin du Sprint
- La mission s'arrête uniquement lorsque le périmètre total du sprint est atteint (tous les tickets parents traités).
- À la fin, fournir un récapitulatif global :
    - Liste des tickets terminés.
    - Liste des branches créées et poussées.
    - Points de vigilance éventuels pour la suite.
