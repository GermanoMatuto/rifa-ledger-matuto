import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["server/raffle/**/*.test.ts", "server/raffle/**/*.test.mjs"], environment: "node" },
});

