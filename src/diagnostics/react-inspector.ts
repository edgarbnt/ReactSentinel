import type { ComponentInspectionNode } from "./protocol.js";

/**
 * Self-contained function evaluated in the browser context via Playwright.
 * Finds a specific React component by name and extracts its full details.
 */
export function inspectReactComponent(componentName: string): ComponentInspectionNode | null {
  // Find a fiber root
  const root = document.getElementById("root");
  const candidates = [
    root,
    root?.firstElementChild,
    document.querySelector("[data-reactroot]"),
    document.body?.firstElementChild,
    document.body,
  ].filter((el): el is Element => el !== null && el !== undefined);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rootFiber: any = null;
  for (const el of candidates) {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
    if (key) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rootFiber = (el as any)[key];
      break;
    }
  }

  if (!rootFiber) return null;

  // Go to the top-most fiber to ensure we get the whole tree
  let topFiber = rootFiber;
  while (topFiber.return) {
    topFiber = topFiber.return;
  }

  // A more detailed prop serializer for single-component inspection
  // We want to stringify nested objects safely
  function serializeDeepProps(props: any, maxDepth = 3, currentDepth = 0): any {
    if (currentDepth >= maxDepth) return "[MaxDepthReached]";
    if (!props || typeof props !== "object") return props;
    if (Array.isArray(props)) {
      return props.map(p => serializeDeepProps(p, maxDepth, currentDepth + 1));
    }
    
    // React elements
    if (props.$$typeof) return `[ReactElement: ${typeof props.type === 'string' ? props.type : (props.type?.name || 'Unknown')}]`;
    
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(props)) {
      if (key === "children") {
        result[key] = "[Children omitted]";
        continue;
      }
      const val = props[key];
      if (typeof val === "function") {
        result[key] = `[Function: ${val.name || 'anonymous'}]`;
      } else if (typeof val === "object" && val !== null) {
        try {
          result[key] = serializeDeepProps(val, maxDepth, currentDepth + 1);
        } catch {
          result[key] = "[Circular]";
        }
      } else {
        result[key] = val;
      }
    }
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getComponentName(fiber: any): string {
    if (typeof fiber.type === "string") return fiber.type;
    if (typeof fiber.type === "function") return fiber.type.displayName || fiber.type.name || "Anonymous";
    if (fiber.type && typeof fiber.type === "object") return fiber.type.displayName || "Context/Memo/ForwardRef";
    if (fiber.tag === 3) return "HostRoot";
    return "Unknown";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function countDirectChildren(fiber: any): number {
    let count = 0;
    let child = fiber.child;
    while (child) {
      count++;
      child = child.sibling;
    }
    return count;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function search(fiber: any, path: string[]): ComponentInspectionNode | null {
    if (!fiber) return null;

    const name = getComponentName(fiber);
    const currentPath = [...path, name];

    if (name === componentName) {
      return {
        name,
        props: serializeDeepProps(fiber.memoizedProps) || {},
        path: currentPath,
        childrenCount: countDirectChildren(fiber)
      };
    }

    if (fiber.child) {
      let currentChild = fiber.child;
      while (currentChild) {
        const found = search(currentChild, currentPath);
        if (found) return found;
        currentChild = currentChild.sibling;
      }
    }
    return null;
  }

  return search(topFiber, []);
}
