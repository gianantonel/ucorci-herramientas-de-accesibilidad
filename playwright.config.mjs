import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  use: { baseURL: process.env.TEST_BASE_URL || "http://localhost:3000", headless: true, actionTimeout: 15000 },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60000,
    env: {
      DATABASE_URL: "file:./data/e2e-" + Date.now() + ".db",
      INSFORGE_URL: "",
      INSFORGE_API_KEY: "",
    },
  },
  reporter: "list",
});
