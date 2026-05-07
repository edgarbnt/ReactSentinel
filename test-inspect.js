import { browserManager } from "./dist/browser/index.js";

async function run() {
  console.log("Testing inspectComponent...");
  
  const result = await browserManager.inspectComponent("http://localhost:5175", "TodoItem");
  console.log("Result:", JSON.stringify(result, null, 2));

  await browserManager.close();
}

run().catch(console.error);
