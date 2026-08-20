import { createRef, forwardRef, useImperativeHandle, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { Avatar } from "../components/Avatar.tsx";
import type { CourtSummary } from "../domainTypes.ts";
import { profileCompletionSheetRuntime } from "../sessionViews.js";

export interface ProfileCompletionCourt extends CourtSummary {
  city?: string;
  district?: string;
}

interface ProfileCourtOption {
  checked: boolean;
  id: string;
  label: string;
}

interface ProfileCourtOptionsPresentation {
  options: ProfileCourtOption[];
  statusHidden: boolean;
  statusText: string;
}

/**
 * Every profile gate/validation rule stays in sessionViews.js: this content only
 * renders what the frozen runtime decided. `selectedCourtCheckboxValues` is the
 * one judgment reached back into, so the "keep the live draft" rule has a single
 * source shared with the legacy form.
 */
interface ProfileCompletionRuntime {
  profileCourtOptionsPresentation(
    courts: ProfileCompletionCourt[],
    options: { ready?: boolean; selected?: Set<string> }
  ): ProfileCourtOptionsPresentation;
  selectedCourtCheckboxValues(container: Element | null | undefined, fallback: Set<string>): Set<string>;
}

export interface ProfileCompletionActionNodes {
  error: HTMLElement;
  form: HTMLFormElement;
  submit: HTMLButtonElement;
}

export interface ProfileCompletionContentContract {
  setCourts(courts: ProfileCompletionCourt[], options?: { ready?: boolean }): void;
}

interface ProfileCompletionContentOptions {
  avatarUrl: string;
  compactCreateGate: boolean;
  courts: ProfileCompletionCourt[];
  courtsReady: boolean;
  disclosure: string;
  gateHintText: string;
  initialSelectedCourts: Set<string>;
  nickname: string;
  ntrpDefaultValue: string;
  ntrpExplanation: string;
  onClose(): void;
  onSubmit(nodes: ProfileCompletionActionNodes): void | Promise<void>;
  playTypes: string[];
  returnContextText: string;
  selectedSlots: Set<string>;
  selectedTypes: Set<string>;
  showNicknameField: boolean;
  showNtrpField: boolean;
  slotOptions: Array<[string, string]>;
  standalone: boolean;
}

interface ProfileCompletionSheetProps extends ProfileCompletionContentOptions {
  contentRef: React.Ref<ProfileCompletionContentContract>;
}

function runtime(): ProfileCompletionRuntime {
  return profileCompletionSheetRuntime;
}

function ProfileCompletionSheet({
  avatarUrl,
  compactCreateGate,
  contentRef,
  courts: initialCourts,
  courtsReady: initialCourtsReady,
  disclosure,
  gateHintText,
  initialSelectedCourts,
  nickname,
  ntrpDefaultValue,
  ntrpExplanation,
  onClose,
  onSubmit,
  playTypes,
  returnContextText,
  selectedSlots,
  selectedTypes,
  showNicknameField,
  showNtrpField,
  slotOptions,
  standalone,
}: ProfileCompletionSheetProps) {
  const [courts, setCourts] = useState(initialCourts);
  const [courtsReady, setCourtsReady] = useState(Boolean(initialCourtsReady));
  const [selectedCourts, setSelectedCourts] = useState(() => new Set(initialSelectedCourts));
  // The legacy picker replaced the whole container with innerHTML, so every
  // refresh dropped the DOM checked state of even the surviving courts. Folding
  // the refresh generation into the key recreates the same nodes instead of
  // letting React keep a stale check alive.
  const [generation, setGeneration] = useState(0);
  const courtsContainerRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useImperativeHandle(
    contentRef,
    () => ({
      setCourts(nextCourts, { ready = true } = {}) {
        // Legacy parity: without the compact-gate picker there is no container,
        // and updateCourtCheckboxes returned before touching anything.
        if (compactCreateGate) return;
        setSelectedCourts(runtime().selectedCourtCheckboxValues(courtsContainerRef.current, initialSelectedCourts));
        setCourts(nextCourts);
        setCourtsReady(Boolean(ready));
        setGeneration((value) => value + 1);
      },
    }),
    [compactCreateGate, initialSelectedCourts]
  );

  const submitForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!errorRef.current || !formRef.current || !submitRef.current) return;
    void onSubmit({ error: errorRef.current, form: formRef.current, submit: submitRef.current });
  };

  const courtOptions = compactCreateGate
    ? null
    : runtime().profileCourtOptionsPresentation(courts, { ready: courtsReady, selected: selectedCourts });

  return (
    <>
      <div className="surface__head">
        <div>
          <p className="surface__eyebrow">{standalone ? "個人檔案" : "完成後即可繼續"}</p>
          <h2>{standalone ? "編輯個人檔案" : "完成個人檔案"}</h2>
        </div>
        <button
          type="button"
          className="surface__close"
          data-surface-close=""
          aria-label="關閉個人檔案"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {returnContextText ? <p className="profile-return-context">{returnContextText}</p> : null}
      {gateHintText ? <p className="form-hint">{gateHintText}</p> : null}
      <div className="profile-avatar-preview" data-profile-avatar="">
        <Avatar avatarUrl={avatarUrl} nickname={nickname} />
        <p>使用 Google 頭像，無法自訂</p>
      </div>
      <form className="profile-form" data-testid="profile-form" noValidate onSubmit={submitForm} ref={formRef}>
        {showNicknameField ? (
          <label className="form-field" htmlFor="profile-nickname">
            <span>公開暱稱</span>
            <input
              id="profile-nickname"
              name="profile-nickname"
              required
              defaultValue={nickname}
              autoComplete="nickname"
            />
          </label>
        ) : null}
        <p className="form-disclosure">{disclosure}</p>
        {showNtrpField ? (
          <>
            <label className="form-field" htmlFor="profile-ntrp">
              <span>{compactCreateGate ? "NTRP 程度" : "NTRP 程度（選填）"}</span>
              <input
                id="profile-ntrp"
                name="profile-ntrp"
                type="number"
                min="1"
                max="7"
                step="0.1"
                defaultValue={ntrpDefaultValue}
                inputMode="decimal"
                placeholder="尚未填寫"
              />
            </label>
            <p className="form-hint" data-ntrp-explanation="">
              {ntrpExplanation}
            </p>
          </>
        ) : null}
        {courtOptions ? (
          <>
            <fieldset className="form-fieldset">
              <legend>常打球場</legend>
              <div
                className="option-grid option-grid--stacked"
                data-profile-courts=""
                data-testid="profile-courts-picker"
                ref={courtsContainerRef}
              >
                {courtOptions.options.map((option) => (
                  <label key={`${generation}:${option.id}`}>
                    <input
                      type="checkbox"
                      name="profile-courts"
                      defaultValue={option.id}
                      data-testid={`profile-court-${option.id}`}
                      defaultChecked={option.checked}
                    />{" "}
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <p
                className="form-hint"
                data-profile-courts-status=""
                role="status"
                aria-live="polite"
                hidden={courtOptions.statusHidden}
              >
                {courtOptions.statusText}
              </p>
            </fieldset>
            <fieldset className="form-fieldset">
              <legend>常打類型</legend>
              <div className="option-grid">
                {playTypes.map((type) => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      name="profile-types"
                      defaultValue={type}
                      defaultChecked={selectedTypes.has(type)}
                    />
                    {` ${type}`}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="form-fieldset">
              <legend>可打時段</legend>
              <div className="option-grid">
                {slotOptions.map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      name="profile-slots"
                      defaultValue={value}
                      defaultChecked={selectedSlots.has(value)}
                    />
                    {` ${label}`}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        ) : null}
        <p className="form-error" data-profile-error="" role="alert" hidden ref={errorRef} />
        <button type="submit" className="session-primary" data-testid="profile-save" ref={submitRef}>
          {standalone ? "儲存" : "儲存並繼續"}
        </button>
      </form>
    </>
  );
}

const ProfileCompletionSheetWithRef = forwardRef<ProfileCompletionContentContract, ProfileCompletionContentOptions>(
  function ProfileCompletionSheetWithRef(props, ref) {
    return <ProfileCompletionSheet {...props} contentRef={ref} />;
  }
);

/** Mount React into mountSheet's surface contents and expose synchronous court updates. */
export function mountProfileCompletionSheetContent(
  rootElement: HTMLElement,
  options: ProfileCompletionContentOptions
): ProfileCompletionContentContract {
  const reactRoot = createRoot(rootElement);
  const contentRef = createRef<ProfileCompletionContentContract>();
  flushSync(() => reactRoot.render(<ProfileCompletionSheetWithRef {...options} ref={contentRef} />));
  if (!contentRef.current) throw new Error("ProfileCompletionSheet content did not mount.");

  return {
    setCourts(courts, courtsOptions) {
      flushSync(() => contentRef.current?.setCourts(courts, courtsOptions));
    },
  };
}
