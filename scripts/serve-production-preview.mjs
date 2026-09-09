import { preview } from "vite";
import { loadLocalSupabaseConfig } from "../tests/fixtures/localSupabaseConfig.js";

const { apiUrl, publicKey } = loadLocalSupabaseConfig();
Object.assign(process.env, { VERCEL_ENV: "preview", VITE_SUPABASE_URL: apiUrl, VITE_SUPABASE_ANON_KEY: publicKey });
await preview({ preview: { host: "127.0.0.1", port: 4174, strictPort: true } });
