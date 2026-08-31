import {
  canonicalCleanupPublicKeyDocumentJson,
  CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES,
  CLEANUP_PUBLIC_KEY_PATH,
  parseCanonicalCleanupPublicJwkJson,
} from "../supabase/functions/_shared/push-cleanup-protocol.js";

export const PUSH_CLEANUP_PUBLIC_KEY_PATH = CLEANUP_PUBLIC_KEY_PATH;
export const PUSH_CLEANUP_PUBLIC_KEY_ASSET = PUSH_CLEANUP_PUBLIC_KEY_PATH.slice(1);
export const PUSH_CLEANUP_PUBLIC_JWK_ENV = "PUSH_CLEANUP_PUBLIC_JWK_JSON";

export async function createPushCleanupPublicKeyAssetSource(serializedPublicJwk) {
  if (serializedPublicJwk === "") return null;
  const publicJwk = await parseCanonicalCleanupPublicJwkJson(serializedPublicJwk);
  const source = await canonicalCleanupPublicKeyDocumentJson(publicJwk);
  if (new TextEncoder().encode(source).byteLength !== CLEANUP_PUBLIC_KEY_DOCUMENT_BYTES) {
    throw new Error("PUSH_CLEANUP_PUBLIC_KEY_DOCUMENT_INVALID");
  }
  return source;
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
