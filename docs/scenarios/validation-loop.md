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

## Variante : scénario multi-étapes avec rapport

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

## Variante : patch éphémère + replay + verdict

Pour tester une correction sans modifier les fichiers locaux, l'agent peut maintenant utiliser `apply_patch_then_replay`.

**Exemple d'appel :**
```json
{
  "url": "http://localhost:5173/",
  "patch": {
    "type": "script",
    "target": "page",
    "source": "const originalFetch = window.fetch.bind(window); if (!window.__RS_PATCH__) { window.__RS_PATCH__ = true; window.fetch = async (input, init) => { const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url; if (url.includes('/api/mock/error')) { return new Response(JSON.stringify({ scenario: 'patched', message: 'Patched success response' }), { status: 200, headers: { 'content-type': 'application/json' } }); } return originalFetch(input, init); }; }",
    "metadata": {
      "id": "mock-error-fix",
      "label": "mock-api-error-fix",
      "source": "ai-generated",
      "expiresWithSession": true
    }
  },
  "steps": [
    { "action": "click", "selector": "#mock-error-button" },
    { "action": "wait", "durationMs": 300 }
  ],
  "assertions": [
    { "type": "text_present", "expected": "Error: 200 — Patched success response" },
    { "type": "no_http_5xx" }
  ]
}
```

**Résultat attendu :**
- `verdict: "patch_validated"` quand le patch corrige effectivement le scénario rejoué ;
- un rapport JSON + Markdown combinant patch, replay, assertions et nettoyage ;
- un sandbox propre après le flux, grâce au cleanup par défaut via reset de session.

---
*Ce scénario a été validé sur l'application de test intégrée.*
