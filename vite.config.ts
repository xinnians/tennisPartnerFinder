import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const EMPTY_MOCK_DATA_MODULE = new URL("./src/mockData.empty.js", import.meta.url).pathname;
const MOCK_DATA_IMPORT = /^(?:.*\/)?mockData\.js$/;

export default defineConfig(({ command, mode }) => ({
  define: {
    __TENNIS_E2E_TEST_HOOKS__: JSON.stringify(command !== "build" || mode !== "production"),
    __TENNIS_DEPLOY_ENVIRONMENT__: JSON.stringify(process.env.VERCEL_ENV === "production" ? "production" : "preview"),
  },
  plugins: [react()],
  resolve:
    command === "build" && mode === "production"
      ? { alias: [{ find: MOCK_DATA_IMPORT, replacement: EMPTY_MOCK_DATA_MODULE }] }
      : undefined,
}));
