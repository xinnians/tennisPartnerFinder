export const PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN = "https://push-fixture.qiuka.tw";

export const PUSH_SUBSCRIPTION_V2_ENDPOINT_CORPUS = Object.freeze([
  Object.freeze({
    endpoint: `${PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN}/send/opaque?token=a%2Fb`,
    providerValid: true,
    structureValid: true,
  }),
  Object.freeze({
    endpoint: ` ${PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN}/send`,
    providerValid: false,
    structureValid: false,
  }),
  Object.freeze({
    endpoint: `${PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN}:443/send`,
    providerValid: false,
    structureValid: false,
  }),
  Object.freeze({
    endpoint: `https://user@push-fixture.qiuka.tw/send`,
    providerValid: false,
    structureValid: false,
  }),
  Object.freeze({
    endpoint: `https://PUSH-FIXTURE.qiuka.tw/send`,
    providerValid: false,
    structureValid: false,
  }),
  Object.freeze({ endpoint: "http://push-fixture.qiuka.tw/send", providerValid: false, structureValid: false }),
  Object.freeze({ endpoint: "https://127.0.0.1/send", providerValid: false, structureValid: false }),
  Object.freeze({ endpoint: "https://[::1]/send", providerValid: false, structureValid: false }),
  Object.freeze({ endpoint: "https://intranet/send", providerValid: false, structureValid: false }),
  Object.freeze({ endpoint: "https://push.localhost/send", providerValid: false, structureValid: false }),
  Object.freeze({ endpoint: "https://push.local/send", providerValid: false, structureValid: false }),
  Object.freeze({ endpoint: "https://router.home.arpa/send", providerValid: false, structureValid: false }),
  Object.freeze({ endpoint: "https://push.other.qiuka.tw/send", providerValid: false, structureValid: true }),
]);
