import { defineConfig, devices } from "@playwright/test";

// The app under test. In docker-compose.test.yml this is http://app:8000.
const BASE_URL = process.env.BASE_URL ?? "http://localhost:8000";

export default defineConfig({
  testDir: ".",
  // Tests share one SQLite database, so run them strictly one at a time.
  // File names are numbered so the fresh-start spec runs first.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Browser tests. Listed first so 01-fresh-start sees an untouched database (trades in any
    // other test leave cash slightly off $10,000, since buy and sell fill at different prices).
    {
      name: "e2e",
      testDir: "./e2e",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } },
    },
    // REST contract tests (no browser).
    { name: "api", testDir: "./api" },
  ],
});
