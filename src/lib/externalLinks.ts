import { openUrl } from "@tauri-apps/plugin-opener";
import { useApp } from "../store";
import { browserOpenWith, detectDesktopPlatform } from "./browserPreference";

export async function openExternalUrl(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsupported external URL protocol: ${url.protocol}`);
  }
  const browser = useApp.getState().externalBrowser;
  const openWith = browserOpenWith(browser, detectDesktopPlatform());
  if (browser !== "system" && !openWith) {
    throw new Error("The selected browser is not available on this operating system.");
  }
  await openUrl(url.toString(), openWith);
}
