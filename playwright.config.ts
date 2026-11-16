import { defineConfig, devices } from "@playwright/test";

// Fluxo principal da tela contra o servidor real com IA falsa (server/test/e2e/servidor-e2e.ts).
// Rode com `npm run test:e2e` (faz o build do web antes).
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3555",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx tsx server/test/e2e/servidor-e2e.ts",
    url: "http://127.0.0.1:3555/api/saude",
    env: { NODE_ENV: "test" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
