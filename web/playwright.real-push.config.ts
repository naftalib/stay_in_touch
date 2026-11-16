import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-real-push",
  fullyParallel: false,
  workers: 1,
  timeout: 360_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chrome",
      use: {
        channel: "chrome",
        headless: false,
      },
    },
  ],
  webServer: {
    command: "pnpm preview",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
