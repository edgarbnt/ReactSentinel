import type {
  ComponentContextValue,
  ComponentHookValue,
  ComponentInspectionNode,
  ComponentInspectionSummary,
  ComponentStateNode,
  ReactTreeNode,
} from "./protocol.js";

export interface ReactRuntimeInspectRequest {
  mode: "tree" | "component" | "component-state";
  componentName?: string;
  maxDepth?: number;
  includeHostNodes?: boolean;
  compact?: boolean;
}

export interface ReactRuntimeInspectResult {
  tree?: ReactTreeNode | null;
  component?: ComponentInspectionNode | null;
  state?: ComponentStateNode | null;
}

type SerializationLimits = {
  maxDepth: number;
  maxBreadth: number;
  maxStringLength: number;
  maxArrayLength: number;
  maxObjectKeys: number;
  maxTotalNodes: number;
};

type SerializationBudget = {
  remainingNodes: number;
};

export function inspectReactRuntime(request: ReactRuntimeInspectRequest): ReactRuntimeInspectResult {
  const limits: SerializationLimits = request.compact
    ? {
        maxDepth: 2,
        maxBreadth: 4,
        maxStringLength: 80,
        maxArrayLength: 4,
        maxObjectKeys: 6,
        maxTotalNodes: 80,
      }
    : {
        maxDepth: 4,
        maxBreadth: 8,
        maxStringLength: 160,
        maxArrayLength: 10,
        maxObjectKeys: 12,
        maxTotalNodes: 200,
      };

  const fiberRoot = findRootFiber();
  if (!fiberRoot) {
    return request.mode === "tree" ? { tree: null } : request.mode === "component" ? { component: null } : { state: null };
  }

  if (request.mode === "tree") {
    return {
      tree: extractTree(
        fiberRoot,
        typeof request.maxDepth === "number" ? request.maxDepth : 10,
        request.includeHostNodes === true
      ),
    };
  }

  const componentName = request.componentName ?? "";
  const match = findComponent(fiberRoot, componentName, [], []);
  if (!match) {
    return request.mode === "component" ? { component: null } : { state: null };
  }

  if (request.mode === "component") {
    return { component: buildInspectionNode(match) };
  }

  return { state: buildStateNode(match) };

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

    if (
      currentFiber &&
      typeof currentFiber === "object" &&
      "stateNode" in currentFiber &&
      currentFiber.stateNode &&
      typeof currentFiber.stateNode === "object" &&
      "current" in currentFiber.stateNode &&
      isFiber((currentFiber.stateNode as { current?: unknown }).current)
    ) {
      return (currentFiber.stateNode as { current: FiberLike }).current;
    }

    return currentFiber;
  }

  function extractTree(
    fiber: unknown,
    maxDepth: number,
    includeHostNodes: boolean,
    currentDepth: number = 0
  ): ReactTreeNode | null {
    const nodes = walkTree(fiber, maxDepth, includeHostNodes, currentDepth);
    return nodes[0] ?? null;
  }

  function walkTree(
    fiber: unknown,
    maxDepth: number,
    includeHostNodes: boolean,
    currentDepth: number
  ): ReactTreeNode[] {
    if (!isFiber(fiber) || currentDepth >= maxDepth || fiber.tag === 6) {
      return [];
    }

    const isHostComponent = typeof fiber.type === "string" || fiber.tag === 5;
    const shouldInclude = includeHostNodes || !isHostComponent;

    const childNodes: ReactTreeNode[] = [];
    let child = fiber.child;
    while (child) {
      childNodes.push(...walkTree(child, maxDepth, includeHostNodes, currentDepth + 1));
      child = child.sibling;
    }

    if (!shouldInclude) {
      return childNodes;
    }

    return [
      {
        name: getComponentName(fiber),
        props: serializeProps(fiber.memoizedProps),
        children: childNodes,
      },
    ];
  }

  function findComponent(
    fiber: unknown,
    componentName: string,
    pathNames: string[],
    pathFibers: FiberLike[]
  ): { fiber: FiberLike; path: string[]; pathFibers: FiberLike[] } | null {
    if (!isFiber(fiber)) return null;

    const name = getComponentName(fiber);
    pathNames.push(name);
    pathFibers.push(fiber);

    if (name === componentName) {
      return {
        fiber,
        path: pathNames.slice(),
        pathFibers: pathFibers.slice(),
      };
    }

    let child = fiber.child;
    while (child) {
      const match = findComponent(child, componentName, pathNames, pathFibers);
      if (match) {
        pathNames.pop();
        pathFibers.pop();
        return match;
      }
      child = child.sibling;
    }

    pathNames.pop();
    pathFibers.pop();
    return null;
  }

  function buildInspectionNode(match: {
    fiber: FiberLike;
    path: string[];
    pathFibers: FiberLike[];
  }): ComponentInspectionNode {
    const props = serializeProps(match.fiber.memoizedProps);
    const contexts = extractContexts(match.fiber, match.pathFibers);
    const childCount = countDirectChildren(match.fiber);
    return {
      name: getComponentName(match.fiber),
      props,
      path: match.path,
      pathText: match.path.join(" > "),
      childrenCount: childCount,
      contexts,
      summary: buildSummary(match.path, props, extractHooks(match.fiber), contexts, childCount),
    };
  }

  function buildStateNode(match: {
    fiber: FiberLike;
    path: string[];
    pathFibers: FiberLike[];
  }): ComponentStateNode {
    const hooks = extractHooks(match.fiber);
    const props = serializeProps(match.fiber.memoizedProps);
    const contexts = extractContexts(match.fiber, match.pathFibers);
    const childCount = countDirectChildren(match.fiber);
    return {
      name: getComponentName(match.fiber),
      path: match.path,
      pathText: match.path.join(" > "),
      childrenCount: childCount,
      hooks,
      summary: buildSummary(match.path, props, hooks, contexts, childCount),
    };
  }

  function buildSummary(
    path: string[],
    props: Record<string, unknown>,
    hooks: ComponentHookValue[],
    contexts: ComponentContextValue[],
    childrenCount: number
  ): ComponentInspectionSummary {
    return {
      pathText: path.join(" > "),
      propKeys: Object.keys(props),
      hookCount: hooks.length,
      contextCount: contexts.length,
      childrenCount,
    };
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

  function extractContexts(fiber: FiberLike, pathFibers: FiberLike[]): ComponentContextValue[] {
    const fromDependencies: ComponentContextValue[] = [];
    const firstContext = fiber.dependencies?.firstContext;
    const dependencySeen = new Set<string>();
    let current = firstContext;

    while (current && typeof current === "object") {
      const name = getContextName((current as DependencyLike).context);
      if (!dependencySeen.has(name)) {
        dependencySeen.add(name);
        fromDependencies.push({
          name,
          source: "dependency",
          value: serializeValue((current as DependencyLike).memoizedValue),
        });
      }
      current = (current as DependencyLike).next ?? null;
    }

    if (fromDependencies.length > 0) {
      return fromDependencies;
    }

    const providers: ComponentContextValue[] = [];
    for (const pathFiber of pathFibers) {
      if (!isContextProviderFiber(pathFiber)) continue;
      providers.push({
        name: getContextName(getFiberContextObject(pathFiber)),
        source: "provider",
        value: serializeValue(pathFiber.memoizedProps?.value),
      });
    }

    return providers;
  }

  function isContextProviderFiber(fiber: FiberLike): boolean {
    return fiber.tag === 10 && typeof fiber.memoizedProps === "object" && fiber.memoizedProps !== null && "value" in fiber.memoizedProps;
  }

  function getFiberContextObject(fiber: FiberLike): unknown {
    if (!fiber.type || typeof fiber.type !== "object") return null;
    const typeRecord = fiber.type as Record<string, unknown>;
    return typeRecord._context ?? typeRecord.context ?? null;
  }

  function getContextName(context: unknown): string {
    if (!context || typeof context !== "object") return "AnonymousContext";
    const contextRecord = context as Record<string, unknown>;
    const displayName = contextRecord.displayName;
    if (typeof displayName === "string" && displayName.trim().length > 0) return displayName;
    return "AnonymousContext";
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

  function serializeProps(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object") return {};
    const props = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    const keys = Object.keys(props).filter((key) => key !== "children").slice(0, limits.maxObjectKeys);

    for (const key of keys) {
      result[key] = serializeValue(props[key]);
    }

    if (Object.keys(props).filter((key) => key !== "children").length > keys.length) {
      result.__truncatedKeys = Object.keys(props).filter((key) => key !== "children").length - keys.length;
    }

    return result;
  }

  function serializeValue(value: unknown): unknown {
    return serializeInner(value, 0, new WeakSet<object>(), { remainingNodes: limits.maxTotalNodes });
  }

  function serializeInner(
    value: unknown,
    depth: number,
    seen: WeakSet<object>,
    budget: SerializationBudget
  ): unknown {
    if (budget.remainingNodes <= 0) return "[MaxNodesReached]";
    if (value === null || value === undefined) return value;

    if (typeof value === "string") {
      return value.length > limits.maxStringLength ? `${value.slice(0, limits.maxStringLength)}...` : value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }

    if (typeof value === "bigint") {
      return `[BigInt:${String(value)}]`;
    }

    if (typeof value === "symbol") {
      return `[Symbol:${String(value.description ?? "")}]`;
    }

    if (typeof value === "function") {
      const fn = value as { name?: string };
      return `[Function:${fn.name || "anonymous"}]`;
    }

    if (typeof Element !== "undefined" && value instanceof Element) {
      return `[HTMLElement:${value.tagName.toLowerCase()}]`;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? "[Date]" : value.toISOString();
    }

    if (value instanceof URL) {
      return value.toString();
    }

    if (typeof value !== "object") {
      return String(value);
    }

    if (seen.has(value)) return "[Circular]";
    if (depth >= limits.maxDepth) return "[MaxDepthReached]";

    seen.add(value);
    budget.remainingNodes -= 1;

    if (Array.isArray(value)) {
      const items = value
        .slice(0, limits.maxArrayLength)
        .map((entry) => serializeInner(entry, depth + 1, seen, budget));
      if (value.length > limits.maxArrayLength) {
        items.push(`[+${value.length - limits.maxArrayLength} more items]`);
      }
      return items;
    }

    if (isReactElementLike(value)) {
      return `[ReactElement:${getReactElementName(value)}]`;
    }

    if (value instanceof Map) {
      const entries = Array.from(value.entries())
        .slice(0, limits.maxBreadth)
        .map(([key, entryValue]) => ({
          key: serializeInner(key, depth + 1, seen, budget),
          value: serializeInner(entryValue, depth + 1, seen, budget),
        }));

      return {
        type: "Map",
        size: value.size,
        entries,
        truncated: value.size > entries.length,
      };
    }

    if (value instanceof Set) {
      const values = Array.from(value.values())
        .slice(0, limits.maxBreadth)
        .map((entry) => serializeInner(entry, depth + 1, seen, budget));

      return {
        type: "Set",
        size: value.size,
        values,
        truncated: value.size > values.length,
      };
    }

    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).slice(0, limits.maxObjectKeys);
    const serializedRecord: Record<string, unknown> = {};

    for (const key of keys) {
      serializedRecord[key] = serializeInner(record[key], depth + 1, seen, budget);
    }

    if (Object.keys(record).length > keys.length) {
      serializedRecord.__truncatedKeys = Object.keys(record).length - keys.length;
    }

    return serializedRecord;
  }

  function getReactElementName(value: unknown): string {
    if (!value || typeof value !== "object") return "Unknown";
    const type = (value as { type?: unknown }).type;
    if (typeof type === "string") return type;
    if (typeof type === "function") {
      const fn = type as { displayName?: string; name?: string };
      return fn.displayName || fn.name || "Anonymous";
    }
    if (type && typeof type === "object") {
      const typeRecord = type as Record<string, unknown>;
      if (typeof typeRecord.displayName === "string") return typeRecord.displayName;
    }
    return "Unknown";
  }

  function isReactElementLike(value: unknown): boolean {
    return Boolean(value && typeof value === "object" && "$$typeof" in (value as Record<string, unknown>));
  }

  function getComponentName(fiber: FiberLike): string {
    if (typeof fiber.type === "string") return fiber.type;
    if (typeof fiber.type === "function") {
      const component = fiber.type as { displayName?: string; name?: string };
      return component.displayName || component.name || "Anonymous";
    }
    if (fiber.tag === 10) {
      return `${getContextName(getFiberContextObject(fiber))}.Provider`;
    }
    if (fiber.type && typeof fiber.type === "object") {
      const typeRecord = fiber.type as Record<string, unknown>;
      if (typeof typeRecord.displayName === "string" && typeRecord.displayName.length > 0) {
        return typeRecord.displayName;
      }
      return "Context/Memo/ForwardRef";
    }
    if (fiber.tag === 3) return "HostRoot";
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
  alternate?: FiberLike | null;
  stateNode?: unknown;
  memoizedProps?: Record<string, unknown> | null;
  memoizedState?: unknown;
  dependencies?: {
    firstContext?: DependencyLike | null;
  } | null;
};

type HookLike = {
  memoizedState?: unknown;
  queue?: unknown;
  next?: HookLike | null;
};

type DependencyLike = {
  context?: unknown;
  memoizedValue?: unknown;
  next?: DependencyLike | null;
};
