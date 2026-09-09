import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // `server-only` throws when imported outside a React Server Component;
      // under Vitest we swap it for a no-op so the same modules can be tested.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
