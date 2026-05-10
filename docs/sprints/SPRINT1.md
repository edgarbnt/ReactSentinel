# Sprint 1 — Résumé et inventaire

> **Objectif du sprint :** poser les fondations du serveur MCP React-Sentinel —
> infrastructure, premier outil de diagnostic React, app de test, documentation.

---

## Ce qui a été livré

### 🔧 Infrastructure MCP

| Fichier | Rôle |
|---|---|
| `src/index.ts` | Point d'entrée du serveur MCP (stdio transport, graceful shutdown) |
| `src/types.ts` | Types partagés — `ToolResponse`, helpers `ok()` / `err()` |

### 🛠️ Outils MCP exposés (5 tools)

| Tool | Description |
|---|---|
| `ping` | Health-check du serveur MCP |
| `get_server_info` | Métadonnées et capacités du serveur |
| `echo` | Écho de message (test transport) |
| `browser_ping` | Navigue vers une URL, retourne titre + timestamp |
| `get_runtime_status` | Snapshot complet : titre, viewport, détection React |

### 🌐 Couche navigateur (Playwright)

| Fichier | Rôle |
|---|---|
| `src/browser/index.ts` | `BrowserManager` — launch/close Chromium, contextes isolés par appel |
| `src/browser/protocol.ts` | Types `BrowserResult`, `PingData` |

### 🔬 Diagnostics React

| Fichier | Rôle |
|---|---|
| `src/diagnostics/react-detector.ts` | Détecte React côté navigateur (3 stratégies : fiber keys, DevTools hook, legacy) |
| `src/diagnostics/protocol.ts` | Types `ReactInfo`, `RuntimeStatus` |
| `src/diagnostics/index.ts` | Barrel export |

### 🧪 App de test

| Fichier | Rôle |
|---|---|
| `examples/test-app/` | Mini-app React 18 + Vite sur `:5173` |
| `examples/test-app/src/App.tsx` | Page fixture avec compteur `useState` |

### 📄 Documentation

| Fichier | Contenu |
|---|---|
| `README.md` | Prérequis, lancement local étape par étape, config Claude Desktop |
| `docs/sprints/SPRINT1.md` | Ce fichier — inventaire du sprint |
| `docs/project-history/BLUEPRINT.fr.md` | Vision technique long terme du projet |

---

## Résultats des tests — validation manuelle

> Voir `docs/test-scenario-sprint1.md` pour le scénario détaillé.

### Commandes testées

| Tool | URL | Résultat |
|---|---|---|
| `ping` | — | ✅ `{ status: "online" }` |
| `echo` | — | ✅ Message renvoyé à l'identique |
| `browser_ping` | `http://localhost:5173` | ✅ Titre et URL corrects |
| `get_runtime_status` | `http://localhost:5173` | ✅ React détecté, version 18.x |
| `get_runtime_status` | `http://localhost:9999` | ✅ Erreur structurée, pas de crash |

---

## Ce qui n'est pas encore là (Sprint 2+)

- Inspection de l'arbre React Fiber (`get_react_tree`)
- Capture des erreurs console (`get_console_events`)
- Inspection ciblée par composant (`inspect_component`)
- Interactions navigateur (clic, fill)

---

## Tickets Jira associés

| Ticket | Résumé | Statut |
|---|---|---|
| SCRUM-10 | [Sprint 1] Documenter le lancement local et le scénario de test minimal | ✅ Terminé |
| SCRUM-27 | Écrire les étapes de lancement local dans le README | ✅ Terminé |
| SCRUM-29 | Documenter le scénario de test minimal de bout en bout | ✅ Terminé |
