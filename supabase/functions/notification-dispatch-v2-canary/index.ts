import { isPublicNetworkAddress, prepareDispatcherEgress } from "../notification-outbox-dispatch/v2-egress.js";
import { classifyProviderHttpResponse, runWithTotalDeadline } from "../notification-outbox-dispatch/v2-outcome.js";
import { dispatcherV2CanaryRuntimeAccess } from "./runtime.js";

const SAFE_CANARY_ERROR_CODES = new Set([
  "DISPATCH_DNS_IPV4_FAILED",
  "DISPATCH_DNS_IPV6_FAILED",
  "DISPATCH_DNS_RESULT_INVALID",
  "DISPATCH_PROVIDER_POLICY_REJECTED",
  "PUSH_PROVIDER_POLICY_INVALID",
]);

function env(name: string) {
  return Deno.env.get(name) ?? "";
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
    },
    status,
  });
}

function localCanaryEnabled() {
  return dispatcherV2CanaryRuntimeAccess(env).localTestEnabled;
}

function configuredDeadlineMs() {
  const value = Number(env("DISPATCH_V2_CANARY_DEADLINE_MS"));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("DISPATCH_CANARY_CONFIG_INVALID");
  return value;
}

function configuredDnsServer() {
  const value = env("DISPATCH_V2_CANARY_DNS_SERVER");
  if (!isPublicNetworkAddress(value, 4)) throw new Error("DISPATCH_CANARY_CONFIG_INVALID");
  return value;
}

async function writeAll(connection: Deno.TlsConn, bytes: Uint8Array) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = await connection.write(bytes.subarray(offset));
    if (written <= 0) throw new Error("DISPATCH_CANARY_WRITE_FAILED");
    offset += written;
  }
}

async function readStatusCode(connection: Deno.TlsConn) {
  const decoder = new TextDecoder();
  const buffer = new Uint8Array(1024);
  let headers = "";
  while (!headers.includes("\r\n\r\n")) {
    const read = await connection.read(buffer);
    if (read === null) break;
    headers += decoder.decode(buffer.subarray(0, read), { stream: true });
    if (headers.length > 8192) throw new Error("DISPATCH_CANARY_RESPONSE_INVALID");
  }
  const match = /^HTTP\/1\.[01] ([0-9]{3})(?: |\r\n)/u.exec(headers);
  const statusCode = Number(match?.[1]);
  if (!Number.isInteger(statusCode)) throw new Error("DISPATCH_CANARY_RESPONSE_INVALID");
  return statusCode;
}

async function pinnedHeadRequest(
  prepared: Awaited<ReturnType<typeof prepareDispatcherEgress>>,
  signal: AbortSignal,
  markRequestInvoked: () => void
) {
  const selected = prepared.addresses.find((entry) => entry.family === 4) ?? prepared.addresses[0];
  if (!selected) throw new Error("DISPATCH_CANARY_ADDRESS_MISSING");
  let connection: Deno.TcpConn | Deno.TlsConn | null = null;
  const close = () => {
    try {
      connection?.close();
    } catch {
      // A concurrently aborted connection can already be closed.
    }
  };
  signal.addEventListener("abort", close, { once: true });
  try {
    connection = await Deno.connect({ hostname: selected.address, port: 443, signal, transport: "tcp" });
    const remoteAddress = connection.remoteAddr;
    const addressMatched = remoteAddress.transport === "tcp" && remoteAddress.hostname === selected.address;
    if (!addressMatched) throw new Error("DISPATCH_CANARY_ADDRESS_MISMATCH");

    connection = await Deno.startTls(connection, {
      alpnProtocols: ["http/1.1"],
      hostname: prepared.hostname,
    });
    const endpoint = new URL(prepared.endpoint);
    const requestBytes = new TextEncoder().encode(
      `HEAD ${endpoint.pathname}${endpoint.search} HTTP/1.1\r\nHost: ${prepared.hostname}\r\nAccept: */*\r\nUser-Agent: qiuka-local-dispatch-canary\r\nConnection: close\r\n\r\n`
    );
    markRequestInvoked();
    await writeAll(connection, requestBytes);
    return {
      addressFamily: selected.family,
      addressMatched,
      reusedSocket: false,
      statusCode: await readStatusCode(connection),
    };
  } finally {
    signal.removeEventListener("abort", close);
    close();
  }
}

Deno.serve(async (request) => {
  if (!localCanaryEnabled()) return json({ kind: "unavailable" }, 503);
  if (request.method !== "POST") return json({ kind: "method-not-allowed" }, 405);

  let prepared: Awaited<ReturnType<typeof prepareDispatcherEgress>> | null = null;
  let stage = "configuration";
  try {
    const deadlineMs = configuredDeadlineMs();
    const dnsServer = configuredDnsServer();
    stage = "provider-policy";
    prepared = await prepareDispatcherEgress({
      endpoint: env("DISPATCH_V2_CANARY_ENDPOINT"),
      resolveAddresses: async (hostname) => {
        stage = "dns";
        const nameServer = { ipAddr: dnsServer, port: 53 };
        const [ipv4, ipv6] = await Promise.all([
          Deno.resolveDns(hostname, "A", { nameServer }),
          Deno.resolveDns(hostname, "AAAA", { nameServer }),
        ]);
        const ipv4Public = ipv4.every((address) => isPublicNetworkAddress(address, 4));
        const ipv6Public = ipv6.every((address) => isPublicNetworkAddress(address, 6));
        stage = `dns-result-${ipv4.length}-${ipv6.length}-${ipv4Public}-${ipv6Public}`;
        return { ipv4, ipv6 };
      },
      serializedProviderOrigins: env("DISPATCH_V2_CANARY_PROVIDER_ORIGINS"),
    });
    stage = "request";
    const result = await runWithTotalDeadline({
      deadlineMs,
      operation: ({ markRequestInvoked, signal }) => pinnedHeadRequest(prepared!, signal, markRequestInvoked),
    });
    if (result.kind !== "completed") return json({ kind: result.kind }, 503);

    stage = "classification";
    const providerOutcome = classifyProviderHttpResponse({
      providerPolicyVerified: true,
      receivedAtMs: Date.now(),
      retryAfter: null,
      statusCode: result.value.statusCode,
    });
    const passed =
      providerOutcome.kind === "accepted" &&
      result.value.addressMatched === true &&
      result.value.reusedSocket === false &&
      (result.value.addressFamily === 4 || result.value.addressFamily === 6);
    return json(
      {
        addressFamily: result.value.addressFamily,
        addressMatched: result.value.addressMatched,
        kind: providerOutcome.kind,
        policyVerified: true,
        reusedSocket: result.value.reusedSocket,
        statusCode: providerOutcome.statusCode,
        transport: "deno-native-tcp-starttls",
      },
      passed ? 200 : 503
    );
  } catch (error) {
    const candidate = error instanceof Error ? error.message : "";
    const code = SAFE_CANARY_ERROR_CODES.has(candidate) ? candidate : "DISPATCH_CANARY_UNKNOWN";
    return json({ code, kind: "failed", stage }, 503);
  } finally {
    prepared?.agent.destroy();
  }
});
