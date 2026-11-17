import { defineConfig, mergeConfig } from "vitest/config";
import vite from "./vite.config.ts";

export default mergeConfig(
  vite,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["test/**/*.test.{ts,tsx}"],
      setupFiles: ["./test/setup.ts"],
    },
  }),
);
