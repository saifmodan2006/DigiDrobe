import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const installedChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (process.platform === "win32" && existsSync(installedChrome)
    ? installedChrome
    : undefined);
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3117";

export default defineConfig({
  testDir: "./tests/browser",
  forbidOnly: Boolean(process.env.CI),
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    browserName: "chromium",
    actionTimeout: 15_000,
    launchOptions: { executablePath },
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    {
      name: "narrow",
      use: {
        viewport: { width: 320, height: 800 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3117",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
