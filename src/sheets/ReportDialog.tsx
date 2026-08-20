import { flushSync } from "react-dom";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import { reportDialogRuntime } from "../sessionPresentation.ts";
import { createSurfaceRoot, type SurfaceContentLifecycle } from "./surfaceRoot.ts";

/**
 * The reason list stays a single source in `sessionPresentation.ts`; this content only
 * renders it. Validation ("請選擇檢舉原因。"), the submitting guard, `runAsyncAction`
 * and the success swap (`form.hidden` / `success.hidden` / focus) all stay in the
 * factory closure, and `[data-report-error]`, `[data-report-success]`, the form and
 * the submit button keep their legacy imperative writers. This component declares
 * no state, so it never re-renders and can never patch those writes back.
 */
interface ReportDialogContentOptions {
  onClose(): void;
  targetLabel: string;
}

function ReportDialog({ onClose, targetLabel }: ReportDialogContentOptions) {
  return (
    <>
      <div className="surface__head">
        <div>
          <p className="surface__eyebrow">檢舉</p>
          <h2>回報問題</h2>
        </div>
        <button type="button" className="surface__close" data-surface-close="" aria-label="關閉檢舉" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="surface__copy">{targetLabel}</p>
      <form data-testid="report-form" className="report-form" noValidate>
        <fieldset className="form-fieldset">
          <legend>檢舉原因</legend>
          {reportDialogRuntime.REPORT_REASONS.map((reason) => (
            // The radios stay uncontrolled: the factory reads the chosen reason
            // straight off the DOM with `[name='report-reason']:checked`.
            <label key={reason}>
              <input type="radio" name="report-reason" value={reason} />
              {reason}
            </label>
          ))}
        </fieldset>
        <p className="form-error" data-report-error="" role="alert" hidden />
        <button type="submit" className="session-primary" data-testid="report-submit">
          送出檢舉
        </button>
      </form>
      <p className="surface__message" data-report-success="" role="status" aria-live="polite" tabIndex={-1} hidden>
        已送出檢舉，謝謝你的回報。
      </p>
    </>
  );
}

/** Mount static React content inside mountDialog's existing surface element. */
export function mountReportDialogContent(
  rootElement: HTMLElement,
  options: ReportDialogContentOptions
): SurfaceContentLifecycle {
  const reactRoot = createSurfaceRoot(rootElement);
  flushSync(() =>
    reactRoot.render(
      <AppErrorBoundary rootElement={rootElement} surface="report-dialog">
        <ReportDialog {...options} />
      </AppErrorBoundary>
    )
  );
  return reactRoot;
}
