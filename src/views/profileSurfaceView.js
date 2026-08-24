import { validProfileNtrp } from "../profile.js";
import { mountSheet } from "../sheets.js";
import { runAsyncAction } from "../sessionActions.ts";
import { PROFILE_SLOTS } from "../sessionPresentation.ts";
import { taipeiDateTime } from "../taipeiTime.js";

let deferSurfaceOpen;
let lazyMounts;
let preloadProfileCompletionSheet;
let registerProfileContent;
let ntrpScaleExplanation;
let profilePublicDisclosure;

/** Configure the facade-owned profile mount and surface registration callback. */
export function configureProfileSurfaceView(dependencies) {
  ({
    deferSurfaceOpen,
    lazyMounts,
    ntrpScaleExplanation,
    preloadProfileCompletionSheet,
    profilePublicDisclosure,
    registerProfileContent,
  } = dependencies);
}

// 個人檔案的「常打類型」維持四值：既有使用者已勾選的「對拉」不該因為建局表單收斂而消失。
const PROFILE_PLAY_TYPES = ["單打", "雙打", "對拉", "練球"];

function selectedValues(form, name) {
  return new Set([...form.querySelectorAll(`[name="${name}"]:checked`)].map((input) => input.value));
}

function profileFormValue(form, fallbackProfile = {}, fallbackCourts = new Set()) {
  const courtInputs = form.querySelectorAll("[name='profile-courts']");
  const courts = courtInputs.length ? selectedValues(form, "profile-courts") : new Set(fallbackCourts);
  const nicknameInput = form.querySelector("[name='profile-nickname']");
  const ntrpInput = form.querySelector("[name='profile-ntrp']");
  const ntrpValue = ntrpInput?.value.trim();
  const typeInputs = form.querySelectorAll("[name='profile-types']");
  const slotInputs = form.querySelectorAll("[name='profile-slots']");
  return {
    courts,
    nick: nicknameInput ? nicknameInput.value.trim() : String(fallbackProfile.nick ?? "").trim(),
    ntrp: ntrpInput ? (ntrpValue === "" ? null : Number(ntrpValue)) : (fallbackProfile.ntrp ?? null),
    slots: slotInputs.length ? selectedValues(form, "profile-slots") : new Set(fallbackProfile.slots ?? []),
    types: typeInputs.length ? selectedValues(form, "profile-types") : new Set(fallbackProfile.types ?? []),
  };
}

function profileGateForIntent(intent) {
  if (["create", "players", "presence"].includes(intent?.action)) return "ntrp";
  if (["directory", "visibility"].includes(intent?.action)) return "directory";
  return "nickname";
}

function profileGateHint(gate, intent = null) {
  if (gate === "ntrp" && intent?.action === "presence") {
    return "要調整在線設定，請填寫公開暱稱與 NTRP（1.0–7.0）。";
  }
  if (gate === "ntrp" && intent?.action === "players") {
    return "要查看在線球友，請填寫公開暱稱與 NTRP（1.0–7.0）。";
  }
  if (gate === "ntrp") return "要開球局，請填寫公開暱稱與 NTRP（1.0–7.0）。";
  if (gate === "directory")
    return "要使用球友目錄或公開球友卡，請填寫公開暱稱、NTRP（1.0–7.0），並選擇至少一座台北市常打球場。";
  return "要加入球局，請填寫公開暱稱。";
}

function validateProfileForm(profile, requiredGate, intent = null) {
  if (!profile.nick) return "請填寫公開暱稱。";
  if (profile.ntrp != null && !validProfileNtrp(profile.ntrp)) {
    return "NTRP 請填寫 1.0 到 7.0，或留白。";
  }
  if (profile.ntrp != null && !Number.isInteger(Number(profile.ntrp) * 10)) {
    return "NTRP 最多一位小數，或留白。";
  }
  if (requiredGate === "ntrp" && !validProfileNtrp(profile.ntrp)) return profileGateHint("ntrp", intent);
  if (requiredGate === "directory" && (!validProfileNtrp(profile.ntrp) || !profile.courts.size))
    return profileGateHint("directory");
  return "";
}

/** Open the private profile-completion sheet without leaking profile fields to public renderers. */
export function openProfileCompletionSheet({
  avatarUrl = "",
  courts = [],
  courtsReady = true,
  onClose = () => {},
  onSave = async () => {},
  onSaved = async () => {},
  intent = null,
  mode = "gate",
  profile = {},
  returnSession = null,
} = {}) {
  if (!lazyMounts.profileCompletion) {
    return deferSurfaceOpen({
      id: "profile-completion-sheet",
      label: mode === "standalone" ? "編輯個人檔案" : "完成個人檔案",
      className: "profile-sheet",
      load: preloadProfileCompletionSheet,
      methods: ["setCourts"],
      onClose: (detail = {}) => onClose({ ...detail, saved: false }),
      open: () =>
        openProfileCompletionSheet({
          avatarUrl,
          courts,
          courtsReady,
          intent,
          mode,
          onClose,
          onSave,
          onSaved,
          profile,
          returnSession,
        }),
    });
  }
  // standalone 是「我」頁的常駐編輯入口：同一份表單與驗證，只是不帶 gate 的催促語氣。
  const standalone = mode === "standalone";
  const selectedCourts = profile.courts instanceof Set ? profile.courts : new Set(profile.courts ?? []);
  const selectedTypes = profile.types instanceof Set ? profile.types : new Set(profile.types ?? []);
  const selectedSlots = profile.slots instanceof Set ? profile.slots : new Set(profile.slots ?? []);
  const requiredGate = profileGateForIntent(intent);
  const gateHint = intent ? profileGateHint(requiredGate, intent) : "";
  const compactCreateGate = intent?.action === "create";
  const needsNickname = !String(profile.nick ?? "").trim();
  const needsNtrp = !validProfileNtrp(profile.ntrp);
  let saved = false;
  let saving = false;
  const mounted = mountSheet({
    id: "profile-completion-sheet",
    label: standalone ? "編輯個人檔案" : "完成個人檔案",
    className: "profile-sheet",
    onClose: (detail = {}) => onClose({ ...detail, saved }),
    html: "",
  });

  const content = lazyMounts.profileCompletion(mounted.surface, {
    avatarUrl,
    compactCreateGate,
    courts,
    courtsReady: Boolean(courtsReady),
    disclosure: profilePublicDisclosure,
    gateHintText: gateHint && !standalone ? gateHint : "",
    initialSelectedCourts: selectedCourts,
    nickname: String(profile.nick ?? ""),
    ntrpDefaultValue: String(profile.ntrp ?? ""),
    ntrpExplanation: ntrpScaleExplanation,
    onClose: () => mounted.close(),
    onSubmit: async ({ error, form, submit }) => {
      if (saving) return;
      const nextProfile = profileFormValue(form, profile, selectedCourts);
      const message = validateProfileForm(nextProfile, requiredGate, intent);
      if (message) {
        error.hidden = false;
        error.textContent = message;
        return;
      }
      saving = true;
      await runAsyncAction({
        root: mounted.root,
        callback: async () => {
          const savedProfile = await onSave(nextProfile);
          saved = true;
          mounted.close({ reason: "complete" });
          await onSaved(savedProfile ?? nextProfile);
        },
        controls: [submit],
        error,
        errorMessage: "個人檔案暫時無法儲存。",
        onFinally: ({ controlsRestored }) => {
          if (controlsRestored) saving = false;
        },
      });
    },
    playTypes: PROFILE_PLAY_TYPES,
    returnContextText:
      returnSession && !standalone
        ? `完成後將回到：${returnSession.court}・${taipeiDateTime(returnSession.startAt)}`
        : "",
    selectedSlots,
    selectedTypes,
    showNicknameField: !compactCreateGate || needsNickname,
    showNtrpField: !compactCreateGate || needsNtrp,
    slotOptions: PROFILE_SLOTS,
    standalone,
  });
  registerProfileContent(mounted, content);

  const setCourts = (nextCourts, { ready = true } = {}) => {
    content.setCourts(nextCourts, { ready });
  };

  return { ...mounted, setCourts };
}
