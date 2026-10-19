import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    maxWorkers: 4,
    env: { XDG_DATA_HOME: ".cache" },
    setupFiles: ["tests/setup.ts"],
    exclude: ["dist/**", "node_modules/**"],
    include: ["tests/**/*.test.ts"],
  },
});
