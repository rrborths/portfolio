import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "served-app.test.mjs",
  use: { baseURL: "http://127.0.0.1:4174", headless: true },
  webServer: {
    command: "python3 -m http.server 4174",
    port: 4174,
    reuseExistingServer: true,
  },
});
