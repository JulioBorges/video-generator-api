import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["short-video-maker/**", "node_modules/**"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/**"],
    },
  },
});
