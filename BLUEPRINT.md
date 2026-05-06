React-Sentinel est une infrastructure de débogage autonome conçue pour transformer les agents IA (comme Claude Code ou GitHub Copilot CLI) de simples générateurs de texte en véritables ingénieurs capables d'observer et de valider leurs actions en temps réel.

L'outil agit comme un serveur MCP (Model Context Protocol) qui fait le pont entre le terminal où réside l'IA et l'environnement d'exécution du navigateur.

Ce que fait l'outil : Les capacités techniques
1. Vision du Runtime (L'Inspection "Live")
Au lieu de se baser uniquement sur les fichiers sources statiques, l'outil donne à l'IA un accès direct aux entrailles du navigateur :

Extraction de l'arbre React (Fiber) : L'IA peut explorer la structure des composants, voir les props passées, les valeurs actuelles des hooks (useState, useMemo) et l'état des contextes globaux.

Audit Réseau et Console : L'outil remonte instantanément les erreurs JavaScript, les avertissements de performance et les échecs de requêtes API (401, 500) directement dans le flux de réflexion de l'IA.

Analyse de l'Hydratation : Pour les frameworks comme Next.js, il identifie les divergences entre le rendu serveur et le rendu client, un domaine où les IA sont habituellement aveugles.

2. La "Shadow Sandbox" (Validation par l'expérience)
C’est la fonctionnalité maîtresse : la capacité de tester sans casser.

Hot-Patching éphémère : L'IA peut soumettre un "patch" (une modification de code) à l'outil. Ce dernier l'injecte dans une instance de navigateur isolée sans modifier les fichiers locaux de l'utilisateur.

Assertions autonomes : Après avoir injecté le patch, l'IA peut vérifier si le crash a disparu ou si l'élément visuel est désormais correct. Elle ne propose le code final que si le test en sandbox est concluant.

3. Simulation d'Interactions
L'outil permet à l'IA de "manipuler" l'application :

Scripts de reproduction : L'IA peut ordonner au navigateur de cliquer sur des boutons, de remplir des formulaires ou de naviguer dans l'application pour reproduire un bug complexe avant de tenter de le résoudre.

Cas d'usages principaux
Résolution des boucles de rendu (Infinite Loops)
Lorsqu'un composant React boucle à l'infini à cause d'une dépendance mal gérée dans un useEffect, l'IA ne peut généralement pas le voir via le code seul. Avec React-Sentinel, l'outil détecte l'explosion du nombre de rendus et fournit à l'IA l'historique des changements de variables. L'IA identifie alors la variable instable et corrige le hook avec une certitude absolue.

Débogage des flux asynchrones complexes
Dans une application où plusieurs appels API influencent l'état de l'UI (ex: un tableau de bord financier), l'IA utilise l'outil pour tracer l'ordre exact des promesses et l'évolution du state à chaque étape. Elle peut ainsi détecter une condition de course (race condition) qu'elle aurait ignorée par une simple lecture de code.

Validation de la cohérence UI/UX
Si un utilisateur signale qu'un menu déroulant se ferme de manière inattendue, l'IA peut utiliser l'outil pour déclencher l'ouverture du menu, inspecter les événements "blur" ou "click-away" dans le runtime, et comprendre quel gestionnaire d'événements est responsable du comportement erroné.

Migration et Refactoring de sécurité
Lors du changement d'une bibliothèque de gestion d'état (ex: passer de Redux à Zustand), l'IA peut migrer les composants un par un et utiliser la sandbox pour vérifier que chaque composant migré conserve un état identique à la version originale en comparant les instantanés de la mémoire (snapshots) fournis par l'outil.

En résumé, l'outil transforme le débogage par IA d'un processus de "devinette" basé sur la lecture de code en un processus scientifique basé sur l'observation des faits et la validation expérimentale.

4. Stratégie de Connexion au Navigateur (Le Mur Conceptuel)
Pour que le débogage soit réellement utile, l'IA doit pouvoir inspecter l'application dans son "état bugué" (ex: après avoir rempli un formulaire). Pour y parvenir, React-Sentinel adopte une stratégie hybride à deux niveaux :

Priorité 1 : L'approche "Attach" (Idéale & Puissante)
Le serveur MCP tente d'abord de se connecter au navigateur de développement de l'utilisateur (via le protocole CDP, par exemple sur le port 9222 de Chrome). Cela permet à l'IA d'inspecter exactement l'onglet que le développeur regarde, avec son état complexe et sa session active.

Priorité 2 : L'approche "Replay" (Fallback & Sandboxing)
Si la connexion "Attach" échoue ou si le développeur refuse l'accès, l'outil bascule sur une instance isolée "headless" (Playwright). Dans ce mode de "Shadow Sandbox", l'IA peut naviguer vers l'URL depuis un état vierge et simuler les interactions nécessaires pour reproduire le bug avant de l'inspecter.