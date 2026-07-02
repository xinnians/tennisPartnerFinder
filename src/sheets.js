// ============================================================
//  底部卡片(球友/需求 sheet)、球場抽屜、邀請 modal
//  版面與樣式對照設計檔的 PIN SHEETS / CLUSTER DRAWER / INVITE MODAL
// ============================================================
import { districtOf } from "./mockData.js";
import { esc, safeUrl, sourceLabel } from "./util.js";

const sheetRoot = () => document.getElementById("sheet-root");
const modalRoot = () => document.getElementById("modal-root");

export function closeSheet() {
  sheetRoot().innerHTML = "";
}

export function closeModal() {
  modalRoot().innerHTML = "";
}

/** 共用:掛 dimmer + 內容,點 dimmer 關閉 */
function mountSheet(html) {
  const root = sheetRoot();
  root.innerHTML = `<div class="sheet-dim" data-close></div>${html}`;
  root.querySelector("[data-close]").addEventListener("click", closeSheet);
}

// ------------------------------------------------------------
// 球友 sheet:暱稱、NTRP、想打類型、固定時段、LINE、送出邀請
// ------------------------------------------------------------
export function openPlayerSheet(p, { onInvite }) {
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
      <div class="line-row">
        <span class="line-badge">LINE</span>
        <span>${esc(p.lineId)}</span>
      </div>
      <button type="button" class="btn-invite" data-invite>送出邀請</button>
    </div>`);
  sheetRoot()
    .querySelector("[data-invite]")
    .addEventListener("click", () => {
      closeSheet();
      onInvite(p);
    });
}

// ------------------------------------------------------------
// 需求 sheet:區域、大概程度、需求原句、查看原貼文
// (不顯示姓名或聯絡方式)
// ------------------------------------------------------------
export function openDemandSheet(d) {
  const skill = d.rawSkill ?? "程度未提供";
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
      <a class="btn-source" href="${esc(safeUrl(d.sourceUrl))}" target="_blank" rel="noopener noreferrer">
        查看原貼文<small>${esc(sourceLabel(d.sourceUrl))}</small>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#20302A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 3h6v6M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>
        </svg>
      </a>
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

// ------------------------------------------------------------
// 邀請 modal:選時段 → 留言 → 送出 → 成功畫面
// (原型:只寫進記憶體的邀請清單,不打任何後端)
// ------------------------------------------------------------
export function openInviteModal(p, { onSend, onGotoInvites }) {
  const root = modalRoot();
  let chosenSlot = null;

  const renderForm = () => {
    root.innerHTML = `
      <div class="modal-dim" data-close></div>
      <div class="modal">
        <div class="modal__head">
          <div class="avatar" style="width:48px;height:48px;font-size:19px">${esc(p.displayName.slice(0, 1))}</div>
          <div style="flex:1">
            <div class="modal__to">送出邀請給</div>
            <div class="modal__nick">${esc(p.displayName)}</div>
          </div>
          <button type="button" class="btn-close" data-close-x>✕</button>
        </div>
        <div class="modal__label">想約哪個時段?</div>
        <div class="slot-opts">
          ${p.availability
            .map(
              (s, i) =>
                `<button type="button" class="slot-opt${s === chosenSlot ? " is-active" : ""}" data-slot="${i}">${esc(s)}</button>`
            )
            .join("")}
        </div>
        <div class="modal__label">留言(選填)</div>
        <textarea placeholder="打聲招呼,說說你的球風、想約的球場…"></textarea>
        <button type="button" class="modal__send" data-send>送出邀請</button>
        <div class="modal__hint">對方接受後,才會互相看到 LINE 聯絡方式。</div>
      </div>`;

    root.querySelector("[data-close]").addEventListener("click", closeModal);
    root.querySelector("[data-close-x]").addEventListener("click", closeModal);
    root.querySelectorAll("[data-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        chosenSlot = p.availability[Number(btn.dataset.slot)];
        root.querySelectorAll("[data-slot]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
      });
    });
    root.querySelector("[data-send]").addEventListener("click", () => {
      const msg = root.querySelector("textarea").value.trim();
      const slot = chosenSlot ?? "時間再約";
      onSend({ player: p, slot, msg });
      renderDone(slot);
    });
  };

  const renderDone = (slot) => {
    root.innerHTML = `
      <div class="modal-dim" data-close></div>
      <div class="modal">
        <div class="modal__done">
          <div class="modal__done-icon">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#16351F" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <div class="modal__done-title">邀請已送出!</div>
          <div class="modal__done-sub">已通知 ${esc(p.displayName)},等對方接受後<br/>就能看到 LINE、開始約球。</div>
          <div class="modal__done-slot">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#54634E" stroke-width="2">
              <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${esc(slot)}
          </div>
        </div>
        <button type="button" class="modal__goto" data-goto>查看我的邀請</button>
        <button type="button" class="modal__dismiss" data-close-x>完成</button>
      </div>`;

    root.querySelector("[data-close]").addEventListener("click", closeModal);
    root.querySelector("[data-close-x]").addEventListener("click", closeModal);
    root.querySelector("[data-goto]").addEventListener("click", () => {
      closeModal();
      onGotoInvites();
    });
  };

  renderForm();
}
