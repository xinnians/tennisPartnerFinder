import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const EMPTY_MOCK_DATA_MODULE = new URL("./src/mockData.empty.js", import.meta.url).pathname;
const MOCK_DATA_IMPORT = /^(?:.*\/)?mockData\.js$/;

export default defineConfig(({ command, mode }) => ({
  plugins: [react()],
  resolve:
    command === "build" && mode === "production"
      ? { alias: [{ find: MOCK_DATA_IMPORT, replacement: EMPTY_MOCK_DATA_MODULE }] }
      : undefined,
}));
