// Keep the dynamic vendor boundary narrow so Replay, Feedback, profiling, and
// other unused @sentry/browser exports never enter the lazy error chunk.
export { captureEvent, init } from "@sentry/browser";
