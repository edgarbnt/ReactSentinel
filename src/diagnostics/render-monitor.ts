import type { ComponentHookKind, RenderCountEntry, RenderCountsSummary } from "./protocol.js";

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
};

type RenderCountSample = {
  timestamp: string;
  renderId: number;
  props: Record<string, unknown>;
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

    const getComponentName = (fiber) => {
      if (typeof fiber.type === "string") return fiber.type;
      if (typeof fiber.type === "function") {
        return fiber.type.displayName || fiber.type.name || "Anonymous";
      }
      if (fiber.tag === 10) {
        return getContextName(getFiberContextObject(fiber)) + ".Provider";
      }
      if (fiber.type && typeof fiber.type === "object" && typeof fiber.type.displayName === "string") {
        return fiber.type.displayName;
      }
      if (fiber.tag === 3) return "HostRoot";
      return "Context/Memo/ForwardRef";
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

    const recordRender = (fiber, path) => {
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
        hooks: extractHooks(fiber),
      });
      if (entry.samples.length > maxSamplesPerComponent) {
        entry.samples.splice(0, entry.samples.length - maxSamplesPerComponent);
      }
    };

    const walk = (fiber, path) => {
      if (!isFiber(fiber) || fiber.tag === 6) return;
      const trackable = isTrackableComponent(fiber);
      const nextPath = trackable ? path.concat(getComponentName(fiber)) : path;
      if (trackable && didRender(fiber)) {
        recordRender(fiber, nextPath);
      }

      let child = fiber.child;
      while (child) {
        walk(child, nextPath);
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
        walk(child, []);
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

export function readRenderMonitor(
  request: RenderCountsReadRequest
): {
  counts: RenderCountRecord[];
  summary: RenderCountsSummary;
} {
  const globalKey = request.globalKey ?? "__RS_RENDER_MONITOR__";
  const limit = typeof request.limit === "number" && request.limit > 0 ? request.limit : 50;
  const stateValue = Reflect.get(window as typeof window & Record<string, unknown>, globalKey);
  const emptySummary: RenderCountsSummary = {
    totalComponents: 0,
    totalRenders: 0,
    observedCommits: 0,
  };

  if (!stateValue || typeof stateValue !== "object") {
    return {
      counts: [],
      summary: emptySummary,
    };
  }

  const state = stateValue as {
    commitCount?: unknown;
    components?: Record<string, RenderCountRecord>;
  };
  const counts = Object.values(state.components ?? {})
    .map((entry) => ({
      componentName: entry.componentName,
      pathText: entry.pathText,
      count: entry.count,
      firstSeen: entry.firstSeen,
      lastSeen: entry.lastSeen,
      samples: Array.isArray(entry.samples) ? entry.samples : [],
    }))
    .sort((left, right) => right.count - left.count || right.lastSeen.localeCompare(left.lastSeen))
    .slice(0, limit);

  return {
    counts,
    summary: {
      totalComponents: Object.keys(state.components ?? {}).length,
      totalRenders: counts.reduce((total, entry) => total + entry.count, 0),
      observedCommits: typeof state.commitCount === "number" ? state.commitCount : 0,
    },
  };
}
