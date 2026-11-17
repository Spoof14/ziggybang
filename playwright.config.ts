import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://ziggybang.vercel.app",
    trace: "off",
    ...devices["Pixel 5"],
  },
});