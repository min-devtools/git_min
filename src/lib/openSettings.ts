import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const SETTINGS_LABEL = "settings-window";

export async function openSettingsWindow(productName: string) {
  const existing = await WebviewWindow.getByLabel(SETTINGS_LABEL);
  if (existing) {
    await existing.setFocus();
    return;
  }
  new WebviewWindow(SETTINGS_LABEL, {
    url: "index.html?view=settings",
    title: `Settings — ${productName}`,
    width: 760,
    height: 600,
    minWidth: 560,
    minHeight: 440,
    resizable: true,
    maximizable: false,
    fullscreen: false,
    titleBarStyle: "overlay" as const,
    hiddenTitle: true,
    transparent: true,
    windowEffects: {
      effects: ["windowBackground" as const],
      state: "followsWindowActiveState" as const,
    },
  } as Record<string, unknown>);
}