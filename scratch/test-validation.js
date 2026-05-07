import { browserManager } from "../dist/browser/index.js";

async function test() {
  const url = "http://localhost:5176/";
  console.log(`Testing validation on ${url}...`);

  try {
    // 1. Test text_present success
    console.log("\n--- Test 1: text_present success ---");
    const result1 = await browserManager.validate(url, { 
      type: "text_present", 
      expected: "Interactive fixture" 
    });
    console.log("Result 1:", JSON.stringify(result1, null, 2));

    // 2. Test text_present failure
    console.log("\n--- Test 2: text_present failure ---");
    const result2 = await browserManager.validate(url, { 
      type: "text_present", 
      expected: "NON EXISTENT TEXT" 
    });
    console.log("Result 2:", JSON.stringify(result2, null, 2));

    // 3. Test no_console_errors success
    console.log("\n--- Test 3: no_console_errors success ---");
    browserManager.clearConsoleEvents();
    const result3 = await browserManager.validate(url, { 
      type: "no_console_errors" 
    });
    console.log("Result 3:", JSON.stringify(result3, null, 2));

    // 4. Test no_console_errors failure (after crash)
    console.log("\n--- Test 4: no_console_errors failure ---");
    console.log("Clicking crash button...");
    await browserManager.simulateInteraction(url, "click", "#crash-button");
    const result4 = await browserManager.validate(url, { 
      type: "no_console_errors" 
    });
    console.log("Result 4 (should have errors):", JSON.stringify(result4, null, 2));

  } catch (e) {
    console.error("Test failed:", e);
  } finally {
    await browserManager.close();
  }
}

test();
