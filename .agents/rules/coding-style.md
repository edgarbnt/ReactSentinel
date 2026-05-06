---
trigger: model_decision
description: before the modification of a file
---

1. Architecture MCP

Chaque outil MCP = un fichier dans src/tools/
Toujours valider les inputs avec Zod (jamais de any)
Format de retour uniforme : { content: [{ type: "text", text: JSON.stringify(...) }] }
2. Gestion des erreurs

Jamais crasher le serveur — toujours try/catch dans les tools
Retourner une erreur structurée plutôt que de throw
3. Playwright / Browser

Toujours fermer les contextes browser dans un finally
Une session Playwright = un contexte isolé, jamais partagé entre tools
4. TypeScript

Mode strict obligatoire, zéro any, zéro as unknown
Types explicites sur tous les retours de fonctions async
5. Conventions de code

Commits en Conventional Commits (feat:, fix:, chore:)
Commentaires en anglais, messages de commit en anglais
6. Sécurité / Sandbox

Le hot-patching n'écrit jamais sur les fichiers locaux de l'user
Les sessions browser sont toujours headless sauf en mode debug explicite