import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOCAL_API_URL = "http://127.0.0.1:54321";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(`Local reset refused: ${message}`);
  return 1;
}

function parseEnvironment(output) {
  const environment = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
    environment.set(key, value);
  }
  return environment;
}

function runNpx(args, options = {}) {
  return spawnSync("npx", args, {
    ...options,
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

function main() {
  if (process.env.CONFIRM_LOCAL_DB_RESET !== "1") {
    return fail("set CONFIRM_LOCAL_DB_RESET=1 to continue.");
  }

  const status = runNpx(["supabase", "status", "-o", "env"]);
  if (status.error) return fail(`could not run Supabase status: ${status.error.message}`);
  if (status.status !== 0) return fail(status.stderr.trim() || "Supabase status failed.");

  const apiUrl = parseEnvironment(status.stdout).get("API_URL");
  if (apiUrl !== LOCAL_API_URL) {
    return fail(`API_URL must be ${LOCAL_API_URL}; received ${apiUrl ?? "none"}.`);
  }

  const reset = runNpx(["supabase", "db", "reset"], { stdio: "inherit" });
  if (reset.error) return fail(`could not run Supabase reset: ${reset.error.message}`);
  return reset.status ?? 1;
}

process.exitCode = main();
