import { createRef, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import type { CourtSummary } from "../domainTypes.ts";

interface EditCourt extends CourtSummary {
  city?: string;
  district?: string;
}

interface EditableSession {
  courtId: number | string | null;
  feeNote?: string | null;
  notes?: string | null;
  ntrpMax?: number | null;
  ntrpMin?: number | null;
  playType: string;
  slotsTotal: number | null;
  startAt: string;
  venueType: string;
}

interface EditSessionActionNodes {
  error: HTMLElement;
  form: HTMLFormElement;
  submit: HTMLButtonElement;
}

interface EditSessionContentOptions {
  courts: EditCourt[];
  courtsReady: boolean;
  hasOptionalValues: boolean;
  ntrpExplanation: string;
  onClose(): void;
  onSubmit(nodes: EditSessionActionNodes): void | Promise<void>;
  playTypeHint: string;
  playTypes: string[];
  session: EditableSession;
  startAtLocal: string;
}

export interface EditSessionContentContract {
  setCourts(courts: EditCourt[], options?: { ready?: boolean }): void;
}

interface EditSessionSheetProps extends EditSessionContentOptions {
  contentRef: React.Ref<EditSessionContentContract>;
}

function initialCourtValue(courts: EditCourt[], courtId: EditableSession["courtId"]) {
  const expected = String(courtId ?? "");
  return courts.some((court) => String(court.id) === expected) ? expected : "";
}

function EditSessionSheet({
  contentRef,
  courts: initialCourts,
  courtsReady: initialCourtsReady,
  hasOptionalValues,
  ntrpExplanation,
  onClose,
  onSubmit,
  playTypeHint,
  playTypes,
  session,
  startAtLocal,
}: EditSessionSheetProps) {
  const [availableCourts, setAvailableCourts] = useState(initialCourts);
  const [courtsReady, setCourtsReady] = useState(Boolean(initialCourtsReady));
  const [courtId, setCourtId] = useState(() => initialCourtValue(initialCourts, session.courtId));
  const [playType, setPlayType] = useState(session.playType);
  const [slotsMissing, setSlotsMissing] = useState(Number(session.slotsTotal));
  const courtSelectRef = useRef<HTMLSelectElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useImperativeHandle(
    contentRef,
    () => ({
      setCourts(courts, { ready = true } = {}) {
        const liveSelection = courtSelectRef.current?.value ?? courtId;
        setAvailableCourts(courts);
        setCourtsReady(Boolean(ready));
        setCourtId(liveSelection);
      },
    }),
    [courtId]
  );

  const courtsAvailable = courtsReady && availableCourts.length > 0;
  const courtStatus = !courtsReady ? "正在載入台北市球場…" : availableCourts.length ? "" : "目前沒有可選的台北市球場。";

  const submitForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!errorRef.current || !formRef.current || !submitRef.current) return;
    void onSubmit({ error: errorRef.current, form: formRef.current, submit: submitRef.current });
  };

  return (
    <>
      <div className="surface__head">
        <div>
          <p className="surface__eyebrow">編輯球局</p>
          <h2>更新已建立的球局</h2>
        </div>
        <button
          type="button"
          className="surface__close"
          data-surface-close=""
          aria-label="關閉編輯球局"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <form
        className="create-session-form"
        data-testid="session-edit-form"
        noValidate
        onSubmit={submitForm}
        ref={formRef}
      >
        <p>
          <span className="session-badge">{session.venueType === "walk_on" ? "現場等場" : "已訂場"}</span>
        </p>
        <label className="form-field" htmlFor="session-edit-start-at">
          <span>台北時間</span>
          <input
            id="session-edit-start-at"
            name="startAtLocal"
            data-testid="session-edit-start-at"
            type="datetime-local"
            defaultValue={startAtLocal}
            step="0.001"
            required
          />
        </label>
        <div className="form-field">
          <label htmlFor="session-edit-court">台北市球場</label>
          <select
            id="session-edit-court"
            name="courtId"
            data-testid="session-edit-court"
            required
            disabled={!courtsAvailable}
            value={courtId}
            onChange={(event) => setCourtId(event.currentTarget.value)}
            ref={courtSelectRef}
          >
            <option value="">請選擇球場</option>
            {availableCourts.map((court) => (
              <option value={String(court.id)} key={String(court.id)}>
                {court.name} · {court.district ?? "台北市"}
              </option>
            ))}
          </select>
          <p className="form-hint" data-edit-courts-status="" role="status" aria-live="polite" hidden={courtsAvailable}>
            {courtStatus}
          </p>
        </div>
        <div className="form-field">
          <label htmlFor="session-edit-play-type">打法</label>
          <select
            id="session-edit-play-type"
            name="playType"
            data-testid="session-edit-play-type"
            required
            aria-describedby="session-edit-play-type-hint"
            value={playType}
            onChange={(event) => {
              const nextPlayType = event.currentTarget.value;
              setPlayType(nextPlayType);
              if (nextPlayType === "單打") setSlotsMissing(1);
              if (nextPlayType === "雙打") setSlotsMissing(3);
            }}
          >
            {playTypes.map((type) => (
              <option value={type} key={type}>
                {type}
              </option>
            ))}
          </select>
          <p className="form-hint" id="session-edit-play-type-hint">
            {playTypeHint}
          </p>
        </div>
        <fieldset className="form-fieldset">
          <legend>還缺幾位</legend>
          <div className="slots-options">
            {[1, 2, 3].map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="slotsMissing"
                  value={value}
                  data-testid={`session-edit-slots-${value}`}
                  checked={slotsMissing === value}
                  onChange={() => setSlotsMissing(value)}
                />
                <span>{value} 位</span>
              </label>
            ))}
          </div>
          <p className="form-hint">不含你自己。</p>
        </fieldset>
        <details className="form-optional" open={hasOptionalValues}>
          <summary>進階設定（選填）</summary>
          <fieldset className="form-fieldset">
            <legend>適合程度（選填）</legend>
            <div className="form-row">
              <label className="form-field" htmlFor="session-edit-ntrp-min">
                <span>最低 NTRP</span>
                <input
                  id="session-edit-ntrp-min"
                  name="ntrpMin"
                  type="number"
                  min="1"
                  max="7"
                  step="0.5"
                  inputMode="decimal"
                  defaultValue={session.ntrpMin ?? ""}
                />
              </label>
              <label className="form-field" htmlFor="session-edit-ntrp-max">
                <span>最高 NTRP</span>
                <input
                  id="session-edit-ntrp-max"
                  name="ntrpMax"
                  type="number"
                  min="1"
                  max="7"
                  step="0.5"
                  inputMode="decimal"
                  defaultValue={session.ntrpMax ?? ""}
                />
              </label>
            </div>
            <p className="form-hint" data-ntrp-explanation="">
              {ntrpExplanation}
            </p>
          </fieldset>
          <label className="form-field" htmlFor="session-edit-fee-note">
            <span>費用說明（選填，最多 500 字）</span>
            <textarea
              id="session-edit-fee-note"
              name="feeNote"
              maxLength={500}
              rows={2}
              defaultValue={session.feeNote ?? ""}
            />
          </label>
          <label className="form-field" htmlFor="session-edit-notes">
            <span>備註（選填，最多 500 字）</span>
            <textarea
              id="session-edit-notes"
              name="notes"
              maxLength={500}
              rows={4}
              defaultValue={session.notes ?? ""}
            />
          </label>
        </details>
        <p className="form-error" data-edit-error="" role="alert" hidden ref={errorRef} />
        <button
          type="submit"
          className="session-primary"
          data-testid="session-edit-submit"
          ref={submitRef}
          key="edit-submit"
        >
          儲存變更
        </button>
      </form>
    </>
  );
}

const EditSessionSheetWithRef = forwardRef<EditSessionContentContract, EditSessionContentOptions>(
  function EditSessionSheetWithRef(props, ref) {
    return <EditSessionSheet {...props} contentRef={ref} />;
  }
);

/** Mount React into mountSheet's surface contents and expose synchronous court updates. */
export function mountEditSessionSheetContent(
  rootElement: HTMLElement,
  options: EditSessionContentOptions
): EditSessionContentContract {
  const reactRoot = createRoot(rootElement);
  const contentRef = createRef<EditSessionContentContract>();
  let boundaryFailed = false;
  flushSync(() =>
    reactRoot.render(
      <AppErrorBoundary
        rootElement={rootElement}
        surface="edit-session-sheet"
        onError={() => {
          boundaryFailed = true;
        }}
      >
        <EditSessionSheetWithRef {...options} ref={contentRef} />
      </AppErrorBoundary>
    )
  );
  if (!contentRef.current && !boundaryFailed) throw new Error("EditSessionSheet content did not mount.");

  return {
    setCourts(courts, options) {
      flushSync(() => contentRef.current?.setCourts(courts, options));
    },
  };
}
