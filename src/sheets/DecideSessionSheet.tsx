import { createRef, forwardRef, useImperativeHandle, useState } from "react";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import type { CourtSummary } from "../domainTypes.ts";
import { decideSessionSheetRuntime } from "../sessionPresentation.ts";
import { mountSurfaceContent, type SurfaceContentLifecycle } from "../app/SurfaceHost.tsx";

export interface DecideSessionCourt extends CourtSummary {
  city?: string;
  district?: string;
}

interface DecideCourtOption {
  id: string;
  name: string;
}

interface DecideCourtButtonsPresentation {
  options: DecideCourtOption[];
  statusText: string;
}

export interface DecideSessionContentContract {
  setCourts(courts: DecideSessionCourt[], options?: { ready?: boolean }): void;
}

interface DecideSessionContentOptions {
  candidateIds: Set<string>;
  onClose(): void;
  onDecide(event: React.MouseEvent<HTMLButtonElement>): void;
  rangeEndLocal: string;
  startAtLocal: string;
  unavailable: boolean;
}

interface DecideSessionSheetProps extends DecideSessionContentOptions {
  contentRef: React.Ref<DecideSessionContentContract>;
}

function DecideSessionSheet({
  candidateIds,
  contentRef,
  onClose,
  onDecide,
  rangeEndLocal,
  startAtLocal,
  unavailable,
}: DecideSessionSheetProps) {
  // Legacy parity: mountSheet produced an empty court container and an empty
  // status paragraph, and only the factory's own trailing
  // `setCourts(availableCourts, { ready: courtOptionsReady })` filled them in.
  // Starting from an empty presentation keeps the terminal branch — where that
  // call never happens because renderCourtButtons returns early — showing the
  // same empty status the imperative sheet showed.
  const [courtButtons, setCourtButtons] = useState<DecideCourtButtonsPresentation>({
    options: [],
    statusText: "",
  });
  // The imperative sheet replaced the whole button container with innerHTML, so
  // every refresh detached the previous buttons. runAsyncAction watches exactly
  // those nodes (`rerendered()`), so a stable key would silently turn a refresh
  // during an in-flight decide from "do not restore the controls" into "restore
  // them". Folding the refresh generation into the key recreates the nodes.
  const [generation, setGeneration] = useState(0);

  useImperativeHandle(
    contentRef,
    () => ({
      setCourts(nextCourts, { ready = true } = {}) {
        setCourtButtons(decideSessionSheetRuntime.decideCourtOptionsPresentation(nextCourts, candidateIds, { ready }));
        setGeneration((value) => value + 1);
      },
    }),
    [candidateIds]
  );

  return (
    <>
      <div className="surface__head">
        <div>
          <p className="surface__eyebrow">候選局定案</p>
          <h2>選一座球場完成定案</h2>
        </div>
        <button type="button" className="surface__close" data-surface-close="" aria-label="關閉定案" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="surface__copy">時間預設為範圍起點；調整後，點選球場即可完成。</p>
      <div data-decision-controls="" hidden={unavailable}>
        <label className="form-field" htmlFor="session-decision-time">
          <span>台北時間</span>
          {/* Uncontrolled on purpose: the legacy input only ever received a value
              attribute, so a court refresh never overwrote a time the host had
              already adjusted. */}
          <input
            id="session-decision-time"
            data-testid="session-decision-time"
            type="datetime-local"
            defaultValue={startAtLocal}
            min={startAtLocal}
            max={rangeEndLocal}
            step="0.001"
          />
        </label>
        <div className="candidate-decision-buttons" aria-label="候選球場" data-decision-courts="">
          {courtButtons.options.map((option) => (
            <button
              key={`${generation}:${option.id}`}
              type="button"
              className="session-primary"
              data-decide-court={option.id}
              data-testid={`decide-court-${option.id}`}
              onClick={onDecide}
            >
              {option.name}
            </button>
          ))}
        </div>
        <p className="form-hint" data-decision-courts-status="" role="status" aria-live="polite">
          {courtButtons.statusText}
        </p>
        {/* `hidden` and the text stay constant props so React never patches them:
            runAsyncAction and the legacy validation branch keep owning this node. */}
        <p className="form-error" data-decision-error="" role="alert" hidden />
      </div>
      <p className="surface__message" data-decision-terminal="" role="status" tabIndex={-1} hidden={!unavailable}>
        候選球局已逾期或下架，無法再定案。
      </p>
    </>
  );
}

const DecideSessionSheetWithRef = forwardRef<DecideSessionContentContract, DecideSessionContentOptions>(
  function DecideSessionSheetWithRef(props, ref) {
    return <DecideSessionSheet {...props} contentRef={ref} />;
  }
);

/** Mount React into mountSheet's surface contents and expose synchronous court updates. */
export function mountDecideSessionSheetContent(
  rootElement: HTMLElement,
  options: DecideSessionContentOptions
): DecideSessionContentContract & SurfaceContentLifecycle {
  const surfaceContent = mountSurfaceContent(rootElement);
  const contentRef = createRef<DecideSessionContentContract>();
  let boundaryFailed = false;
  surfaceContent.render(
    <AppErrorBoundary
      rootElement={rootElement}
      surface="decide-session-sheet"
      onError={() => {
        boundaryFailed = true;
      }}
    >
      <DecideSessionSheetWithRef {...options} ref={contentRef} />
    </AppErrorBoundary>
  );
  if (!contentRef.current && !boundaryFailed) throw new Error("DecideSessionSheet content did not mount.");

  return {
    isSurfaceRootLive: surfaceContent.isSurfaceRootLive,
    setCourts(courts, courtsOptions) {
      surfaceContent.commit(() => contentRef.current?.setCourts(courts, courtsOptions));
    },
    unmount: surfaceContent.unmount,
  };
}
