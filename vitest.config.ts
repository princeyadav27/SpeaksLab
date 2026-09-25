import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirror the app's "@/" path alias (tsconfig paths) so route tests can
// import route modules that use it.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
  },
});
