import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

/**
 * Uses the Chrome already installed on the machine. Set E2E_CHANNEL="" (and run
 * `npm run e2e:install`) to use Playwright's own bundled browser instead.
 */
const CHANNEL = process.env.E2E_CHANNEL ?? "chrome";

/**
 * E2E runs against a real stack: PostgreSQL (`npm run db:start`) and the Python
 * diagnosis engine must already be listening. Only the Next.js server is
 * started here, because the other two are long-lived processes shared with
 * ordinary development.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // the development database accepts a single connection
  retries: 0,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    // Trace capture is opt-in: writing traces to test-results/ is unreliable on
    // Windows and produced spurious failures on context close.
    trace: process.env.E2E_TRACE ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], browserName: "chromium", channel: CHANNEL },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium", channel: CHANNEL },
    },
  ],
  webServer: {
    command: "npm run start",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
