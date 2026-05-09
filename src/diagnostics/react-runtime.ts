import type { ComponentHookValue, ComponentStateNode } from "./protocol.js";

export interface ReactRuntimeInspectRequest {
  mode: "component-state";
  componentName?: string;
}

export interface ReactRuntimeInspectResult {
  state?: ComponentStateNode | null;
}

export function inspectReactRuntime(request: ReactRuntimeInspectRequest): ReactRuntimeInspectResult {
  const fiberRoot = findRootFiber();
  if (!fiberRoot) {
    return { state: null };
  }

  const componentName = request.componentName ?? "";
  const match = findComponent(fiberRoot, componentName, []);
  if (!match) {
    return { state: null };
  }

  return {
    state: {
      name: getComponentName(match.fiber),
      path: match.path,
      childrenCount: countDirectChildren(match.fiber),
      hooks: extractHooks(match.fiber),
    },
  };

  function findRootFiber(): unknown | null {
    const root = document.getElementById("root");
    const candidates = [
      root,
      root?.firstElementChild,
      document.querySelector("[data-reactroot]"),
      document.body?.firstElementChild,
      document.body,
    ].filter((element): element is Element => element !== null && element !== undefined);

    let rootFiber: unknown | null = null;
    for (const element of candidates) {
      const key = Object.keys(element).find((candidate) => candidate.startsWith("__reactFiber"));
      if (!key) continue;
      rootFiber = Reflect.get(element, key) ?? null;
      if (rootFiber) break;
    }

    if (!rootFiber) return null;

    let currentFiber = rootFiber as { return?: unknown };
    while (currentFiber && currentFiber.return) {
      currentFiber = currentFiber.return as { return?: unknown };
    }

    return currentFiber;
  }

  function findComponent(
    fiber: unknown,
    componentName: string,
    pathNames: string[]
  ): { fiber: FiberLike; path: string[] } | null {
    if (!isFiber(fiber)) return null;

    const name = getComponentName(fiber);
    const currentPath = [...pathNames, name];

    if (name === componentName) {
      return {
        fiber,
        path: currentPath,
      };
    }

    let child = fiber.child;
    while (child) {
      const match = findComponent(child, componentName, currentPath);
      if (match) return match;
      child = child.sibling;
    }

    return null;
  }

  function extractHooks(fiber: FiberLike): ComponentHookValue[] {
    const hooks: ComponentHookValue[] = [];
    const visited = new WeakSet<object>();
    let currentHook = fiber.memoizedState;
    let index = 0;

    while (currentHook && typeof currentHook === "object" && !visited.has(currentHook) && index < 25) {
      visited.add(currentHook);
      const detectedHook = classifyHook(currentHook as HookLike, index);
      if (detectedHook) hooks.push(detectedHook);
      currentHook = (currentHook as HookLike).next ?? null;
      index += 1;
    }

    return hooks;
  }

  function classifyHook(hook: HookLike, index: number): ComponentHookValue | null {
    const value = hook.memoizedState;
    if (hook.queue && typeof hook.queue === "object" && "pending" in hook.queue) {
      return {
        index,
        kind: "state",
        source: "memoizedState",
        value: serializeValue(value),
      };
    }

    if (value && typeof value === "object" && "current" in (value as Record<string, unknown>)) {
      return {
        index,
        kind: "ref",
        source: "memoizedState",
        value: serializeValue((value as Record<string, unknown>).current),
      };
    }

    if (Array.isArray(value) && value.length === 2 && Array.isArray(value[1])) {
      return {
        index,
        kind: "memo",
        source: "memoizedState",
        value: serializeValue(value[0]),
      };
    }

    if (isSerializablePrimitive(value)) {
      return {
        index,
        kind: "unknown",
        source: "memoizedState",
        value: serializeValue(value),
      };
    }

    return null;
  }

  function serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "function") {
      const fn = value as { name?: string };
      return `[Function:${fn.name || "anonymous"}]`;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => serializeValue(entry));
    }
    if (typeof value === "object") {
      if (isReactElementLike(value)) {
        return `[ReactElement:${getReactElementName(value)}]`;
      }

      const record = value as Record<string, unknown>;
      const serialized: Record<string, unknown> = {};
      for (const key of Object.keys(record)) {
        if (key === "children") continue;
        serialized[key] = serializeValue(record[key]);
      }
      return serialized;
    }
    return String(value);
  }

  function getReactElementName(value: unknown): string {
    if (!value || typeof value !== "object") return "Unknown";
    const type = (value as { type?: unknown }).type;
    if (typeof type === "string") return type;
    if (typeof type === "function") {
      const fn = type as { displayName?: string; name?: string };
      return fn.displayName || fn.name || "Anonymous";
    }
    return "Unknown";
  }

  function isReactElementLike(value: unknown): boolean {
    return Boolean(value && typeof value === "object" && "$$typeof" in (value as Record<string, unknown>));
  }

  function countDirectChildren(fiber: FiberLike): number {
    let count = 0;
    let child = fiber.child;
    while (child) {
      count += 1;
      child = child.sibling;
    }
    return count;
  }

  function getComponentName(fiber: FiberLike): string {
    if (typeof fiber.type === "string") return fiber.type;
    if (typeof fiber.type === "function") {
      const component = fiber.type as { displayName?: string; name?: string };
      return component.displayName || component.name || "Anonymous";
    }
    if (fiber.tag === 3) return "HostRoot";
    if (fiber.type && typeof fiber.type === "object") {
      const typeRecord = fiber.type as Record<string, unknown>;
      if (typeof typeRecord.displayName === "string" && typeRecord.displayName.length > 0) {
        return typeRecord.displayName;
      }
      return "Context/Memo/ForwardRef";
    }
    return "Unknown";
  }

  function isSerializablePrimitive(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  }

  function isFiber(value: unknown): value is FiberLike {
    return Boolean(value && typeof value === "object" && "child" in (value as Record<string, unknown>));
  }
}

type FiberLike = {
  tag?: number;
  type?: unknown;
  return?: FiberLike | null;
  child?: FiberLike | null;
  sibling?: FiberLike | null;
  memoizedState?: unknown;
};

type HookLike = {
  memoizedState?: unknown;
  queue?: unknown;
  next?: HookLike | null;
};
