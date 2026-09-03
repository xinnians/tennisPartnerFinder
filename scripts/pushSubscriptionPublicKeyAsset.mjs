import {
  canonicalPushSubscriptionPublicKeyDocumentJson,
  parseCanonicalPushSubscriptionPublicJwkJson,
  PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_BYTES,
  PUSH_SUBSCRIPTION_PUBLIC_KEY_PATH as PROTOCOL_PUBLIC_KEY_PATH,
} from "../supabase/functions/_shared/push-subscription-v2-protocol.js";

export const PUSH_SUBSCRIPTION_PUBLIC_KEY_PATH = PROTOCOL_PUBLIC_KEY_PATH;
export const PUSH_SUBSCRIPTION_PUBLIC_KEY_ASSET = PUSH_SUBSCRIPTION_PUBLIC_KEY_PATH.slice(1);
export const PUSH_SUBSCRIPTION_PUBLIC_JWK_ENV = "PUSH_SUBSCRIPTION_PUBLIC_JWK_JSON";

export async function createPushSubscriptionPublicKeyAssetSource(serializedPublicJwk) {
  if (serializedPublicJwk === "") return null;
  const publicJwk = await parseCanonicalPushSubscriptionPublicJwkJson(serializedPublicJwk);
  const source = await canonicalPushSubscriptionPublicKeyDocumentJson(publicJwk);
  if (new TextEncoder().encode(source).byteLength !== PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_BYTES) {
    throw new Error("PUSH_SUBSCRIPTION_PUBLIC_KEY_DOCUMENT_INVALID");
  }
  return source;
}

export function createPushSubscriptionPublicKeyAssetPlugin(serializedPublicJwk) {
  let sourceRequest;
  const loadSource = () => {
    sourceRequest ??= createPushSubscriptionPublicKeyAssetSource(serializedPublicJwk);
    return sourceRequest;
  };

  return {
    name: "tennis-push-subscription-public-key",
    async configureServer(server) {
      const source = await loadSource();
      if (source === null) return;
      server.middlewares.use((request, response, next) => {
        if (request.url !== PUSH_SUBSCRIPTION_PUBLIC_KEY_PATH || !["GET", "HEAD"].includes(request.method ?? "GET")) {
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
      this.emitFile({ fileName: PUSH_SUBSCRIPTION_PUBLIC_KEY_ASSET, source, type: "asset" });
    },
  };
}
