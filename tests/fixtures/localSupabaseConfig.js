import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_SUPABASE_API_URL = "http://127.0.0.1:54321";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function unquote(value) {
  if (value.length >= 2 && value[0] === '"' && value.at(-1) === '"') return value.slice(1, -1);
  if (value.length >= 2 && value[0] === "'" && value.at(-1) === "'") return value.slice(1, -1);
  return value;
}

export function parseLocalSupabaseEnvironment(output) {
  const environment = new Map();
  for (const line of String(output ?? "").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    environment.set(match[1], unquote(match[2]));
  }
  return environment;
}

export function validateLocalSupabaseConfig(environment) {
  const apiUrl = environment.get("API_URL");
  const publicKey = environment.get("ANON_KEY");
  if (apiUrl !== LOCAL_SUPABASE_API_URL) {
    throw new Error(`Local Supabase API URL must be ${LOCAL_SUPABASE_API_URL}.`);
  }
  if (!publicKey?.trim()) throw new Error("Local Supabase public key is required.");
  return { apiUrl, publicKey };
}

function runLocalSupabaseStatus() {
  return spawnSync("npx", ["supabase", "status", "-o", "env"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

export function loadLocalSupabaseConfig({ runStatus = runLocalSupabaseStatus } = {}) {
  const status = runStatus();
  if (status?.error || status?.status !== 0) {
    throw new Error("Unable to read local Supabase status.");
  }
  return validateLocalSupabaseConfig(parseLocalSupabaseEnvironment(status.stdout));
}
