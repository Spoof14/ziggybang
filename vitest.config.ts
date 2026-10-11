import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Network tests only run on demand: `bun run test:live`.
    exclude: process.env.RUN_LIVE_TESTS ? ["node_modules/**"] : ["node_modules/**", "src/**/live.test.ts"],
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "src"),
    },
  },
});
