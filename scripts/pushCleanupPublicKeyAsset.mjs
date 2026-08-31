import {
  canonicalCleanupPublicKeyDocumentJson,
  parseCanonicalCleanupPublicJwkJson,
} from "../supabase/functions/_shared/push-cleanup-protocol.js";

export const PUSH_CLEANUP_PUBLIC_KEY_ASSET = "push-cleanup-key-v1.json";
export const PUSH_CLEANUP_PUBLIC_KEY_PATH = `/${PUSH_CLEANUP_PUBLIC_KEY_ASSET}`;
export const PUSH_CLEANUP_PUBLIC_JWK_ENV = "PUSH_CLEANUP_PUBLIC_JWK_JSON";

export async function createPushCleanupPublicKeyAssetSource(serializedPublicJwk) {
  if (serializedPublicJwk === "") return null;
  const publicJwk = await parseCanonicalCleanupPublicJwkJson(serializedPublicJwk);
  return canonicalCleanupPublicKeyDocumentJson(publicJwk);
}

export function createPushCleanupPublicKeyAssetPlugin(serializedPublicJwk) {
  let sourceRequest;
  const loadSource = () => {
    sourceRequest ??= createPushCleanupPublicKeyAssetSource(serializedPublicJwk);
    return sourceRequest;
  };

  return {
    name: "tennis-push-cleanup-public-key",
    async configureServer(server) {
      const source = await loadSource();
      if (source === null) return;

      server.middlewares.use((request, response, next) => {
        if (request.url !== PUSH_CLEANUP_PUBLIC_KEY_PATH || !["GET", "HEAD"].includes(request.method ?? "GET")) {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Length", String(Buffer.byteLength(source)));
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(request.method === "HEAD" ? undefined : source);
      });
    },
    async generateBundle() {
      const source = await loadSource();
      if (source === null) return;
      this.emitFile({ fileName: PUSH_CLEANUP_PUBLIC_KEY_ASSET, source, type: "asset" });
    },
  };
}
