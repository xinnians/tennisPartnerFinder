import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

const EMPTY_MOCK_DATA_MODULE = new URL("./src/mockData.empty.js", import.meta.url).pathname;
const MOCK_DATA_IMPORT = /^(?:.*\/)?mockData\.js$/;
const BUNDLE_ANALYSIS_ENABLED = process.env.BUNDLE_ANALYZE === "1";
const BUNDLE_ANALYSIS_PATH = "/tmp/tennis-partner-finder-bundle-composition-2026-08-25.json";

export default defineConfig(({ command, mode }) => ({
  define: {
    __TENNIS_E2E_TEST_HOOKS__: JSON.stringify(command !== "build" || mode !== "production"),
    __TENNIS_DEPLOY_ENVIRONMENT__: JSON.stringify(process.env.VERCEL_ENV === "production" ? "production" : "preview"),
  },
  plugins: [
    react(),
    ...(BUNDLE_ANALYSIS_ENABLED
      ? [
          visualizer({
            emitFile: false,
            filename: BUNDLE_ANALYSIS_PATH,
            gzipSize: true,
            template: "raw-data",
          }),
        ]
      : []),
  ],
  resolve:
    command === "build" && mode === "production"
      ? { alias: [{ find: MOCK_DATA_IMPORT, replacement: EMPTY_MOCK_DATA_MODULE }] }
      : undefined,
}));
