// ============================================================
//  底部卡片(球友/需求 sheet)、球場抽屜、快速聯絡 modal
//  版面與樣式對照設計檔的 PIN SHEETS / CLUSTER DRAWER / INVITE MODAL
// ============================================================
import { districtOf } from "./mockData.js";
import { esc, safeUrl, sourceLabel } from "./util.js";

const sheetRoot = () => document.getElementById("sheet-root");
const modalRoot = () => document.getElementById("modal-root");
const publishButton = () => document.getElementById("publish-request");

export function closeSheet() {
  sheetRoot().innerHTML = "";
}

export function closeModal() {
  modalRoot().innerHTML = "";
  publishButton()?.removeAttribute("hidden");
}

/** 共用:掛 dimmer + 內容,點 dimmer 關閉 */
function mountSheet(html) {
  const root = sheetRoot();
  root.innerHTML = `<div class="sheet-dim" data-close></div>${html}`;
  root.querySelector("[data-close]").addEventListener("click", closeSheet);
}

// ------------------------------------------------------------
// 球友 sheet:暱稱、NTRP、想打類型、固定時段、快速約球
// ------------------------------------------------------------
export function openPlayerSheet(p, { onQuickContact }) {
  mountSheet(`
    <div class="sheet">
      <div class="sheet__handle"></div>
      <div class="psheet__head">
        <div class="avatar" style="width:56px;height:56px;font-size:24px">${esc(p.displayName.slice(0, 1))}</div>
        <div style="flex:1;min-width:0">
          <div class="psheet__nick">${esc(p.displayName)}</div>
          <div class="psheet__sub">${esc(districtOf(p.homeCourt))}・常打 ${esc(p.homeCourt)}</div>
        </div>
        <div class="ntrp-box">
          <span class="ntrp-box__label">NTRP</span>
          <span class="ntrp-box__val">${esc(p.ntrp.toFixed(1))}</span>
        </div>
      </div>
      <div class="psheet__types"><span>${esc(p.goals.join("・"))}</span></div>
      <div class="sheet__label">固定時段</div>
      <div class="slot-chips">${p.availability.map((s) => `<span>${esc(s)}</span>`).join("")}</div>
      <button type="button" class="btn-contact" data-quick-contact>快速約球</button>
    </div>`);
  sheetRoot()
    .querySelector("[data-quick-contact]")
    .addEventListener("click", () => {
      closeSheet();
      onQuickContact(p);
    });
}

// ------------------------------------------------------------
// 需求 sheet:區域、大概程度、需求原句、查看原貼文
// (不顯示姓名或聯絡方式)
// ------------------------------------------------------------
export function openDemandSheet(d) {
  const skill = d.rawSkill ?? "程度未提供";
  const sourceCta = d.sourceUrl
    ? `<a class="btn-source" href="${esc(safeUrl(d.sourceUrl))}" target="_blank" rel="noopener noreferrer">
        查看原貼文<small>${esc(sourceLabel(d.sourceUrl))}</small>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#20302A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h6v6M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>
        </svg>
      </a>`
    : `<div class="platform-source">平台內需求</div>`;
  mountSheet(`
    <div class="sheet">
      <div class="sheet__handle"></div>
      <div class="dsheet__head">
        <div class="demand-face" style="width:36px;height:36px;font-size:15px">徵</div>
        <div style="flex:1">
          <div class="dsheet__court">${esc(d.court)} 附近</div>
          <div class="dsheet__sub">${esc(districtOf(d.court))}・有人在徵球伴</div>
        </div>
      </div>
      <div class="dsheet__level"><small>大概程度</small><b>${esc(skill)}</b></div>
      <div class="dsheet__quote">
        <small>需求原句</small>
        <p>「${esc(d.demandText)}」</p>
      </div>
      <div class="dsheet__note">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B0BAB0" stroke-width="2">
          <circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5M12 7.6v.1" stroke-linecap="round"/>
        </svg>
        <span>此為公開徵求貼文,非平台註冊球友;不顯示姓名與聯絡方式。</span>
      </div>
      ${sourceCta}
    </div>`);
}

// ------------------------------------------------------------
// 球場抽屜:聚合釘點開,列出該球場的所有球友與需求
// ------------------------------------------------------------
export function openCourtDrawer(court, items, { onPlayer, onDemand }) {
  const players = items.filter((it) => it.kind === "player");
  const demands = items.filter((it) => it.kind === "demand");
  const parts = [];
  if (players.length) parts.push(`${players.length} 位球友`);
  if (demands.length) parts.push(`${demands.length} 則徵求`);

  const rows = items
    .map((it, i) => {
      if (it.kind === "player") {
        const p = it.data;
        return `
          <button type="button" class="drawer__item" data-idx="${i}">
            <div class="avatar" style="width:44px;height:44px;font-size:18px">${esc(p.displayName.slice(0, 1))}</div>
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px">
                <span class="drawer__nick">${esc(p.displayName)}</span>
                <span class="ntrp-tag">${esc(p.ntrp.toFixed(1))}</span>
              </div>
              <div class="drawer__meta">${esc(p.goals.join("・"))}</div>
            </div>
            <span class="drawer__arrow">›</span>
          </button>`;
      }
      const d = it.data;
      return `
        <button type="button" class="drawer__item drawer__item--demand" data-idx="${i}">
          <div class="demand-face" style="width:40px;height:40px;font-size:14px">徵</div>
          <div style="flex:1;min-width:0">
            <div class="drawer__req">${esc(d.demandText)}</div>
            <div class="drawer__meta">${esc(d.rawSkill ?? "程度未提供")}・${esc(sourceLabel(d.sourceUrl))}</div>
          </div>
          <span class="drawer__arrow">›</span>
        </button>`;
    })
    .join("");

  mountSheet(`
    <div class="sheet drawer">
      <div class="sheet__handle"></div>
      <div class="drawer__head">
        <div style="flex:1">
          <div class="drawer__court">${esc(court.name)}</div>
          <div class="drawer__sub">${esc(court.district)}・${esc(parts.join("、"))}</div>
        </div>
        <button type="button" class="btn-close" data-close-drawer>✕</button>
      </div>
      <div class="drawer__list scroll">${rows}</div>
    </div>`);

  const root = sheetRoot();
  root.querySelector("[data-close-drawer]").addEventListener("click", closeSheet);
  root.querySelectorAll("[data-idx]").forEach((el) => {
    el.addEventListener("click", () => {
      const it = items[Number(el.dataset.idx)];
      if (it.kind === "player") onPlayer(it.data);
      else onDemand(it.data);
    });
  });
}

function firstSetValue(set) {
  return set.values().next().value;
}

function buildPlayerOpener(player, viewerProfile, slot) {
  const court = firstSetValue(viewerProfile.courts) || player.homeCourt;
  const ntrp = Number.isFinite(viewerProfile.ntrp) ? viewerProfile.ntrp.toFixed(1) : null;
  const playType = firstSetValue(viewerProfile.types);
  const slotText = slot || "這週";
  const levelText = ntrp ? `我程度約 ${ntrp}` : "我也在找附近球友";
  const goalText = playType ? `，想約 ${slotText} ${playType}` : `，想約 ${slotText}`;

  return `嗨，我在找 ${court} 附近的球友，${levelText}${goalText}，看到你的資料覺得蠻適合，想問這週有空打嗎？`;
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "已複製";
    setTimeout(() => {
      button.textContent = original;
    }, 1600);
  } catch {
    const error = modalRoot().querySelector("[data-copy-error]");
    if (error) error.hidden = false;
  }
}

// ------------------------------------------------------------
// 快速聯絡 modal:顯示 LINE + 產生開場白,真正溝通交給 LINE
// ------------------------------------------------------------
export function openQuickContactModal(p, { viewerProfile, onPublishRequest }) {
  publishButton()?.setAttribute("hidden", "");
  const root = modalRoot();
  let chosenSlot = p.availability[0] ?? "";

  const render = () => {
    const opener = buildPlayerOpener(p, viewerProfile, chosenSlot);
    root.innerHTML = `
      <div class="modal-dim" data-close></div>
      <div class="modal contact-modal">
        <div class="modal__head">
          <div class="avatar" style="width:48px;height:48px;font-size:19px">${esc(p.displayName.slice(0, 1))}</div>
          <div style="flex:1">
            <div class="modal__to">快速約球給</div>
            <div class="modal__nick">${esc(p.displayName)}</div>
          </div>
          <button type="button" class="btn-close" data-close-x>✕</button>
        </div>

        <div class="contact-summary">
          <span class="ntrp-tag">${esc(p.ntrp.toFixed(1))}</span>
          <span>${esc(p.homeCourt)}</span>
        </div>

        <div class="modal__label">想提哪個時段?</div>
        <div class="slot-opts">
          ${p.availability
            .map(
              (s, i) =>
                `<button type="button" class="slot-opt${s === chosenSlot ? " is-active" : ""}" data-slot="${i}">${esc(s)}</button>`
            )
            .join("")}
        </div>

        <div class="contact-line">
          <span class="line-badge">LINE</span>
          <strong>${esc(p.lineId)}</strong>
          <button type="button" data-copy-line>複製 LINE ID</button>
        </div>

        <div class="modal__label">開場白</div>
        <div class="contact-opener">${esc(opener)}</div>
        <button type="button" class="modal__send" data-copy-opener>複製開場白</button>
        ${onPublishRequest ? `<button type="button" class="modal__secondary" data-publish-request>發布需求</button>` : ""}
        <div class="modal__hint">請先簡短自我介紹，確認程度、球場與時間後再約打。</div>
        <div class="contact-copy-error" data-copy-error hidden>複製失敗，請手動選取文字。</div>
      </div>`;

    root.querySelector("[data-close]").addEventListener("click", closeModal);
    root.querySelector("[data-close-x]").addEventListener("click", closeModal);
    root.querySelectorAll("[data-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        chosenSlot = p.availability[Number(btn.dataset.slot)];
        render();
      });
    });
    root.querySelector("[data-copy-line]").addEventListener("click", (event) => {
      copyToClipboard(p.lineId, event.currentTarget);
    });
    root.querySelector("[data-copy-opener]").addEventListener("click", (event) => {
      copyToClipboard(opener, event.currentTarget);
    });
    root.querySelector("[data-publish-request]")?.addEventListener("click", () => {
      closeModal();
      onPublishRequest();
    });
  };

  render();
}

export function openLoginModal({ onSubmit }) {
  publishButton()?.setAttribute("hidden", "");
  const root = modalRoot();
  root.innerHTML = `
    <div class="modal-dim" data-close></div>
    <form class="modal auth-modal" data-login-form>
      <div class="modal__head">
        <div class="avatar" style="width:48px;height:48px;font-size:19px">入</div>
        <div style="flex:1">
          <div class="modal__to">登入後繼續</div>
          <div class="modal__nick">Email magic link</div>
        </div>
        <button type="button" class="btn-close" data-close-x>✕</button>
      </div>
      <div class="modal-field">
        <label class="modal-field__label" for="login-email">Email</label>
        <input id="login-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" required />
      </div>
      <button type="submit" class="modal__send">寄送登入信</button>
      <div class="modal__hint">本機開發時可使用 Supabase Studio 或測試 session 完成登入。</div>
    </form>`;

  const close = () => closeModal();
  root.querySelector("[data-close]").addEventListener("click", close);
  root.querySelector("[data-close-x]").addEventListener("click", close);
  root.querySelector("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    button.disabled = true;
    try {
      await onSubmit(new FormData(event.currentTarget).get("email").trim());
    } finally {
      button.disabled = false;
    }
  });
}

export function openPublishRequestModal(courts, { onSubmit }) {
  publishButton()?.setAttribute("hidden", "");
  const root = modalRoot();
  root.innerHTML = `
    <div class="modal-dim" data-close></div>
    <form class="modal request-modal" data-request-form>
      <div class="modal__head">
        <div class="demand-face" style="width:48px;height:48px;font-size:17px">徵</div>
        <div style="flex:1">
          <div class="modal__to">發布需求</div>
          <div class="modal__nick">快速找到附近球友</div>
        </div>
        <button type="button" class="btn-close" data-close-x>✕</button>
      </div>
      <div class="modal-field">
        <label class="modal-field__label" for="request-court">球場</label>
        <select id="request-court" name="courtId" required>
          ${courts.map((court) => `<option value="${esc(String(court.id ?? court.name))}">${esc(court.name)}</option>`).join("")}
        </select>
      </div>
      <div class="modal-field">
        <label class="modal-field__label" for="request-time">想約時間</label>
        <input id="request-time" type="text" name="desiredTimeText" placeholder="例如: 週六下午" required />
      </div>
      <div class="modal-field">
        <label class="modal-field__label" for="request-skill">大概程度</label>
        <input id="request-skill" type="text" name="rawSkillText" placeholder="例如: 3.5 左右" />
      </div>
      <div class="modal-field">
        <label class="modal-field__label" for="request-text">需求內容</label>
        <textarea id="request-text" name="requestText" placeholder="想找什麼樣的球友或打法" required></textarea>
      </div>
      <button type="submit" class="modal__send">送出需求</button>
    </form>`;

  const close = () => closeModal();
  root.querySelector("[data-close]").addEventListener("click", close);
  root.querySelector("[data-close-x]").addEventListener("click", close);
  root.querySelector("[data-request-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button[type='submit']");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    button.disabled = true;
    try {
      await onSubmit({
        courtId: values.courtId,
        desiredTimeText: values.desiredTimeText.trim(),
        rawSkillText: values.rawSkillText.trim(),
        requestText: values.requestText.trim(),
      });
      closeModal();
    } finally {
      button.disabled = false;
    }
  });
}
