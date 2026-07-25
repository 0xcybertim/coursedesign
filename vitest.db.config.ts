import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/support/server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/database/**/*.test.ts"],
    fileParallelism: false,
    restoreMocks: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
