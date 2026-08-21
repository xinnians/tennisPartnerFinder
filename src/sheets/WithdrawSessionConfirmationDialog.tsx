import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import { mountSurfaceContent, type SurfaceContentLifecycle } from "../app/SurfaceHost.tsx";

interface WithdrawSessionConfirmationContentOptions {
  onClose(): void;
}

/**
 * Static content only. The confirm button's click handler, the submitting guard,
 * `runAsyncAction` and the `mounted.close({ reason: "complete" })` success path all
 * stay in `sessionViews.js`, and `[data-withdraw-error]`/`[data-confirm-withdraw]`
 * keep their legacy imperative writers: this component declares no state, so it
 * never re-renders and can never patch back what those writers changed.
 */
function WithdrawSessionConfirmationDialog({ onClose }: WithdrawSessionConfirmationContentOptions) {
  return (
    <>
      <div className="surface__head">
        <div>
          <p className="surface__eyebrow">確認退出</p>
          <h2>確認退出這一局？</h2>
        </div>
        <button type="button" className="surface__close" data-surface-close="" aria-label="關閉確認" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="surface__message">退出後將無法再次申請這一局。</p>
      <p className="form-error" data-withdraw-error="" role="alert" hidden />
      <div className="session-detail__actions">
        <button type="button" className="session-secondary" data-surface-close="" onClick={onClose}>
          先不要
        </button>
        <button type="button" className="session-primary" data-confirm-withdraw="">
          確認退出
        </button>
      </div>
    </>
  );
}

/** Mount static React content inside mountDialog's existing surface element. */
export function mountWithdrawSessionConfirmationDialogContent(
  rootElement: HTMLElement,
  options: WithdrawSessionConfirmationContentOptions
): SurfaceContentLifecycle {
  const surfaceContent = mountSurfaceContent(rootElement);
  surfaceContent.render(
    <AppErrorBoundary rootElement={rootElement} surface="withdraw-session-dialog">
      <WithdrawSessionConfirmationDialog {...options} />
    </AppErrorBoundary>
  );
  return surfaceContent;
}
