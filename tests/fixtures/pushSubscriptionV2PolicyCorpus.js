export const PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN = "https://push-fixture.qiuka.tw";

export const PUSH_SUBSCRIPTION_V2_ENDPOINT_CORPUS = Object.freeze([
  Object.freeze({ endpoint: `${PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN}/send/opaque?token=a%2Fb`, valid: true }),
  Object.freeze({ endpoint: ` ${PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN}/send`, valid: false }),
  Object.freeze({ endpoint: `${PUSH_SUBSCRIPTION_V2_FIXTURE_ORIGIN}:443/send`, valid: false }),
  Object.freeze({ endpoint: `https://user@push-fixture.qiuka.tw/send`, valid: false }),
  Object.freeze({ endpoint: `https://PUSH-FIXTURE.qiuka.tw/send`, valid: false }),
  Object.freeze({ endpoint: "http://push-fixture.qiuka.tw/send", valid: false }),
  Object.freeze({ endpoint: "https://127.0.0.1/send", valid: false }),
  Object.freeze({ endpoint: "https://[::1]/send", valid: false }),
  Object.freeze({ endpoint: "https://intranet/send", valid: false }),
  Object.freeze({ endpoint: "https://push.localhost/send", valid: false }),
  Object.freeze({ endpoint: "https://push.local/send", valid: false }),
  Object.freeze({ endpoint: "https://router.home.arpa/send", valid: false }),
  Object.freeze({ endpoint: "https://push.other.qiuka.tw/send", valid: false }),
]);
