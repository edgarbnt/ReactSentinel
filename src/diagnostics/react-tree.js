/**
 * Self-contained function evaluated in the browser context via Playwright.
 * Extracts a simplified representation of the React Fiber tree.
 */
export function extractReactTree(options) {
    // Find a fiber root
    const root = document.getElementById("root");
    const candidates = [
        root,
        root?.firstElementChild,
        document.querySelector("[data-reactroot]"),
        document.body?.firstElementChild,
        document.body,
    ].filter((el) => el !== null && el !== undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rootFiber = null;
    for (const el of candidates) {
        const key = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
        if (key) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            rootFiber = el[key];
            break;
        }
    }
    if (!rootFiber)
        return null;
    // Go to the top-most fiber to ensure we get the whole tree
    let topFiber = rootFiber;
    while (topFiber.return) {
        topFiber = topFiber.return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function serializeProps(props) {
        if (!props || typeof props !== "object")
            return {};
        const result = {};
        for (const key of Object.keys(props)) {
            if (key === "children")
                continue; // Skip children to keep output small
            const val = props[key];
            if (typeof val === "function") {
                result[key] = "[Function]";
            }
            else if (typeof val === "object" && val !== null) {
                try {
                    if (Array.isArray(val)) {
                        result[key] = `[Array(${val.length})]`;
                    }
                    else {
                        result[key] = "[Object]";
                    }
                }
                catch {
                    result[key] = "[Circular]";
                }
            }
            else {
                result[key] = val;
            }
        }
        return result;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function walk(fiber, currentDepth) {
        if (!fiber || currentDepth >= options.maxDepth)
            return [];
        const isHostText = fiber.tag === 6; // HostText
        if (isHostText)
            return [];
        const isHostComponent = typeof fiber.type === "string" || fiber.tag === 5;
        const shouldInclude = options.includeHostNodes || !isHostComponent;
        let node = null;
        if (shouldInclude) {
            let name = "Unknown";
            if (typeof fiber.type === "string") {
                name = fiber.type;
            }
            else if (typeof fiber.type === "function") {
                name = fiber.type.displayName || fiber.type.name || "Anonymous";
            }
            else if (fiber.type && typeof fiber.type === "object") {
                name = fiber.type.displayName || "Context/Memo/ForwardRef";
            }
            else if (fiber.tag === 3) {
                name = "HostRoot";
            }
            node = {
                name,
                props: serializeProps(fiber.memoizedProps),
                children: [],
            };
        }
        const childNodes = [];
        if (fiber.child) {
            let currentChild = fiber.child;
            while (currentChild) {
                childNodes.push(...walk(currentChild, currentDepth + 1));
                currentChild = currentChild.sibling;
            }
        }
        if (node) {
            node.children = childNodes;
            return [node];
        }
        else {
            return childNodes;
        }
    }
    const treeArray = walk(topFiber, 0);
    return treeArray.length > 0 ? treeArray[0] : null;
}
