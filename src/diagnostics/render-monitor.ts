import type {
  ComponentHookKind,
  HookChangeEntry,
  HookChangesSummary,
  RenderCountEntry,
  RenderCountsSummary,
  RenderHotspotCause,
  RenderHotspotEntry,
} from "./protocol.js";

export interface RenderMonitorInitArgs {
  globalKey: string;
  installedGlobalKey: string;
  maxEntries: number;
  maxSamplesPerComponent: number;
}

type RenderCountsReadRequest = {
  mode: string;
  globalKey?: string;
  limit?: number;
  threshold?: number;
  windowMs?: number;
};

type RenderCountSample = {
  timestamp: string;
  renderId: number;
  props: Record<string, unknown>;
  parentName: string | null;
  contexts: {
    name: string;
    source: "dependency" | "provider";
    value: unknown;
  }[];
  hooks: {
    index: number;
    kind: ComponentHookKind;
    value: unknown;
  }[];
};

type RenderCountRecord = RenderCountEntry & {
  samples: RenderCountSample[];
};

export function buildRenderMonitorSource(args: RenderMonitorInitArgs): string {
  return `(() => {
    const { globalKey, installedGlobalKey, maxEntries, maxSamplesPerComponent } = ${JSON.stringify(args)};
    const windowWithMonitor = window;

    const isRecord = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

    const ensureState = () => {
      const current = Reflect.get(windowWithMonitor, globalKey);
      if (isRecord(current) && isRecord(current.components)) {
        if (typeof current.commitCount !== "number") current.commitCount = 0;
        if (typeof current.nextRenderId !== "number") current.nextRenderId = 1;
        return current;
      }

      const initialState = {
        installedAt: new Date().toISOString(),
        commitCount: 0,
        nextRenderId: 1,
        components: Object.create(null),
      };
      Reflect.set(windowWithMonitor, globalKey, initialState);
      return initialState;
    };

    const limits = {
      maxDepth: 2,
      maxStringLength: 80,
      maxArrayLength: 6,
      maxObjectKeys: 8,
      maxTotalNodes: 60,
    };

    const serializeValue = (value) => {
      const seen = new WeakSet();
      const budget = { remainingNodes: limits.maxTotalNodes };

      const inner = (current, depth) => {
        if (budget.remainingNodes <= 0) return "[MaxNodesReached]";
        if (current === null || current === undefined) return current;
        if (typeof current === "string") {
          return current.length > limits.maxStringLength ? current.slice(0, limits.maxStringLength) + "..." : current;
        }
        if (typeof current === "number" || typeof current === "boolean") return current;
        if (typeof current === "bigint") return "[BigInt:" + String(current) + "]";
        if (typeof current === "symbol") return "[Symbol:" + String(current.description ?? "") + "]";
        if (typeof current === "function") return "[Function:" + (current.name || "anonymous") + "]";
        if (typeof Element !== "undefined" && current instanceof Element) {
          return "[HTMLElement:" + current.tagName.toLowerCase() + "]";
        }
        if (current instanceof Date) {
          return Number.isNaN(current.getTime()) ? "[Date]" : current.toISOString();
        }
        if (typeof current !== "object") return String(current);
        if (seen.has(current)) return "[Circular]";
        if (depth >= limits.maxDepth) return "[MaxDepthReached]";

        seen.add(current);
        budget.remainingNodes -= 1;

        if (Array.isArray(current)) {
          const entries = current.slice(0, limits.maxArrayLength).map((entry) => inner(entry, depth + 1));
          if (current.length > limits.maxArrayLength) {
            entries.push("[+" + (current.length - limits.maxArrayLength) + " more items]");
          }
          return entries;
        }

        const keys = Object.keys(current).slice(0, limits.maxObjectKeys);
        const result = {};
        for (const key of keys) {
          result[key] = inner(current[key], depth + 1);
        }
        if (Object.keys(current).length > keys.length) {
          result.__truncatedKeys = Object.keys(current).length - keys.length;
        }
        return result;
      };

      return inner(value, 0);
    };

    const serializeProps = (value) => {
      if (!value || typeof value !== "object") return {};
      const props = value;
      const result = {};
      const keys = Object.keys(props).filter((key) => key !== "children").slice(0, limits.maxObjectKeys);
      for (const key of keys) {
        result[key] = serializeValue(props[key]);
      }
      if (Object.keys(props).filter((key) => key !== "children").length > keys.length) {
        result.__truncatedKeys = Object.keys(props).filter((key) => key !== "children").length - keys.length;
      }
      return result;
    };

    const isFiber = (value) => Boolean(value && typeof value === "object" && ("child" in value || "memoizedProps" in value));

    const findRootFiber = () => {
      const root = document.getElementById("root");
      const candidates = [
        root,
        root?.firstElementChild,
        document.querySelector("[data-reactroot]"),
        document.body?.firstElementChild,
        document.body,
      ].filter((element) => element !== null && element !== undefined);

      let rootFiber = null;
      for (const element of candidates) {
        const key = Object.keys(element).find((candidate) => candidate.startsWith("__reactFiber"));
        if (!key) continue;
        rootFiber = Reflect.get(element, key) ?? null;
        if (rootFiber) break;
      }

      if (!rootFiber) return null;

      let currentFiber = rootFiber;
      while (currentFiber && currentFiber.return) {
        currentFiber = currentFiber.return;
      }

      if (
        currentFiber &&
        typeof currentFiber === "object" &&
        "stateNode" in currentFiber &&
        currentFiber.stateNode &&
        typeof currentFiber.stateNode === "object" &&
        "current" in currentFiber.stateNode &&
        isFiber(currentFiber.stateNode.current)
      ) {
        return currentFiber.stateNode.current;
      }

      return currentFiber;
    };

    const getContextName = (context) => {
      if (!context || typeof context !== "object") return "AnonymousContext";
      return typeof context.displayName === "string" && context.displayName.trim().length > 0
        ? context.displayName
        : "AnonymousContext";
    };

    const getFiberContextObject = (fiber) => {
      if (!fiber.type || typeof fiber.type !== "object") return null;
      return fiber.type._context ?? fiber.type.context ?? null;
    };

    const getTypeDisplayName = (type) => {
      if (!type) return null;
      if (typeof type === "string") return type;
      if (typeof type === "function") {
        return type.displayName || type.name || null;
      }
      if (typeof type === "object") {
        if (typeof type.displayName === "string" && type.displayName.trim().length > 0) {
          return type.displayName;
        }
        if (typeof type.render === "function") {
          const renderName = type.render.displayName || type.render.name || "Anonymous";
          return "ForwardRef(" + renderName + ")";
        }
        if ("type" in type) {
          const innerName = getTypeDisplayName(type.type);
          return innerName ? "Memo(" + innerName + ")" : "Memo";
        }
      }
      return null;
    };

    const getComponentName = (fiber) => {
      if (typeof fiber.type === "string") return fiber.type;
      if (typeof fiber.type === "function") {
        return fiber.type.displayName || fiber.type.name || "Anonymous";
      }
      if (fiber.tag === 10) {
        return getContextName(getFiberContextObject(fiber)) + ".Provider";
      }
      const resolvedName = getTypeDisplayName(fiber.type);
      if (resolvedName) {
        return resolvedName;
      }
      if (fiber.tag === 3) return "HostRoot";
      return "AnonymousComposite";
    };

    const classifyHook = (hook, index) => {
      const value = hook.memoizedState;
      if (hook.queue && typeof hook.queue === "object" && "pending" in hook.queue) {
        return { index, kind: "state", value: serializeValue(value) };
      }
      if (value && typeof value === "object" && "current" in value) {
        return { index, kind: "ref", value: serializeValue(value.current) };
      }
      if (Array.isArray(value) && value.length === 2 && Array.isArray(value[1])) {
        return { index, kind: "memo", value: serializeValue(value[0]) };
      }
      if (value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value)) {
        return { index, kind: "unknown", value: serializeValue(value) };
      }
      return null;
    };

    const extractHooks = (fiber) => {
      const hooks = [];
      const visited = new WeakSet();
      let currentHook = fiber.memoizedState;
      let index = 0;
      while (currentHook && typeof currentHook === "object" && !visited.has(currentHook) && index < 25) {
        visited.add(currentHook);
        const detected = classifyHook(currentHook, index);
        if (detected) hooks.push(detected);
        currentHook = currentHook.next ?? null;
        index += 1;
      }
      return hooks;
    };

    const extractContexts = (fiber, pathFibers) => {
      const fromDependencies = [];
      const firstContext = fiber.dependencies?.firstContext;
      const dependencySeen = new Set();
      let current = firstContext;

      while (current && typeof current === "object") {
        const name = getContextName(current.context);
        if (!dependencySeen.has(name)) {
          dependencySeen.add(name);
          fromDependencies.push({
            name,
            source: "dependency",
            value: serializeValue(current.memoizedValue),
          });
        }
        current = current.next ?? null;
      }

      if (fromDependencies.length > 0) {
        return fromDependencies;
      }

      const providers = [];
      for (const pathFiber of pathFibers) {
        if (!(pathFiber.tag === 10 && pathFiber.memoizedProps && typeof pathFiber.memoizedProps === "object" && "value" in pathFiber.memoizedProps)) {
          continue;
        }
        providers.push({
          name: getContextName(getFiberContextObject(pathFiber)),
          source: "provider",
          value: serializeValue(pathFiber.memoizedProps.value),
        });
      }

      return providers;
    };

    const isTrackableComponent = (fiber) => {
      if (!isFiber(fiber)) return false;
      if (fiber.tag === 3 || fiber.tag === 6 || fiber.tag === 10) return false;
      return typeof fiber.type !== "string";
    };

    const didRender = (fiber) => {
      if (!fiber.alternate) return true;
      if (fiber.memoizedProps !== fiber.alternate.memoizedProps) return true;
      if (fiber.memoizedState !== fiber.alternate.memoizedState) return true;
      return typeof fiber.flags === "number" && fiber.flags !== 0;
    };

    const trimComponents = (components) => {
      const keys = Object.keys(components);
      if (keys.length <= maxEntries) return;
      const sortedKeys = keys.sort((left, right) => String(components[left]?.lastSeen ?? "").localeCompare(String(components[right]?.lastSeen ?? "")));
      while (sortedKeys.length > maxEntries) {
        const key = sortedKeys.shift();
        if (key) delete components[key];
      }
    };

    const recordRender = (fiber, path, pathFibers) => {
      const state = ensureState();
      const timestamp = new Date().toISOString();
      const componentName = getComponentName(fiber);
      const pathText = path.join(" > ");
      const recordKey = pathText || componentName;
      let entry = state.components[recordKey];
      if (!isRecord(entry)) {
        entry = {
          componentName,
          pathText,
          count: 0,
          firstSeen: timestamp,
          lastSeen: timestamp,
          samples: [],
        };
        state.components[recordKey] = entry;
        trimComponents(state.components);
      }

      entry.count += 1;
      entry.lastSeen = timestamp;
      entry.samples.push({
        timestamp,
        renderId: state.nextRenderId++,
        props: serializeProps(fiber.memoizedProps),
        parentName: path.length > 1 ? path[path.length - 2] : null,
        contexts: extractContexts(fiber, pathFibers),
        hooks: extractHooks(fiber),
      });
      if (entry.samples.length > maxSamplesPerComponent) {
        entry.samples.splice(0, entry.samples.length - maxSamplesPerComponent);
      }
    };

    const walk = (fiber, path, pathFibers) => {
      if (!isFiber(fiber) || fiber.tag === 6) return;
      const trackable = isTrackableComponent(fiber);
      const nextPath = trackable ? path.concat(getComponentName(fiber)) : path;
      const nextPathFibers = trackable ? pathFibers.concat(fiber) : pathFibers;
      if (trackable && didRender(fiber)) {
        recordRender(fiber, nextPath, nextPathFibers);
      }

      let child = fiber.child;
      while (child) {
        walk(child, nextPath, nextPathFibers);
        child = child.sibling;
      }
    };

    const captureCommit = (rootLike) => {
      const state = ensureState();
      const rootFiber =
        rootLike && typeof rootLike === "object" && "current" in rootLike && isFiber(rootLike.current)
          ? rootLike.current
          : rootLike;
      if (!isFiber(rootFiber)) return;
      state.commitCount += 1;

      let child = rootFiber.child;
      while (child) {
        walk(child, [], []);
        child = child.sibling;
      }
    };

    const alreadyInstalled = Reflect.get(windowWithMonitor, installedGlobalKey) === true;
    if (!alreadyInstalled) {
      let hook = Reflect.get(windowWithMonitor, "__REACT_DEVTOOLS_GLOBAL_HOOK__");
      if (!isRecord(hook)) {
        hook = {};
        Reflect.set(windowWithMonitor, "__REACT_DEVTOOLS_GLOBAL_HOOK__", hook);
      }

      if (!(hook.renderers instanceof Map)) {
        hook.renderers = new Map();
      }
      if (hook.supportsFiber !== true) {
        hook.supportsFiber = true;
      }

      const originalInject = typeof hook.inject === "function" ? hook.inject.bind(hook) : null;
      hook.__rsNextRendererId = typeof hook.__rsNextRendererId === "number" ? hook.__rsNextRendererId : 1;
      hook.inject = (renderer) => {
        const nextId = hook.__rsNextRendererId++;
        const injectedId = originalInject ? originalInject(renderer) : nextId;
        hook.renderers.set(injectedId, renderer);
        return injectedId;
      };

      const originalOnCommitFiberRoot =
        typeof hook.onCommitFiberRoot === "function" ? hook.onCommitFiberRoot.bind(hook) : null;
      hook.onCommitFiberRoot = (rendererId, root, ...rest) => {
        try {
          captureCommit(root);
        } catch {}
        if (originalOnCommitFiberRoot) {
          return originalOnCommitFiberRoot(rendererId, root, ...rest);
        }
      };

      Reflect.set(windowWithMonitor, installedGlobalKey, true);
    }

    try {
      const rootFiber = findRootFiber();
      if (rootFiber && Object.keys(ensureState().components).length === 0) {
        captureCommit(rootFiber);
      }
    } catch {}
  })();`;
}

function normalizeState(stateValue: unknown): {
  commitCount: number;
  counts: RenderCountRecord[];
} {
  const state =
    stateValue && typeof stateValue === "object"
      ? (stateValue as {
          commitCount?: unknown;
          components?: Record<string, RenderCountRecord>;
        })
      : null;
  const counts = Object.values(state?.components ?? {})
    .map((entry) => ({
      componentName: entry.componentName,
      pathText: entry.pathText,
      count: entry.count,
      firstSeen: entry.firstSeen,
      lastSeen: entry.lastSeen,
      samples: Array.isArray(entry.samples) ? entry.samples : [],
    }))
    .sort((left, right) => right.count - left.count || right.lastSeen.localeCompare(left.lastSeen));

  return {
    commitCount: typeof state?.commitCount === "number" ? state.commitCount : 0,
    counts,
  };
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${key}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return String(value);
}

function buildProbableCause(entry: RenderCountRecord): RenderHotspotCause {
  const samples = [...entry.samples].sort((left, right) => left.renderId - right.renderId);
  if (samples.length < 2) {
    return {
      type: "unknown",
      summary: "Not enough render history has been captured to explain this hotspot yet.",
    };
  }

  const hookChanges = new Map<string, { index: number; kind: ComponentHookKind; changeCount: number }>();
  let propChangeCount = 0;
  let contextChangeCount = 0;
  let providerChangeCount = 0;
  let parentRenderCount = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previousSample = samples[index - 1];
    const currentSample = samples[index];

    const propsChanged = stableStringify(previousSample.props) !== stableStringify(currentSample.props);
    if (propsChanged) {
      propChangeCount += 1;
    }

    const previousContexts = new Map(previousSample.contexts.map((context) => [`${context.name}:${context.source}`, context] as const));
    const currentContexts = new Map(currentSample.contexts.map((context) => [`${context.name}:${context.source}`, context] as const));
    const contextKeys = new Set([...previousContexts.keys(), ...currentContexts.keys()]);
    let contextChanged = false;
    let providerChanged = false;
    for (const contextKey of contextKeys) {
      const previousContext = previousContexts.get(contextKey);
      const currentContext = currentContexts.get(contextKey);
      const previousValue = previousContext ? stableStringify(previousContext.value) : "undefined";
      const currentValue = currentContext ? stableStringify(currentContext.value) : "undefined";
      if (previousValue === currentValue) continue;
      contextChanged = true;
      if ((currentContext?.source ?? previousContext?.source) === "provider") {
        providerChanged = true;
      }
    }
    if (contextChanged) {
      contextChangeCount += 1;
    }
    if (providerChanged) {
      providerChangeCount += 1;
    }

    const previousHooks = new Map(previousSample.hooks.map((hook) => [`${hook.index}:${hook.kind}`, hook] as const));
    const currentHooks = new Map(currentSample.hooks.map((hook) => [`${hook.index}:${hook.kind}`, hook] as const));
    const hookKeys = new Set([...previousHooks.keys(), ...currentHooks.keys()]);
    let hookChanged = false;
    for (const hookKey of hookKeys) {
      const previousHook = previousHooks.get(hookKey);
      const currentHook = currentHooks.get(hookKey);
      const previousValue = previousHook ? stableStringify(previousHook.value) : "undefined";
      const currentValue = currentHook ? stableStringify(currentHook.value) : "undefined";
      if (previousValue === currentValue) continue;
      hookChanged = true;

      const currentStat = hookChanges.get(hookKey);
      hookChanges.set(hookKey, {
        index: currentHook?.index ?? previousHook?.index ?? -1,
        kind: currentHook?.kind ?? previousHook?.kind ?? "unknown",
        changeCount: (currentStat?.changeCount ?? 0) + 1,
      });
    }

    if (!propsChanged && !contextChanged && !hookChanged && previousSample.parentName === currentSample.parentName) {
      parentRenderCount += 1;
    }
  }

  const transitions = samples.length - 1;
  const dominantHook = [...hookChanges.values()].sort((left, right) => right.changeCount - left.changeCount)[0] ?? null;
  const hotThreshold = Math.max(2, transitions - 1);

  if (dominantHook && dominantHook.changeCount >= hotThreshold) {
    if (dominantHook.kind === "state") {
      return {
        type: "state_change",
        summary: `State hook #${dominantHook.index} changed on ${dominantHook.changeCount}/${transitions} recent render transitions.`,
      };
    }

    return {
      type: "hook_instability",
      summary: `Hook #${dominantHook.index} (${dominantHook.kind}) changed on ${dominantHook.changeCount}/${transitions} recent render transitions.`,
    };
  }

  if (providerChangeCount >= hotThreshold) {
    return {
      type: "provider_value_recreated",
      summary: `An upstream provider value changed on ${providerChangeCount}/${transitions} recent render transitions.`,
    };
  }

  if (contextChangeCount >= hotThreshold) {
    return {
      type: "context_change",
      summary: `Observed context values changed on ${contextChangeCount}/${transitions} recent render transitions.`,
    };
  }

  if (propChangeCount >= hotThreshold) {
    return {
      type: "prop_diff",
      summary: `Props changed on ${propChangeCount}/${transitions} recent render transitions.`,
    };
  }

  if (parentRenderCount >= hotThreshold) {
    return {
      type: "parent_render",
      summary: "The component rerendered repeatedly without dominant local prop, hook, or context changes, which suggests parent-driven rerenders.",
    };
  }

  if (dominantHook && dominantHook.changeCount > 0) {
    if (dominantHook.kind === "state") {
      return {
        type: "state_change",
        summary: `State hook #${dominantHook.index} changed on ${dominantHook.changeCount}/${transitions} recent render transitions.`,
      };
    }

    return {
      type: "hook_instability",
      summary: `Hook #${dominantHook.index} (${dominantHook.kind}) changed on ${dominantHook.changeCount}/${transitions} recent render transitions.`,
    };
  }

  if (providerChangeCount > 0) {
    return {
      type: "provider_value_recreated",
      summary: `An upstream provider value changed on ${providerChangeCount}/${transitions} recent render transitions.`,
    };
  }

  if (contextChangeCount > 0) {
    return {
      type: "context_change",
      summary: `Observed context values changed on ${contextChangeCount}/${transitions} recent render transitions.`,
    };
  }

  if (propChangeCount > 0) {
    return {
      type: "prop_diff",
      summary: `Props changed on ${propChangeCount}/${transitions} recent render transitions.`,
    };
  }

  if (parentRenderCount > 0) {
    return {
      type: "parent_render",
      summary: "The component rerendered repeatedly without dominant local prop, hook, or context changes, which suggests parent-driven rerenders.",
    };
  }

  return {
    type: "unknown",
    summary: "Recent renders kept repeating, but React-Sentinel could not isolate one dominant cause from props, hooks, contexts, or parent churn.",
  };
}

export function readRenderCountsState(
  stateValue: unknown,
  options?: Pick<RenderCountsReadRequest, "limit">
): {
  counts: RenderCountRecord[];
  summary: RenderCountsSummary;
} {
  const limit = typeof options?.limit === "number" && options.limit > 0 ? options.limit : 50;
  const normalized = normalizeState(stateValue);
  const emptySummary: RenderCountsSummary = {
    totalComponents: 0,
    totalRenders: 0,
    observedCommits: 0,
  };

  if (normalized.counts.length === 0) {
    return {
      counts: [],
      summary: emptySummary,
    };
  }

  return {
    counts: normalized.counts.slice(0, limit),
    summary: {
      totalComponents: normalized.counts.length,
      totalRenders: normalized.counts.reduce((total, entry) => total + entry.count, 0),
      observedCommits: normalized.commitCount,
    },
  };
}

export function readRenderHotspotsState(
  stateValue: unknown,
  options?: Pick<RenderCountsReadRequest, "threshold" | "windowMs" | "limit">
): {
  threshold: number;
  windowMs: number;
  hotspots: RenderHotspotEntry[];
} {
  const threshold = typeof options?.threshold === "number" && options.threshold > 0 ? options.threshold : 8;
  const windowMs = typeof options?.windowMs === "number" && options.windowMs > 0 ? options.windowMs : 1000;
  const limit = typeof options?.limit === "number" && options.limit > 0 ? options.limit : 20;
  const normalized = normalizeState(stateValue);
  const now = Date.now();

  const hotspots = normalized.counts
    .map((entry) => {
      const recentRenderCount = entry.samples.filter((sample) => {
        const sampleTime = Date.parse(sample.timestamp);
        return Number.isFinite(sampleTime) && now - sampleTime <= windowMs;
      }).length;

      const rendersPerSecond = Number(((recentRenderCount / windowMs) * 1000).toFixed(2));
      return {
        componentName: entry.componentName,
        pathText: entry.pathText,
        count: entry.count,
        firstSeen: entry.firstSeen,
        lastSeen: entry.lastSeen,
        recentRenderCount,
        threshold,
        windowMs,
        rendersPerSecond,
        probableCause: buildProbableCause(entry),
      };
    })
    .filter((entry) => entry.recentRenderCount >= threshold)
    .sort(
      (left, right) =>
        right.recentRenderCount - left.recentRenderCount ||
        right.rendersPerSecond - left.rendersPerSecond ||
        right.count - left.count
    )
    .slice(0, limit);

  return {
    threshold,
    windowMs,
    hotspots,
  };
}

export function readHookChangesState(
  stateValue: unknown,
  options: {
    componentName: string;
    pathText?: string;
    limit?: number;
  }
): {
  componentName: string;
  pathText: string | null;
  found: boolean;
  changes: HookChangeEntry[];
  summary: HookChangesSummary;
} {
  const normalized = normalizeState(stateValue);
  const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : 50;
  const matches = normalized.counts.filter((entry) => {
    if (entry.componentName !== options.componentName) return false;
    if (options.pathText) return entry.pathText === options.pathText;
    return true;
  });
  const target =
    matches.sort((left, right) => right.count - left.count || right.lastSeen.localeCompare(left.lastSeen))[0] ?? null;

  if (!target) {
    return {
      componentName: options.componentName,
      pathText: options.pathText ?? null,
      found: false,
      changes: [],
      summary: {
        trackedRenders: 0,
        totalChanges: 0,
        suspiciousHooks: [],
        probableCause: "No render history was captured for this component.",
      },
    };
  }

  const samples = [...target.samples].sort((left, right) => left.renderId - right.renderId);
  const changes: HookChangeEntry[] = [];
  const changeCounts = new Map<string, { hookIndex: number; hookKind: ComponentHookKind; changeCount: number }>();

  for (let index = 1; index < samples.length; index += 1) {
    const previousSample = samples[index - 1];
    const currentSample = samples[index];
    const previousHooks = new Map(previousSample.hooks.map((hook) => [`${hook.index}:${hook.kind}`, hook] as const));
    const currentHooks = new Map(currentSample.hooks.map((hook) => [`${hook.index}:${hook.kind}`, hook] as const));
    const hookKeys = new Set([...previousHooks.keys(), ...currentHooks.keys()]);

    for (const hookKey of hookKeys) {
      const previousHook = previousHooks.get(hookKey);
      const currentHook = currentHooks.get(hookKey);
      const previousValue = previousHook ? stableStringify(previousHook.value) : "undefined";
      const currentValue = currentHook ? stableStringify(currentHook.value) : "undefined";
      if (previousValue === currentValue) continue;

      changes.push({
        timestamp: currentSample.timestamp,
        renderId: currentSample.renderId,
        hookIndex: currentHook?.index ?? previousHook?.index ?? -1,
        hookKind: currentHook?.kind ?? previousHook?.kind ?? "unknown",
        previousValue: previousHook?.value ?? null,
        nextValue: currentHook?.value ?? null,
      });

      const currentStat = changeCounts.get(hookKey);
      changeCounts.set(hookKey, {
        hookIndex: currentHook?.index ?? previousHook?.index ?? -1,
        hookKind: currentHook?.kind ?? previousHook?.kind ?? "unknown",
        changeCount: (currentStat?.changeCount ?? 0) + 1,
      });
    }
  }

  const transitions = Math.max(0, samples.length - 1);
  const suspicionThreshold = Math.max(2, transitions - 1);
  const suspiciousHooks = [...changeCounts.values()]
    .sort((left, right) => right.changeCount - left.changeCount)
    .map((entry) => ({
      hookIndex: entry.hookIndex,
      hookKind: entry.hookKind,
      changeCount: entry.changeCount,
      suspected: entry.changeCount >= suspicionThreshold,
    }));

  const lead = suspiciousHooks[0] ?? null;
  const probableCause =
    lead && lead.suspected
      ? lead.hookKind === "state"
        ? `State hook #${lead.hookIndex} kept changing across renders and is the most likely unstable value.`
        : `Hook #${lead.hookIndex} (${lead.hookKind}) kept changing across renders and is the most likely unstable value.`
      : changes.length > 0
        ? "Hook changes were detected, but no single hook dominated the recent render transitions."
        : "No hook value changed across the captured renders.";

  return {
    componentName: target.componentName,
    pathText: target.pathText || null,
    found: true,
    changes: changes.slice(-limit),
    summary: {
      trackedRenders: samples.length,
      totalChanges: changes.length,
      suspiciousHooks,
      probableCause,
    },
  };
}
