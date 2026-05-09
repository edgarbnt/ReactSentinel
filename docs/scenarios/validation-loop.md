# Scénario : Boucle Observation, Correction, Validation

Ce document décrit le flux de travail recommandé pour utiliser React-Sentinel dans la résolution de bugs d'interaction.

## 1. Observation (Détection du bug)
L'agent utilise `validate_after_action` pour reproduire le bug et confirmer qu'il génère une erreur.

**Exemple d'appel :**
```json
{
  "url": "http://localhost:5176/",
  "interaction": {
    "action": "fill",
    "selector": "#buggy-input",
    "value": "bug"
  },
  "assertion": {
    "type": "no_console_errors"
  }
}
```
**Résultat attendu :** `pass: false` avec le détail de l'erreur React.

## 2. Correction (Fix dans le code)
L'agent analyse l'erreur (via la stack trace retournée) et modifie le code source pour corriger le problème.

**Modification effectuée :**
Correction du composant `BuggySearch.tsx` pour éviter le `throw`.

## 3. Validation (Confirmation du fix)
L'agent ré-exécute le même tool `validate_after_action`.

**Résultat attendu :** `pass: true`.

## Variante Sprint 8 : scénario multi-étapes avec rapport

Pour valider plusieurs invariants d'un coup, l'agent peut maintenant utiliser `validate_scenario`.

**Exemple d'appel :**
```json
{
  "url": "http://localhost:5173/",
  "steps": [
    { "action": "click", "selector": "#mock-success-button" },
    { "action": "wait", "durationMs": 300 }
  ],
  "assertions": [
    { "type": "text_present", "expected": "200 — Mock success response" },
    { "type": "selector_visible", "selector": "#mock-success-result" },
    { "type": "no_console_errors" },
    { "type": "no_http_5xx" }
  ]
}
```

**Résultat attendu :**
- un rapport JSON brut avec les étapes, assertions et traces runtime ;
- un rapport Markdown lisible pour l'IA ou le développeur ;
- `success: true` si toutes les assertions passent.

---
*Ce scénario a été validé lors du Sprint 3 (SCRUM-15) en utilisant l'application de test intégrée.*
