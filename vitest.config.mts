import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      // Test-only key (32 zero bytes); real keys come from .env.local / the deploy environment.
      APP_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
    },
    testTimeout: 30_000,
  },
});
