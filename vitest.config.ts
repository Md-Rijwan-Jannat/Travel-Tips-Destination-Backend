import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/tests/setupEnv.ts"],
    testTimeout: 30000,
    // mongodb-memory-server may download a mongod binary on first run
    hookTimeout: 120000,
  },
});
