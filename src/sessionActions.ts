import { canReceiveFocus } from "./meFocus.js";
import { sessionActionMessage } from "./sessionActionMessages.ts";

// DOM-backed async state is intentionally separate from pure presentation. Both
// sessionViews.js and React runtime facades consume this one shared action owner.

type ActionControl = HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

interface MySessionActionDescriptor {
  action: string;
  participantId: string;
  profileId: string;
  sessionId: string;
}

interface MySessionActionState {
  pending: Map<string, MySessionActionDescriptor>;
  scopeKey: unknown;
}

interface AsyncActionContext<Result> {
  cause: unknown;
  completed: boolean;
  controlsRestored: boolean;
  error: HTMLElement | null;
  rerendered: boolean;
  result: Result | undefined;
}

interface AsyncActionFocus<Result, FocusIntent> {
  capture(active: HTMLElement): FocusIntent | null;
  restore?(focusIntent: FocusIntent, context: AsyncActionContext<Result>): void;
  shouldRestore?(context: AsyncActionContext<Result>): boolean | undefined;
}

interface RunAsyncActionOptions<Result, ErrorResult, FocusIntent> {
  root: HTMLElement;
  callback: () => Result | PromiseLike<Result>;
  controls?: Array<ActionControl | null | undefined>;
  watchNodes?: Array<Node | null | undefined>;
  error?: HTMLElement | null;
  clearError?: boolean;
  clearErrorText?: boolean;
  errorMessage?: string;
  errorFocus?: boolean;
  errorResult?: ErrorResult | ((error: unknown) => ErrorResult);
  current?: () => boolean;
  onSuccess?: (result: Result, context: AsyncActionContext<Result>) => void | PromiseLike<void>;
  onSuccessAfterRerender?: boolean;
  onError?: (error: unknown, context: AsyncActionContext<Result>) => void | PromiseLike<void>;
  onErrorAfterRerender?: boolean;
  onFinally?: (context: AsyncActionContext<Result>) => void | PromiseLike<void>;
  onFinallyAfterRerender?: boolean;
  canRestoreControls?: (context: AsyncActionContext<Result>) => boolean;
  resolveControls?: (context: AsyncActionContext<Result>) => Array<ActionControl | null | undefined>;
  restoreAfterRerender?: boolean;
  focus?: AsyncActionFocus<Result, FocusIntent>;
}

interface NotificationControlDescriptor {
  courtId?: string;
  preference?: string;
  selector: string;
}

const mySessionActionStates = new WeakMap<HTMLElement, MySessionActionState>();

const MY_SESSION_LIFECYCLE_ACTIONS = new Set([
  "accept",
  "accept-invite",
  "attendance",
  "cancel",
  "decline",
  "decline-invite",
  "played",
  "refresh",
  "toggle-visibility",
  "withdraw",
]);

function actionDescriptor(button: HTMLButtonElement): MySessionActionDescriptor {
  return {
    action: button.dataset.myAction ?? (button.id === "my-sessions-refresh" ? "refresh" : ""),
    participantId: button.dataset.participantId ?? "",
    profileId: button.dataset.profileId ?? "",
    sessionId: button.dataset.sessionId ?? "",
  };
}

function actionDescriptorKey(descriptor: MySessionActionDescriptor): string {
  return JSON.stringify([descriptor.action, descriptor.sessionId, descriptor.participantId, descriptor.profileId]);
}

function pendingMySessionActionState(root: HTMLElement): MySessionActionState {
  let state = mySessionActionStates.get(root);
  if (!state) {
    state = { pending: new Map(), scopeKey: null };
    mySessionActionStates.set(root, state);
  }
  return state;
}

function pendingMySessionActions(root: HTMLElement): Map<string, MySessionActionDescriptor> {
  return pendingMySessionActionState(root).pending;
}

export function setMySessionActionScope(root: HTMLElement, scopeKey: unknown): void {
  const state = pendingMySessionActionState(root);
  if (state.scopeKey === scopeKey) return;
  // A render for another account/profile epoch must not inherit a stale
  // promise's disabled button or error surface from the previous account.
  mySessionActionStates.set(root, { pending: new Map(), scopeKey });
}

function sameActionDescriptor(left: MySessionActionDescriptor | undefined, right: MySessionActionDescriptor): boolean {
  return (
    left?.action === right?.action &&
    left?.sessionId === right?.sessionId &&
    left?.participantId === right?.participantId &&
    left?.profileId === right?.profileId
  );
}

function currentMySessionActionButton(
  root: HTMLElement,
  descriptor: MySessionActionDescriptor
): HTMLButtonElement | null | undefined {
  if (descriptor.action === "refresh") return root.querySelector<HTMLButtonElement>("#my-sessions-refresh");
  return [...root.querySelectorAll<HTMLButtonElement>("[data-my-action]")].find((button) =>
    sameActionDescriptor(actionDescriptor(button), descriptor)
  );
}

export function syncPendingMySessionActions(root: HTMLElement): void {
  for (const descriptor of pendingMySessionActions(root).values()) {
    const button = currentMySessionActionButton(root, descriptor);
    if (button) button.disabled = true;
  }
}

function showMySessionActionError(root: HTMLElement, message: string): void {
  const error = root.querySelector<HTMLElement>("[data-my-sessions-error]");
  if (!error) return;
  error.textContent = message;
  error.hidden = false;
}

function focusMySessionActionResult(
  root: HTMLElement,
  descriptor: MySessionActionDescriptor,
  { failed = false }: { failed?: boolean } = {}
): void {
  if (failed && ["accept-invite", "decline-invite"].includes(descriptor.action)) {
    const error = root.querySelector<HTMLElement>("[data-my-sessions-error]");
    if (error && !error.hidden) {
      error.focus({ preventScroll: true });
      return;
    }
  }
  const currentButton = currentMySessionActionButton(root, descriptor);
  if (currentButton && !currentButton.disabled) {
    currentButton.focus({ preventScroll: true });
    return;
  }
  if (failed) {
    const error = root.querySelector<HTMLElement>("[data-my-sessions-error]");
    if (error && !error.hidden) {
      error.focus({ preventScroll: true });
      return;
    }
  }
  const nextAction = root.querySelector<HTMLButtonElement>("#my-needs-action [data-my-action]:not([disabled])");
  if (nextAction) {
    nextAction.focus({ preventScroll: true });
    return;
  }
  const sessionCard = [...root.querySelectorAll<HTMLButtonElement>("[data-open-my-session]")].find(
    (button) => String(button.dataset.sessionId) === String(descriptor.sessionId)
  );
  if (sessionCard) {
    sessionCard.focus({ preventScroll: true });
    return;
  }
  root.querySelector<HTMLButtonElement>("#my-sessions-refresh")?.focus({ preventScroll: true });
}

export async function runAsyncAction<Result, ErrorResult = undefined, FocusIntent = unknown>({
  root,
  callback,
  controls = [],
  watchNodes = [],
  error = null,
  clearError = true,
  clearErrorText = false,
  errorMessage = "操作暫時無法完成，請稍後再試。",
  errorFocus = false,
  errorResult,
  current = () => true,
  onSuccess,
  onSuccessAfterRerender = false,
  onError,
  onErrorAfterRerender = false,
  onFinally,
  onFinallyAfterRerender = false,
  canRestoreControls = () => true,
  resolveControls,
  restoreAfterRerender = false,
  focus,
}: RunAsyncActionOptions<Result, ErrorResult, FocusIntent>): Promise<Result | ErrorResult | undefined> {
  const unlockedControls = controls.filter((control) => control && !control.disabled) as ActionControl[];
  const watchedNodes = [...new Set([...unlockedControls, ...watchNodes.filter(Boolean)])] as Node[];
  const active = document.activeElement;
  const belongsToRoot = (node: Node) => root.contains(node);
  const focusIntent =
    focus?.capture && active instanceof HTMLElement && belongsToRoot(active) ? focus.capture(active) : null;
  const rerendered = () => watchedNodes.some((node) => !belongsToRoot(node));

  unlockedControls.forEach((control) => {
    control.disabled = true;
  });
  if (clearError && error) {
    error.hidden = true;
    if (clearErrorText) error.textContent = "";
  }

  let result: Result | undefined;
  let cause: unknown;
  let completed = false;
  try {
    result = await callback();
    const context = { cause, completed, error, result, rerendered: rerendered(), controlsRestored: false };
    if (current() && (!context.rerendered || onSuccessAfterRerender)) await onSuccess?.(result, context);
    completed = true;
    return result;
  } catch (actionError) {
    cause = actionError;
    const context = { cause, completed, error, result, rerendered: rerendered(), controlsRestored: false };
    if (current() && (!context.rerendered || onErrorAfterRerender)) {
      if (onError) {
        await onError(actionError, context);
      } else if (error) {
        error.textContent = sessionActionMessage(actionError, errorMessage);
        error.hidden = false;
        if (errorFocus) error.focus({ preventScroll: true });
      }
    }
    return typeof errorResult === "function"
      ? (errorResult as (error: unknown) => ErrorResult)(actionError)
      : errorResult;
  } finally {
    const isCurrent = current();
    const context = { cause, completed, error, result, rerendered: rerendered(), controlsRestored: false };
    if (isCurrent && (!context.rerendered || restoreAfterRerender) && canRestoreControls(context)) {
      const controlsToRestore = resolveControls?.(context) ?? unlockedControls;
      controlsToRestore.filter(Boolean).forEach((control) => {
        control!.disabled = false;
      });
      context.controlsRestored = true;
    }
    if (isCurrent && (!context.rerendered || onFinallyAfterRerender)) await onFinally?.(context);
    if (isCurrent && focusIntent != null && (focus!.shouldRestore?.(context) ?? true)) {
      focus!.restore?.(focusIntent, context);
    }
  }
}

export function runMySessionAction(
  button: HTMLButtonElement,
  callback: (() => unknown) | null | undefined,
  root: HTMLElement
): void {
  if (!callback || button.disabled) return;
  const descriptor = actionDescriptor(button);
  const descriptorKey = actionDescriptorKey(descriptor);
  const pending = pendingMySessionActions(root);
  const opensConfirmation = descriptor.action === "withdraw";
  if (!opensConfirmation) pending.set(descriptorKey, descriptor);
  let restoreActionFocus = false;
  void runAsyncAction({
    root,
    callback,
    controls: opensConfirmation ? [] : [button],
    error: root.querySelector<HTMLElement>("[data-my-sessions-error]"),
    clearError: !opensConfirmation,
    current: () => pendingMySessionActions(root) === pending,
    onError: (actionError) => {
      showMySessionActionError(root, sessionActionMessage(actionError, "操作暫時無法完成，請稍後再試。"));
      // reloadParticipation can replace the original button before an error
      // arrives. Resolve the semantic action again in the current DOM so the
      // keyboard user stays in the same operational context.
      restoreActionFocus = !opensConfirmation;
    },
    onErrorAfterRerender: true,
    resolveControls: () => (opensConfirmation ? [] : [currentMySessionActionButton(root, descriptor)]),
    restoreAfterRerender: true,
    onFinally: () => {
      if (!opensConfirmation) pending.delete(descriptorKey);
      if (!opensConfirmation && MY_SESSION_LIFECYCLE_ACTIONS.has(descriptor.action)) {
        focusMySessionActionResult(root, descriptor, { failed: restoreActionFocus });
      }
    },
    onFinallyAfterRerender: true,
  });
}

function notificationControlDescriptor(control: HTMLElement): NotificationControlDescriptor | null {
  if (!(control instanceof HTMLElement)) return null;
  if (control.matches("[data-enable-push]")) return { selector: "[data-enable-push]" };
  if (control.matches("[data-subscribe-all-courts]")) return { selector: "[data-subscribe-all-courts]" };
  if (control.matches("[data-court-picker-toggle]")) return { selector: "[data-court-picker-toggle]" };
  if (control.matches("[data-notification-court]")) {
    return { courtId: (control as ActionControl).value, selector: "[data-notification-court]" };
  }
  if (control.matches("[data-notification-pref]")) {
    return { preference: control.dataset.notificationPref, selector: "[data-notification-pref]" };
  }
  return null;
}

function findNotificationControl(
  root: HTMLElement,
  descriptor: NotificationControlDescriptor | null
): ActionControl | null {
  if (!descriptor) return null;
  if (descriptor.courtId != null) {
    return (
      [...root.querySelectorAll<ActionControl>(descriptor.selector)].find(
        (control) => String(control.value) === String(descriptor.courtId)
      ) ?? null
    );
  }
  if (descriptor.preference == null) return root.querySelector<ActionControl>(descriptor.selector);
  return (
    [...root.querySelectorAll<ActionControl>(descriptor.selector)].find(
      (control) => control.dataset.notificationPref === descriptor.preference
    ) ?? null
  );
}

export async function runNotificationSettingAction(
  root: HTMLElement,
  callback: () => unknown
): Promise<boolean | undefined> {
  const controls = [...root.querySelectorAll<ActionControl>("[data-notification-control]")];
  const unlockedDescriptors = controls.filter((control) => !control.disabled).map(notificationControlDescriptor);
  const error = root.querySelector<HTMLElement>("[data-notification-error]");
  return runAsyncAction({
    root,
    callback: async () => {
      await callback();
      return true;
    },
    controls,
    error,
    clearErrorText: true,
    errorMessage: "通知設定暫時無法更新，請稍後再試。",
    errorFocus: true,
    errorResult: false,
    resolveControls: () =>
      unlockedDescriptors.map((descriptor) => {
        const control = findNotificationControl(root, descriptor);
        return control?.dataset.notificationAuthoritativeDisabled === "true" ? null : control;
      }),
    focus: {
      capture: notificationControlDescriptor,
      shouldRestore: ({ completed }) => completed,
      restore: (focusedDescriptor) => {
        const current = document.activeElement;
        // 只接手被 disable 踢成無主的焦點；使用者自己移走的焦點不搶回來。
        const focusIsLoose = !(current instanceof HTMLElement) || current === document.body;
        const target = focusIsLoose ? findNotificationControl(root, focusedDescriptor) : null;
        if (canReceiveFocus(target)) target!.focus({ preventScroll: true });
        else if (focusIsLoose) {
          // 勾到最後一座球場會讓清單自動收合，原目標隨即隱形；退回展開鈕才不會掉到 body。
          const toggle = root.querySelector<ActionControl>("[data-court-picker-toggle]");
          if (canReceiveFocus(toggle)) toggle!.focus({ preventScroll: true });
        }
      },
    },
  });
}

function presenceControlSelector(control: HTMLElement): string | null {
  if (!(control instanceof HTMLElement)) return null;
  if (control.matches("[data-set-presence-sharing]")) return "[data-set-presence-sharing]";
  if (control.matches("[data-open-to-greeting]")) return "[data-open-to-greeting]";
  return null;
}

export async function runPresenceSettingAction(
  root: HTMLElement,
  callback: () => unknown
): Promise<boolean | undefined> {
  const controls = [...root.querySelectorAll<ActionControl>("[data-presence-control]")];
  const unlockedSelectors = controls.filter((control) => !control.disabled).map(presenceControlSelector);
  const error = root.querySelector<HTMLElement>("[data-presence-error]");
  return runAsyncAction({
    root,
    callback: async () => (await callback()) !== false,
    controls,
    error,
    clearErrorText: true,
    errorMessage: "在線設定暫時無法更新，請稍後再試。",
    errorResult: false,
    resolveControls: () => unlockedSelectors.map((selector) => root.querySelector<ActionControl>(selector!)),
    focus: {
      capture: presenceControlSelector,
      // 回呼回 false 代表被 gate 攔截並開了補件 sheet，焦點歸該 sheet 管；
      // 失敗則留在原控制項，接不住時才退到 role=alert。
      shouldRestore: ({ completed, result }) => !completed || result,
      restore: (focusedSelector) => {
        const current = document.activeElement;
        // 只接手被 disable 踢成無主的焦點；使用者自己移走的焦點不搶回來。
        const focusIsLoose = !(current instanceof HTMLElement) || current === document.body;
        const target = focusIsLoose ? root.querySelector<ActionControl>(focusedSelector) : null;
        if (canReceiveFocus(target)) target!.focus({ preventScroll: true });
        else if (focusIsLoose && error && !error.hidden && canReceiveFocus(error)) {
          // 控制項接不住(被收合、被移除)時才退到錯誤訊息,不讓焦點留在 body。
          error.focus({ preventScroll: true });
        }
      },
    },
  });
}
