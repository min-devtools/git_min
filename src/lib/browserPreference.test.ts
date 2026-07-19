import { browserOpenWith, browserOptions } from "./browserPreference";

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

equal(browserOpenWith("system", "macos"), undefined);
equal(browserOpenWith("chrome", "macos"), "Google Chrome");
equal(browserOpenWith("edge", "windows"), "msedge");
equal(browserOpenWith("firefox", "linux"), "firefox");
equal(browserOpenWith("brave", "linux"), "brave-browser");
equal(browserOptions("macos").some((item) => item.id === "safari"), true);
equal(browserOptions("windows").some((item) => item.id === "safari"), false);

console.log("browser preference: all assertions passed");
