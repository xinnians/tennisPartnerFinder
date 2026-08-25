import type { BrowserOptions } from "@sentry/browser";

import { APP_ERROR_TRANSPORT_FIELDS, configureAppErrorTransport, type AppErrorTransport } from "./appErrors.ts";

type SentrySdk = typeof import("./sentryBrowserSdk.ts");

interface SentryErrorTransportTestingHooks {
  readonly loadSdk?: () => Promise<SentrySdk>;
  readonly transport?: BrowserOptions["transport"];
}

interface ConfigureSentryErrorTransportOptions {
  readonly dsn: string;
  readonly environment: "preview" | "production";
  readonly testing?: SentryErrorTransportTestingHooks;
}

export interface ConfiguredSentryErrorTransport {
  readonly ready: Promise<boolean>;
  readonly restore: () => void;
}

function normalizedBrowserDsn(value: string): string {
  const candidate = value.trim();
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    const projectId = parsed.pathname.split("/").filter(Boolean).at(-1);
    return parsed.protocol === "https:" && Boolean(parsed.username) && /^\d+$/.test(projectId ?? "") ? candidate : "";
  } catch {
    return "";
  }
}

function disabledDataCollection(): NonNullable<BrowserOptions["dataCollection"]> {
  return {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: false, response: false },
    httpBodies: [],
    urlQueryParams: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    stackFrameVariables: false,
    frameContextLines: 0,
  };
}

export function configureSentryErrorTransport({
  dsn,
  environment,
  testing,
}: ConfigureSentryErrorTransportOptions): ConfiguredSentryErrorTransport {
  let active = true;
  let client: ReturnType<SentrySdk["init"]>;
  let sdk: SentrySdk | undefined;

  const adapter: AppErrorTransport = (report) => {
    if (!active || !sdk) return;
    try {
      sdk.captureEvent({
        tags: {
          [APP_ERROR_TRANSPORT_FIELDS[0]]: report.errorName,
          [APP_ERROR_TRANSPORT_FIELDS[1]]: report.kind,
          [APP_ERROR_TRANSPORT_FIELDS[2]]: report.surface,
        },
        breadcrumbs: [],
      });
    } catch {
      // Reporting failures must stay invisible to the application and user.
    }
  };

  const restoreAppTransport = configureAppErrorTransport(adapter);
  const browserDsn = normalizedBrowserDsn(dsn);
  const loadSdk = testing?.loadSdk ?? (() => import("./sentryBrowserSdk.ts"));
  const ready = browserDsn
    ? loadSdk()
        .then((loadedSdk) => {
          if (!active) return false;
          const initOptions: BrowserOptions & { autoSessionTracking: false } = {
            dsn: browserDsn,
            environment,
            defaultIntegrations: false,
            integrations: [],
            sendDefaultPii: false,
            dataCollection: disabledDataCollection(),
            autoSessionTracking: false,
            maxBreadcrumbs: 0,
            beforeBreadcrumb: () => null,
            beforeSend: (event) => ({ ...event, breadcrumbs: [] }),
            enableLogs: false,
            sendClientReports: false,
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0,
            profilesSampleRate: 0,
            profileSessionSampleRate: 0,
            ...(testing?.transport ? { transport: testing.transport } : {}),
          };
          client = loadedSdk.init(initOptions);
          if (!client || !active) {
            void client?.close(0).then(undefined, () => {});
            return false;
          }
          sdk = loadedSdk;
          return true;
        })
        .catch(() => false)
    : Promise.resolve(false);

  return {
    ready,
    restore: () => {
      if (!active) return;
      active = false;
      sdk = undefined;
      restoreAppTransport();
      try {
        void client?.close(0).then(undefined, () => {});
      } catch {
        // Teardown is best effort during tests and HMR.
      }
    },
  };
}
