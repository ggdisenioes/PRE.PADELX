import { defineConfig } from "@playwright/test";

const localBaseURL = "http://127.0.0.1:3000";
const requestedBaseURL = process.env.E2E_BASE_URL || localBaseURL;
const useExternalBaseUrl =
  process.env.PLAYWRIGHT_USE_EXTERNAL_BASE_URL === "true";
const baseURL = useExternalBaseUrl ? requestedBaseURL : localBaseURL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: useExternalBaseUrl
    ? undefined
    : {
        command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
        url: localBaseURL,
        timeout: 180_000,
        reuseExistingServer: !process.env.CI,
      },
});
