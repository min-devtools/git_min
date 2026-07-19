export type BrowserId = "system" | "chrome" | "edge" | "firefox" | "brave" | "safari";
export type DesktopPlatform = "macos" | "windows" | "linux";

export interface BrowserOption {
  id: BrowserId;
  label: string;
}

const ALL_BROWSER_IDS = new Set<BrowserId>(["system", "chrome", "edge", "firefox", "brave", "safari"]);

export function isBrowserId(value: string | null): value is BrowserId {
  return value !== null && ALL_BROWSER_IDS.has(value as BrowserId);
}

export function detectDesktopPlatform(): DesktopPlatform {
  const value = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (value.includes("mac")) return "macos";
  if (value.includes("win")) return "windows";
  return "linux";
}

export function browserOptions(platform: DesktopPlatform): BrowserOption[] {
  const options: BrowserOption[] = [
    { id: "system", label: "System default" },
    { id: "chrome", label: "Google Chrome" },
    { id: "edge", label: "Microsoft Edge" },
    { id: "firefox", label: "Firefox" },
    { id: "brave", label: "Brave" },
  ];
  if (platform === "macos") options.push({ id: "safari", label: "Safari" });
  return options;
}

export function browserOpenWith(browser: BrowserId, platform: DesktopPlatform): string | undefined {
  if (browser === "system") return undefined;
  const commands: Record<DesktopPlatform, Partial<Record<BrowserId, string>>> = {
    macos: {
      chrome: "Google Chrome",
      edge: "Microsoft Edge",
      firefox: "Firefox",
      brave: "Brave Browser",
      safari: "Safari",
    },
    windows: {
      chrome: "chrome",
      edge: "msedge",
      firefox: "firefox",
      brave: "brave",
    },
    linux: {
      chrome: "google-chrome",
      edge: "microsoft-edge",
      firefox: "firefox",
      brave: "brave-browser",
    },
  };
  return commands[platform][browser];
}
