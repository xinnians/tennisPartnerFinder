const HEADER_TERMINATOR = Object.freeze([13, 10, 13, 10]);
export const DISPATCH_V2_RESPONSE_HEADER_MAX_BYTES = 16_384;

const WEB_PUSH_HEADER_NAMES = Object.freeze([
  "Authorization",
  "Content-Encoding",
  "Content-Length",
  "Content-Type",
  "TTL",
  "Urgency",
]);
const VAPID_AUTHORIZATION_PATTERN = /^vapid t=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+, k=[A-Za-z0-9_-]+$/u;
const HTTP_FIELD_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const VISIBLE_ASCII_PATTERN = /^[\x20-\x7e]+$/u;

function fixedError(code) {
  return new Error(code);
}

function exactKeys(value, expectedKeys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function exactNonemptyEnvironmentValue(readEnvironment, name) {
  const value = readEnvironment(name);
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw fixedError("DISPATCH_V2_WEB_PUSH_CONFIG_INVALID");
  }
  return value;
}

export function readDispatcherV2DenoWebPushConfig(readEnvironment) {
  if (typeof readEnvironment !== "function" || readEnvironment("WEB_PUSH_TRANSPORT") !== "deno-native-web-push-v1") {
    throw fixedError("DISPATCH_V2_WEB_PUSH_CONFIG_INVALID");
  }
  return Object.freeze({
    serializedProviderOrigins: exactNonemptyEnvironmentValue(readEnvironment, "PUSH_PROVIDER_ORIGINS_V1"),
    vapidPrivateKey: exactNonemptyEnvironmentValue(readEnvironment, "WEB_PUSH_VAPID_PRIVATE_KEY"),
    vapidPublicKey: exactNonemptyEnvironmentValue(readEnvironment, "WEB_PUSH_VAPID_PUBLIC_KEY"),
    vapidSubject: exactNonemptyEnvironmentValue(readEnvironment, "WEB_PUSH_VAPID_SUBJECT"),
  });
}

export function safeIntegerFromCanonicalDecimal(value, { positive = false } = {}) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw fixedError("DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < (positive ? 1 : 0)) {
    throw fixedError("DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID");
  }
  return parsed;
}

export function dispatcherDatabaseTimestampMs(value) {
  if (
    typeof value !== "string" ||
    value.length > 40 ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/u.test(value)
  ) {
    throw fixedError("DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID");
  }
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw fixedError("DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID");
  }
  return parsed;
}

function validHeaderValue(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 8_192 && VISIBLE_ASCII_PATTERN.test(value);
}

export function createValidatedWebPushRequest({
  endpoint,
  generateRequestDetails,
  message,
  subscription,
  ttlSeconds,
  vapidPrivateKey,
  vapidPublicKey,
  vapidSubject,
}) {
  if (
    typeof endpoint !== "string" ||
    typeof generateRequestDetails !== "function" ||
    typeof message !== "string" ||
    !message ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 0
  ) {
    throw fixedError("DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID");
  }

  let details;
  try {
    details = generateRequestDetails(subscription, message, {
      TTL: ttlSeconds,
      contentEncoding: "aes128gcm",
      urgency: "normal",
      vapidDetails: {
        privateKey: vapidPrivateKey,
        publicKey: vapidPublicKey,
        subject: vapidSubject,
      },
    });
  } catch {
    throw fixedError("DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID");
  }

  if (
    !exactKeys(details, ["body", "endpoint", "headers", "method"]) ||
    details.endpoint !== endpoint ||
    details.method !== "POST" ||
    !(details.body instanceof Uint8Array) ||
    details.body.byteLength <= 0 ||
    !exactKeys(details.headers, WEB_PUSH_HEADER_NAMES) ||
    details.headers["Content-Encoding"] !== "aes128gcm" ||
    details.headers["Content-Length"] !== details.body.byteLength ||
    details.headers["Content-Type"] !== "application/octet-stream" ||
    details.headers.TTL !== ttlSeconds ||
    details.headers.Urgency !== "normal" ||
    !validHeaderValue(details.headers.Authorization) ||
    !VAPID_AUTHORIZATION_PATTERN.test(details.headers.Authorization)
  ) {
    throw fixedError("DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID");
  }

  return {
    body: new Uint8Array(details.body),
    headers: Object.freeze({ ...details.headers }),
  };
}

export function createWebPushHttp1Head(endpoint, headers) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw fixedError("DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID");
  }
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.href !== endpoint ||
    !exactKeys(headers, WEB_PUSH_HEADER_NAMES)
  ) {
    throw fixedError("DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID");
  }

  const serializedHeaders = WEB_PUSH_HEADER_NAMES.map((name) => {
    const value = String(headers[name]);
    if (!HTTP_FIELD_NAME_PATTERN.test(name) || !validHeaderValue(value)) {
      throw fixedError("DISPATCH_V2_WEB_PUSH_MATERIAL_INVALID");
    }
    return `${name}: ${value}`;
  });
  const target = `${url.pathname}${url.search}`;
  return new TextEncoder().encode(
    [`POST ${target} HTTP/1.1`, `Host: ${url.hostname}`, ...serializedHeaders, "Connection: close", "", ""].join("\r\n")
  );
}

export function findHttpHeaderTerminator(bytes) {
  if (!(bytes instanceof Uint8Array)) return -1;
  for (let index = 0; index <= bytes.byteLength - HEADER_TERMINATOR.length; index += 1) {
    if (HEADER_TERMINATOR.every((byte, offset) => bytes[index + offset] === byte)) {
      return index + HEADER_TERMINATOR.length;
    }
  }
  return -1;
}

export function parseProviderHttp1ResponseHead(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.byteLength <= HEADER_TERMINATOR.length ||
    bytes.byteLength > DISPATCH_V2_RESPONSE_HEADER_MAX_BYTES ||
    findHttpHeaderTerminator(bytes) !== bytes.byteLength
  ) {
    throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");
  }

  let serialized;
  try {
    serialized = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");
  }
  if (!/^[\t\x20-\x7e\r\n]+$/u.test(serialized)) {
    throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");
  }

  const lines = serialized.slice(0, -4).split("\r\n");
  const statusMatch = /^HTTP\/1\.[01] ([2-5][0-9]{2})(?: [\x20-\x7e]*)?$/u.exec(lines.shift() ?? "");
  if (!statusMatch) throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");

  let retryAfter = null;
  let retryAfterSeen = false;
  for (const line of lines) {
    if (!line || /^[ \t]/u.test(line)) throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");
    const separator = line.indexOf(":");
    if (separator <= 0) throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");
    const name = line.slice(0, separator);
    const rawValue = line.slice(separator + 1);
    if (!HTTP_FIELD_NAME_PATTERN.test(name) || !/^[\t\x20-\x7e]*$/u.test(rawValue)) {
      throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");
    }
    if (name.toLowerCase() === "retry-after") {
      if (retryAfterSeen) throw fixedError("DISPATCH_V2_PROVIDER_RESPONSE_INVALID");
      retryAfterSeen = true;
      retryAfter = rawValue.replace(/^[ \t]+|[ \t]+$/gu, "");
    }
  }

  return Object.freeze({ retryAfter, statusCode: Number(statusMatch[1]) });
}
