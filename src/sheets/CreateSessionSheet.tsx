import { createRef, forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

import { AppErrorBoundary } from "../components/AppErrorBoundary.tsx";
import type { CourtSummary } from "../domainTypes.ts";
import { mountSurfaceContent, type SurfaceContentLifecycle } from "../app/SurfaceHost.tsx";

interface CreateCourt extends CourtSummary {
  city?: string;
  district?: string;
}

interface CreateDateChip {
  key: string;
  label: string;
}

interface CreateNtrpBand {
  key: string;
  label: string;
  max: number | null;
  min: number | null;
}

interface CreateSlotOption {
  endHour: number;
  key: string;
  label: string;
  startHour: number;
}

export interface CreateSessionFormState {
  band: string;
  booked: boolean;
  candCourts: Record<string, boolean>;
  court: number | null;
  customDate: string;
  dateKey: string;
  feeNote: string;
  instant: boolean;
  mode: string;
  need: number;
  note: string;
  nowStart: boolean;
  slot: string | null;
  time: string | null;
  timeCustom: boolean;
  type: string;
}

interface CreateSessionValidatedValue {
  candidateCourtIds?: number[] | null;
  courtId?: number | null;
  playType: string;
  slotsTotal: number;
  startAt: string;
  venueType: string;
}

interface CreateSessionResult {
  sessionId?: number | null;
}

interface CreateDonePresentation {
  court: string;
  date: string;
  meta: string;
  need: string;
  sessionId: number | null;
  time: string;
}

interface CreateSessionSheetConfig {
  bands: CreateNtrpBand[];
  dateChips: CreateDateChip[];
  ntrpExplanation: string;
  playTypeHint: string;
  playTypes: string[];
  profileDisclosure: string;
  slotOptions: CreateSlotOption[];
  timeCustomDefault: string;
  timePresets: string[];
}

interface CandidateWindow {
  rangeEndLocal: string;
  startAtLocal: string;
}

interface CreateSessionActionNodes {
  error: HTMLElement;
  submit: HTMLButtonElement;
}

interface CreateSessionContentOptions {
  bumpTime(time: string | null, deltaMinutes: number): string;
  canPublish(form: CreateSessionFormState): boolean;
  clock(value: Date): string;
  config: CreateSessionSheetConfig;
  courts: CreateCourt[];
  courtsReady: boolean;
  dateValueNow(value: Date): string;
  donePresentation(
    value: CreateSessionValidatedValue,
    result: CreateSessionResult | null | undefined,
    courts: CreateCourt[]
  ): CreateDonePresentation;
  fixedStartAt(form: CreateSessionFormState, now: Date): string;
  candidateWindow(form: CreateSessionFormState, now: Date): CandidateWindow;
  initialForm: CreateSessionFormState;
  now(): Date;
  onBackToMap(): void;
  onClose(): void;
  onSubmit(form: CreateSessionFormState, nodes: CreateSessionActionNodes): void | Promise<void>;
  onViewMySessions(sessionId: number | null): void;
  toast(message: string): void;
}

export interface CreateSessionContentContract {
  setCourts(courts: CreateCourt[], options?: { ready?: boolean }): void;
  showDone(value: CreateSessionValidatedValue, result?: CreateSessionResult | null): void;
}

interface CreateSessionSheetProps extends CreateSessionContentOptions {
  contentRef: React.Ref<CreateSessionContentContract>;
}

function selectedClass(base: string, selected: boolean) {
  return `${base}${selected ? " is-selected" : ""}`;
}

function CourtCell({
  court,
  role,
  selected,
  onClick,
}: {
  court: CreateCourt;
  role: "court" | "cand-court";
  selected: boolean;
  onClick(): void;
}) {
  const testPrefix = role === "court" ? "create-court" : "create-candidate-court";
  return (
    <button
      type="button"
      className={selectedClass("create-v2__court-cell", selected)}
      data-role={role}
      data-value={String(court.id)}
      data-testid={`${testPrefix}-${String(court.id)}`}
      onClick={onClick}
    >
      <span className="create-v2__court-name">{court.name}</span>
      <span className="create-v2__court-sub">{court.district || "台北市"}</span>
    </button>
  );
}

function CreateSessionSheet({
  bumpTime,
  canPublish,
  candidateWindow,
  clock,
  config,
  contentRef,
  courts: initialCourts,
  courtsReady: initialCourtsReady,
  dateValueNow,
  donePresentation,
  fixedStartAt,
  initialForm,
  now,
  onBackToMap,
  onClose,
  onSubmit,
  onViewMySessions,
  toast,
}: CreateSessionSheetProps) {
  const [form, setForm] = useState<CreateSessionFormState>(() => ({
    ...initialForm,
    candCourts: { ...initialForm.candCourts },
  }));
  const [availableCourts, setAvailableCourts] = useState(initialCourts);
  const [courtsReady, setCourtsReady] = useState(Boolean(initialCourtsReady));
  const [stage, setStage] = useState<"form" | "done">("form");
  const [done, setDone] = useState<CreateDonePresentation>({
    court: "",
    date: "",
    meta: "",
    need: "",
    sessionId: null,
    time: "",
  });
  const customDateFieldRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const feeNoteRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const doneTitleRef = useRef<HTMLHeadingElement>(null);

  useImperativeHandle(
    contentRef,
    () => ({
      setCourts(courts, { ready = true } = {}) {
        setAvailableCourts(courts);
        setCourtsReady(Boolean(ready));
      },
      showDone(value, result) {
        setDone(donePresentation(value, result, availableCourts));
        setStage("done");
        requestAnimationFrame(() => doneTitleRef.current?.focus({ preventScroll: true }));
      },
    }),
    [availableCourts, donePresentation]
  );

  const isCandidate = form.mode === "cand";
  const candidateCount = Object.values(form.candCourts).filter(Boolean).length;
  const courtsAvailable = courtsReady && availableCourts.length > 0;
  const courtStatus = !courtsReady ? "正在載入台北市球場…" : availableCourts.length ? "" : "目前沒有可選的台北市球場。";
  const ready = canPublish(form);
  const currentNow = now();
  const startAtValue = isCandidate ? candidateWindow(form, currentNow).startAtLocal : fixedStartAt(form, currentNow);
  const publishLabel = ready ? "發布球局" : isCandidate ? "選 2–3 個候選與時段" : "選好球場與開始時間";

  const updateForm = (next: Partial<CreateSessionFormState>) => {
    setForm((current) => ({ ...current, ...next }));
  };

  useLayoutEffect(() => {
    if (form.dateKey !== "custom" || typeof customDateFieldRef.current?.scrollIntoView !== "function") return;
    customDateFieldRef.current.scrollIntoView({ block: "nearest" });
  }, [form.dateKey]);

  const chooseCandidateCourt = (court: CreateCourt) => {
    const id = String(court.id);
    const selected = Boolean(form.candCourts[id]);
    if (!selected && candidateCount >= 3) {
      toast("候選最多 3 個");
      return;
    }
    const candCourts = { ...form.candCourts, [id]: !selected };
    if (!candCourts[id]) delete candCourts[id];
    updateForm({ candCourts });
  };

  const chooseDate = (key: string) => {
    const openedAt = now();
    const customDate = key === "custom" && !form.customDate ? dateValueNow(openedAt) : form.customDate;
    updateForm({ customDate, dateKey: key, nowStart: false });
  };

  const choosePlayType = (type: string) => {
    const changed = type !== form.type;
    let need = form.need;
    if (changed && type === "單打") need = 1;
    else if (changed && type === "雙打") need = 3;
    updateForm({ need, type });
  };

  const submitForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stage !== "form" || !errorRef.current || !submitRef.current) return;
    void onSubmit(
      {
        ...form,
        feeNote: feeNoteRef.current?.value ?? "",
        note: notesRef.current?.value ?? "",
      },
      { error: errorRef.current, submit: submitRef.current }
    );
  };

  return (
    <>
      <div className="create-v2__head" data-screen-label="開球局">
        <button
          type="button"
          className="create-v2__back"
          data-surface-close=""
          aria-label="關閉開球局"
          onClick={onClose}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div>
          <p className="surface__eyebrow">HOST A MATCH</p>
          <h2>開球局</h2>
        </div>
      </div>
      <div className="create-v2__scroll qm-scroll">
        <form
          className="create-v2__form"
          data-testid="session-form"
          noValidate
          hidden={stage !== "form"}
          onSubmit={submitForm}
        >
          <section className="create-v2__card">
            <p className="create-v2__label">球場</p>
            <div className="create-v2__segmented" role="group" aria-label="場地確定了嗎？">
              <button
                type="button"
                className={`create-v2__seg-btn${!isCandidate ? " is-active" : ""}`}
                data-role="mode"
                data-value="fixed"
                data-testid="create-mode-fixed"
                aria-pressed={!isCandidate}
                onClick={() => updateForm({ mode: "fixed" })}
              >
                已定球場
              </button>
              <button
                type="button"
                className={`create-v2__seg-btn${isCandidate ? " is-active" : ""}`}
                data-role="mode"
                data-value="cand"
                data-testid="session-venue-candidates"
                aria-pressed={isCandidate}
                onClick={() => updateForm({ mode: "cand" })}
              >
                先列候選
              </button>
            </div>
            <div data-single-court-fields="" hidden={isCandidate}>
              <div
                className="create-v2__court-grid qm-scroll"
                data-testid="session-court"
                role="group"
                aria-label="選擇球場"
              >
                {courtsAvailable
                  ? availableCourts.map((court) => (
                      <CourtCell
                        court={court}
                        role="court"
                        selected={Number(court.id) === form.court}
                        onClick={() => updateForm({ court: Number(court.id) })}
                        key={String(court.id)}
                      />
                    ))
                  : null}
              </div>
              <p
                className="form-hint"
                data-create-courts-status=""
                role="status"
                aria-live="polite"
                hidden={courtsAvailable}
              >
                {courtStatus}
              </p>
            </div>
            <div data-candidate-court-fields="" hidden={!isCandidate}>
              <p className="create-v2__hint" data-candidate-selection-hint="">
                還沒訂到場？先列 2–3 個候選，之後再定案（已選 <span className="create-v2__mono">{candidateCount}</span>
                /3）
              </p>
              <div
                className="create-v2__court-grid qm-scroll"
                data-testid="session-candidate-courts"
                role="group"
                aria-label="候選球場（最多 3 座）"
              >
                {courtsAvailable
                  ? availableCourts.map((court) => (
                      <CourtCell
                        court={court}
                        role="cand-court"
                        selected={Boolean(form.candCourts[String(court.id)])}
                        onClick={() => chooseCandidateCourt(court)}
                        key={String(court.id)}
                      />
                    ))
                  : null}
              </div>
              <p
                className="form-hint"
                data-create-candidate-courts-status=""
                role="status"
                aria-live="polite"
                hidden={courtsAvailable}
              >
                {courtStatus}
              </p>
            </div>
          </section>

          <section className="create-v2__card">
            <p className="create-v2__label">日期</p>
            <div className="create-v2__chip-row" role="group" aria-label="日期">
              {config.dateChips.map((chip) => (
                <button
                  type="button"
                  className={selectedClass("chip chip--form", form.dateKey === chip.key)}
                  data-role="date"
                  data-value={chip.key}
                  data-testid={`create-date-${chip.key}`}
                  onClick={() => chooseDate(chip.key)}
                  key={chip.key}
                >
                  {chip.label}
                </button>
              ))}
              <button
                type="button"
                className={selectedClass("chip chip--form", form.dateKey === "custom")}
                data-role="date"
                data-value="custom"
                data-testid="create-date-custom"
                onClick={() => chooseDate("custom")}
              >
                自訂
              </button>
            </div>
            <p
              className="create-v2__custom-date"
              data-custom-date-field=""
              hidden={form.dateKey !== "custom"}
              ref={customDateFieldRef}
            >
              <input
                type="date"
                data-testid="create-date-custom-input"
                aria-label="自訂日期"
                value={form.customDate}
                onChange={(event) =>
                  updateForm({ customDate: event.currentTarget.value, dateKey: "custom", nowStart: false })
                }
              />
            </p>

            <div data-candidate-slot-fields="" hidden={!isCandidate}>
              <p className="create-v2__label create-v2__label--mt">時段範圍</p>
              <div className="create-v2__chip-row" role="group" aria-label="時段範圍">
                {config.slotOptions.map((option) => (
                  <button
                    type="button"
                    className={selectedClass("chip chip--time", form.slot === option.key)}
                    data-role="slot"
                    data-value={option.key}
                    data-testid={`create-slot-${option.key}`}
                    onClick={() => updateForm({ slot: option.key })}
                    key={option.key}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div data-fixed-time-fields="" hidden={isCandidate}>
              <p className="create-v2__label create-v2__label--mt">開始時間</p>
              <div
                className="create-v2__chip-row create-v2__chip-row--scroll qm-scroll"
                role="group"
                aria-label="開始時間"
              >
                <button
                  type="button"
                  className={selectedClass("chip chip--time", form.nowStart)}
                  data-role="time-now"
                  data-testid="session-now-start"
                  onClick={() => {
                    const current = now();
                    updateForm({
                      customDate: "",
                      dateKey: "today",
                      nowStart: true,
                      time: clock(current),
                      timeCustom: false,
                    });
                  }}
                >
                  現在開打
                </button>
                {config.timePresets.map((time) => (
                  <button
                    type="button"
                    className={selectedClass(
                      "chip chip--time",
                      form.time === time && !form.timeCustom && !form.nowStart
                    )}
                    data-role="time"
                    data-value={time}
                    data-testid={`create-time-${time}`}
                    onClick={() => updateForm({ nowStart: false, time, timeCustom: false })}
                    key={time}
                  >
                    {time}
                  </button>
                ))}
                <button
                  type="button"
                  className={selectedClass("chip chip--time", form.timeCustom)}
                  data-role="time-custom"
                  data-testid="create-time-custom"
                  onClick={() =>
                    updateForm({
                      nowStart: false,
                      time: form.timeCustom ? form.time || config.timeCustomDefault : config.timeCustomDefault,
                      timeCustom: true,
                    })
                  }
                >
                  自訂
                </button>
              </div>
              <div className="create-v2__stepper" data-time-stepper="" hidden={!form.timeCustom}>
                <p className="create-v2__stepper-label">自訂開始（每 15 分）</p>
                <button
                  type="button"
                  className="create-v2__stepper-btn"
                  data-role="time-step"
                  data-value="-15"
                  data-testid="create-time-minus"
                  aria-label="開始時間往前 15 分"
                  onClick={() => updateForm({ nowStart: false, time: bumpTime(form.time, -15) })}
                >
                  −
                </button>
                <output className="create-v2__stepper-value" data-testid="create-time-value">
                  {form.time || config.timeCustomDefault}
                </output>
                <button
                  type="button"
                  className="create-v2__stepper-btn"
                  data-role="time-step"
                  data-value="15"
                  data-testid="create-time-plus"
                  aria-label="開始時間往後 15 分"
                  onClick={() => updateForm({ nowStart: false, time: bumpTime(form.time, 15) })}
                >
                  ＋
                </button>
              </div>
            </div>
            <input
              type="hidden"
              name="startAtLocal"
              data-testid="session-start-at"
              value={startAtValue}
              onChange={() => undefined}
            />
          </section>

          <section className="create-v2__card">
            <p className="create-v2__label">打法</p>
            <div className="create-v2__chip-row" role="group" aria-label="打法">
              {config.playTypes.map((type) => (
                <button
                  type="button"
                  className={selectedClass("chip chip--form", form.type === type)}
                  data-role="play-type"
                  data-value={type}
                  data-testid={`create-play-type-${type}`}
                  onClick={() => choosePlayType(type)}
                  key={type}
                >
                  {type}
                </button>
              ))}
            </div>
            <p className="form-hint">{config.playTypeHint}</p>
            <p className="create-v2__label create-v2__label--mt">找的程度</p>
            <div className="create-v2__chip-row" role="group" aria-label="找的程度">
              {config.bands.map((band) => (
                <button
                  type="button"
                  className={selectedClass("chip chip--time", form.band === band.key)}
                  data-role="band"
                  data-value={band.key}
                  data-testid={`create-band-${band.key}`}
                  onClick={() => updateForm({ band: band.key })}
                  key={band.key}
                >
                  {band.label}
                </button>
              ))}
            </div>
            <p className="form-hint" data-ntrp-explanation="">
              {config.ntrpExplanation}
            </p>
          </section>

          <section className="create-v2__card">
            <div className="create-v2__stepper-row">
              <p className="create-v2__stepper-title">缺幾位</p>
              <button
                type="button"
                className="create-v2__stepper-btn"
                data-role="need-step"
                data-value="-1"
                data-testid="create-need-minus"
                aria-label="缺額減少一位"
                onClick={() => updateForm({ need: Math.max(1, Math.min(3, form.need - 1)) })}
              >
                −
              </button>
              <output className="create-v2__stepper-value create-v2__stepper-value--lg" data-testid="create-need-value">
                {form.need}
              </output>
              <button
                type="button"
                className="create-v2__stepper-btn"
                data-role="need-step"
                data-value="1"
                data-testid="create-need-plus"
                aria-label="缺額增加一位"
                onClick={() => updateForm({ need: Math.max(1, Math.min(3, form.need + 1)) })}
              >
                ＋
              </button>
            </div>
            <p className="form-hint">不含你自己。</p>
            <input
              type="hidden"
              name="slotsTotal"
              data-testid="session-slots-value"
              value={String(form.need)}
              onChange={() => undefined}
            />

            <div className="create-v2__toggle-row">
              <div className="create-v2__toggle-copy">
                <p className="create-v2__toggle-title">直接加入</p>
                <p className="create-v2__toggle-sub">
                  選擇直接加入後，已填暱稱且 NTRP 符合球局範圍的球友會直接加入；未填 NTRP
                  或超出範圍者會改為申請，由你審核。加入後可在球局群組聊天協調。
                </p>
              </div>
              <button
                type="button"
                className="toggle-switch"
                role="switch"
                data-role="instant-toggle"
                data-testid="create-instant-toggle"
                aria-checked={form.instant}
                aria-label={`直接加入：${form.instant ? "已開啟" : "已關閉"}`}
                onClick={() => updateForm({ instant: !form.instant })}
              />
            </div>

            <div className="create-v2__toggle-row" data-booked-toggle-field="" hidden={isCandidate}>
              <div className="create-v2__toggle-copy">
                <p className="create-v2__toggle-title">已訂場</p>
                <p className="create-v2__toggle-sub">已預訂場地，費用到場均分。</p>
              </div>
              <button
                type="button"
                className="toggle-switch"
                role="switch"
                data-role="booked-toggle"
                data-testid="session-venue-booked"
                aria-checked={form.booked}
                aria-label={`已訂場：${form.booked ? "已開啟" : "已關閉"}`}
                onClick={() => updateForm({ booked: !form.booked })}
              />
            </div>
            <p className="create-v2__hint" data-candidate-booked-alt="" hidden={!isCandidate}>
              候選模式先不填訂場 — 定案球場後再補訂場資訊，成員會收到通知。
            </p>
          </section>

          <section className="create-v2__card">
            <label className="create-v2__label" htmlFor="session-fee-note">
              費用說明（選填，最多 500 字）
            </label>
            <textarea
              id="session-fee-note"
              className="create-v2__textarea"
              data-testid="session-fee-note"
              maxLength={500}
              rows={2}
              defaultValue=""
              ref={feeNoteRef}
            />
            <label className="create-v2__label create-v2__label--mt" htmlFor="session-notes">
              備註（選填，最多 500 字）
            </label>
            <textarea
              id="session-notes"
              className="create-v2__textarea"
              data-testid="session-notes"
              maxLength={500}
              rows={4}
              placeholder="球風、注意事項、集合方式…"
              defaultValue=""
              ref={notesRef}
            />
          </section>

          <div className="create-v2__footer" data-create-footer="" hidden={stage !== "form"}>
            <p className="form-disclosure">{config.profileDisclosure}</p>
            <p className="form-error" data-create-error="" role="alert" hidden ref={errorRef} />
            <button
              type="submit"
              className={`create-v2__publish${ready ? " is-ready" : ""}`}
              data-testid="session-submit"
              ref={submitRef}
            >
              {publishLabel}
            </button>
          </div>
        </form>

        <div className="create-v2__done" data-create-done="" hidden={stage !== "done"}>
          <div className="create-v2__done-badge" aria-hidden="true">
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h3 className="create-v2__done-title" tabIndex={-1} data-testid="create-done-title" ref={doneTitleRef}>
            球局已發布！
          </h3>
          <p className="create-v2__done-copy">
            已出現在地圖上，
            <br />
            有人報名時會通知你。
          </p>
          <div className="create-v2__done-card" data-testid="create-done-card">
            <div className="time-tile time-tile--done">
              <span className="time-tile__start" data-done-time="">
                {done.time}
              </span>
              <span className="time-tile__date" data-done-date="">
                {done.date}
              </span>
            </div>
            <div className="create-v2__done-card-copy">
              <p className="create-v2__done-court" data-done-court="">
                {done.court}
              </p>
              <p className="create-v2__done-meta" data-done-meta="">
                {done.meta}
              </p>
            </div>
            <span className="slots-brick" data-done-need="">
              {done.need}
            </span>
          </div>
          <button
            type="button"
            className="session-primary create-v2__done-primary"
            data-testid="create-done-view-my-sessions"
            onClick={() => onViewMySessions(done.sessionId)}
            key="create-done-view"
          >
            查看我的球局
          </button>
          <button
            type="button"
            className="create-v2__done-secondary"
            data-testid="create-done-back-to-map"
            onClick={onBackToMap}
            key="create-done-map"
          >
            回到地圖
          </button>
        </div>
      </div>
    </>
  );
}

const CreateSessionSheetWithRef = forwardRef<CreateSessionContentContract, CreateSessionContentOptions>(
  function CreateSessionSheetWithRef(props, ref) {
    return <CreateSessionSheet {...props} contentRef={ref} />;
  }
);

/** Mount React into mountSheet's surface contents and expose synchronous state pushes. */
export function mountCreateSessionSheetContent(
  rootElement: HTMLElement,
  options: CreateSessionContentOptions
): CreateSessionContentContract & SurfaceContentLifecycle {
  const surfaceContent = mountSurfaceContent(rootElement);
  const contentRef = createRef<CreateSessionContentContract>();
  let boundaryFailed = false;
  surfaceContent.render(
    <AppErrorBoundary
      rootElement={rootElement}
      surface="create-session-sheet"
      onError={() => {
        boundaryFailed = true;
      }}
    >
      <CreateSessionSheetWithRef {...options} ref={contentRef} />
    </AppErrorBoundary>
  );
  if (!contentRef.current && !boundaryFailed) throw new Error("CreateSessionSheet content did not mount.");

  return {
    isSurfaceRootLive: surfaceContent.isSurfaceRootLive,
    setCourts(courts, options) {
      surfaceContent.commit(() => contentRef.current?.setCourts(courts, options));
    },
    showDone(value, result) {
      surfaceContent.commit(() => contentRef.current?.showDone(value, result));
    },
    unmount: surfaceContent.unmount,
  };
}
