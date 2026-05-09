# Sprint 5 Report - React-Sentinel

## Objectif

Le Sprint 5 a fait passer React-Sentinel du mode **observateur distant** au mode **attach live** :
- connexion a un Chrome expose en CDP,
- selection explicite d'un onglet cible avec consentement,
- reusabilite du runtime bridge dans un onglet reel,
- inspection React plus riche (arbre, composant, etat),
- sorties plus compactes pour mieux servir un agent IA.

## Key Accomplishments

### 1. Attach navigateur reel via CDP
- **Detection de l'endpoint CDP** : `get_attach_status` verifie qu'un Chrome expose bien `/json/version` et retourne un diagnostic machine-readable.
- **Inventaire des onglets** : `get_attach_tabs` liste les onglets `page` exposes par `/json/list`, avec support de filtres par URL et par titre.
- **Selection explicite** : `select_attach_tab` permet de choisir un onglet par index, URL ou titre.
- **Consentement utilisateur** : la selection peut rester en mode preview tant qu'elle n'est pas confirmee, pour eviter un branchement involontaire sur un onglet reel.

**Ce que cela change :** React-Sentinel peut inspecter le navigateur deja ouvert par le developpeur au lieu de toujours repartir d'un navigateur sandboxe.

### 2. Runtime bridge partage entre sandbox et attach
- **Un seul chemin runtime** : les outils de diagnostic utilisent maintenant `getRuntimePage()` pour basculer soit vers la sandbox Playwright, soit vers l'onglet attach selectionne.
- **Injection idempotente du bridge** : le bridge runtime est installe une seule fois par page pour capturer les evenements sans dupliquer les hooks.
- **Capture des signaux runtime dans l'onglet reel** : le bridge garde les interceptions `fetch`/`XMLHttpRequest`, le buffer reseau et les evenements console sur le bon contexte.
- **Nettoyage explicite** : si l'onglet cible disparait ou si une nouvelle selection est faite, la connexion attach est fermee proprement.

**Ce que cela change :** les outils d'observation fonctionnent dans le vrai contexte utilisateur, sans diverger entre sandbox et live tab.

### 3. Inspection React plus riche
- **Extraction du Fiber tree** : `get_react_tree` s'appuie sur un inspecteur runtime unifie pour reconstruire l'arbre React.
- **Inspection de composant** : `inspect_component` retourne les props, le chemin dans l'arbre, les contextes traverses et un resume compact.
- **Inspection de l'etat hook** : `get_component_state` expose les hooks serialisables d'un composant React.
- **Modes de reponse** : `full` et `compact` permettent d'adapter la charge au besoin de l'agent.

**Ce que cela change :** l'IA peut lire l'etat React interne sans se limiter au DOM visible.

### 4. Protocoles de donnees enrichis
- **Types dedies** : le protocole inclut maintenant les structures pour les onglets CDP, les selections attach, les hooks, les contextes et les resumes d'inspection.
- **Format normalise** : les sorties d'inspection exposent `found`, `responseMode`, `summary` et des objets stables pour faciliter l'analyse cote agent.
- **Erreurs structurees** : les echecs d'inspection utilisent des codes comme `runtime_unreachable`, `page_reloaded` et `inspection_failed`.

**Ce que cela change :** les erreurs sont plus actionnables et plus simples a filtrer dans un flux IA.

### 5. Couches de securite et d'ergonomie
- **Mise en garde explicite** : le mode attach avertit quand un onglet reel va etre reutilise.
- **Sorties compactes** : les payloads lourds peuvent etre fortement reduits pour eviter le bruit contextuel.
- **Separation sandbox / live** : le code conserve un chemin sandboxe pour les tests et un chemin attach pour l'observation sur session reelle.

**Ce que cela change :** l'outil reste exploitable sur des pages sensibles sans sacrifier la precision d'inspection.

## Technical Choices

- **Consentement avant reuse d'un onglet live** : un navigateur reel porte l'etat de l'utilisateur. On impose donc une confirmation explicite avant de basculer les outils dessus.
- **Bridge runtime idempotent** : l'injection est protege par un flag global pour eviter les doubles patchs et les evenements dupliques.
- **Unification par `ReactRuntimeInspectRequest`** : arbre, composant et etat utilisent une seule logique runtime cote navigateur, ce qui limite la duplication et les derives.
- **Mode compact/full :** les sorties d'inspection peuvent etre reserrees pour garder des reponses exploitables par un agent sans exploser le contexte.
- **Nettoyage des connexions attach** : on ferme et on reinitialise les sessions CDP quand l'onglet change ou disparait afin d'eviter les references mortes.
- **Erreurs typées et stables** : les messages structurees facilitent le debug agentique et la priorisation des echecs.

## Validation

Le sprint a ete valide avec :
- `pnpm check`
- `pnpm build`
- un smoke test local sur `get_attach_tabs` et `select_attach_tab` via un endpoint CDP mocke

## Jira Tickets Completed

- **SCRUM-98** : [S5-01][CDP Attach] Detecter un Chrome expose sur le port 9222
- **SCRUM-103** : [S5-02][CDP Attach] Lister et selectionner un onglet cible
- **SCRUM-101** : [S5-03][CDP Attach] Connecter React-Sentinel a l'onglet selectionne
- **SCRUM-96** : [S5-04][Security] Ajouter des garde-fous de consentement utilisateur

### Subtasks delivered
- **SCRUM-128** : Recuperer la liste des onglets CDP
- **SCRUM-133** : Filtrer les onglets par URL ou titre
- **SCRUM-130** : Selectionner un onglet cible par identifiant
- **SCRUM-127** : Gerer le cas aucun onglet compatible trouve
- **SCRUM-137** : Ouvrir une connexion WebSocket CDP vers l'onglet
- **SCRUM-134** : Injecter le bridge runtime dans la page attachee
- **SCRUM-139** : Valider `get_runtime_status` en mode attach
- **SCRUM-135** : Gerer la deconnexion ou fermeture de l'onglet attache
- **SCRUM-136** : Definir le message de consentement du mode attach
- **SCRUM-138** : Bloquer l'attach sans confirmation explicite

## Outcome

Au terme du Sprint 5, React-Sentinel peut maintenant :
- verifier qu'un Chrome CDP est disponible,
- lister et selectionner un onglet reel,
- exiger un consentement avant reuse,
- injecter le bridge runtime dans la session live,
- lire le runtime React dans un contexte reel,
- et renvoyer des diagnostics plus courts et plus robustes pour l'agent.

Cela rapproche le projet de la boucle cible : **observer -> patch -> valider** sur un navigateur deja en cours d'utilisation.
