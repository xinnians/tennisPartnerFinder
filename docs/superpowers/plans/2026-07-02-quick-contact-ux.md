# Quick Contact UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the prototype invite workflow with a quick LINE contact flow for registered tennis players.

**Architecture:** Keep the current Vite + vanilla JavaScript architecture. Remove the in-memory invite UI from the active app surface, route player-card contact through a focused quick-contact modal, and keep demand pins on their existing external-source path.

**Tech Stack:** Vite, vanilla JavaScript modules, Google Maps JavaScript API loader, Playwright smoke tests.

---

## Source Spec

Implement the first increment of:

`docs/superpowers/specs/2026-07-02-quick-contact-ux-design.md`

This plan intentionally does not build platform-owned `徵球伴` publishing. Until request publishing exists, ship temporary two-tab navigation: `地圖` / `個人檔案`.

## File Structure

- Modify `tests/smoke.spec.js`
  - Update the smoke coverage from invite creation to quick contact behavior.
  - Keep the existing fake Google Maps script.
- Modify `index.html`
  - Remove the `我的邀請` tab panel.
  - Remove the `我的邀請` tabbar button.
  - Update profile visibility copy from location sharing to public player card language.
- Modify `src/main.js`
  - Remove active invite state, invite rendering, and invite navigation.
  - Gate quick contact behind the viewer's required profile fields.
  - Open the quick contact modal for registered players.
- Modify `src/sheets.js`
  - Remove LINE from the first player sheet layer.
  - Change player CTA to `快速約球`.
  - Replace the invite modal with a quick contact modal that shows LINE and a generated opener.
- Modify `src/style.css`
  - Reuse existing modal and button primitives.
  - Add quick-contact styles.
  - Leave unused invite styles only if removing them would make the first change noisy.

Do not modify `src/map.js`, `src/filters.js`, `src/mockData.js`, or the Supabase migration in this increment.

## Task 1: Write Failing Smoke Tests For Quick Contact

**Files:**
- Modify: `tests/smoke.spec.js`

- [ ] **Step 1: Replace the first smoke test with quick-contact expectations**

Keep `fakeMapsScript` and `installFakeMaps(page)` unchanged. Replace the existing test named `loads, switches tabs, opens a player sheet, sends an invite, and saves profile` with this test:

```js
test("loads, uses quick contact, and saves profile", async ({ page }) => {
  const runtimeErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") runtimeErrors.push(msg.text());
  });
  page.on("pageerror", (err) => runtimeErrors.push(err.message));

  await installFakeMaps(page);
  await page.goto("/");

  await expect(page).toHaveTitle(/Tennis Partner Finder/);
  await expect(page.getByText("找球伴")).toBeVisible();
  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");
  await expect(page.getByRole("button", { name: /我的邀請/ })).toHaveCount(0);

  await page.getByRole("button", { name: /個人檔案/ }).click();
  await expect(page.getByLabel("暱稱")).toBeVisible();
  await expect(page.getByText("公開我的球友卡")).toBeVisible();
  await expect(page.getByText("讓其他球友透過 LINE 找你約球")).toBeVisible();
  await page.getByRole("button", { name: "儲存檔案" }).click();
  await expect(page.getByText("已儲存")).toBeVisible();

  await page.getByRole("button", { name: /^地圖$/ }).click();
  await page.getByRole("button", { name: /地圖圖釘 大安森林公園網球場/ }).click();
  await expect(page.locator("#sheet-root .psheet__nick")).toHaveText("Amber");
  await expect(page.locator("#sheet-root")).not.toContainText("amber.tw");
  await expect(page.getByRole("button", { name: "快速約球" })).toBeVisible();

  await page.getByRole("button", { name: "快速約球" }).click();
  await expect(page.getByText("先補齊 LINE ID，開場白會比較自然。")).toBeVisible();
  await expect(page.getByText("個人檔案")).toBeVisible();

  await page.getByPlaceholder("輸入你的 LINE ID").fill("my_line_id");
  await page.getByRole("button", { name: /^地圖$/ }).click();
  await page.getByRole("button", { name: /地圖圖釘 大安森林公園網球場/ }).click();
  await page.getByRole("button", { name: "快速約球" }).click();

  await expect(page.getByText("快速約球給")).toBeVisible();
  await expect(page.getByText("Amber")).toBeVisible();
  await expect(page.getByText("amber.tw")).toBeVisible();
  await expect(page.getByRole("button", { name: "複製 LINE ID" })).toBeVisible();
  await expect(page.getByRole("button", { name: "複製開場白" })).toBeVisible();
  await page.getByRole("button", { name: "週三晚上" }).click();
  await expect(page.locator(".contact-opener")).toContainText("大安森林公園網球場");
  await expect(page.locator(".contact-opener")).toContainText("週三晚上");
  await expect(page.locator(".contact-opener")).toContainText("3.5");

  expect(runtimeErrors).toEqual([]);
});
```

- [ ] **Step 2: Add a demand-pin regression test**

Add this test after the quick-contact smoke test and before the Maps auth fallback test:

```js
test("external demand pins keep the source-link flow", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");

  await page.getByRole("button", { name: /地圖圖釘 中正網球中心/ }).click();

  await expect(page.getByText("中正網球中心 附近")).toBeVisible();
  await expect(page.getByText("查看原貼文")).toBeVisible();
  await expect(page.locator("#sheet-root")).not.toContainText("快速約球");
  await expect(page.locator("#sheet-root")).not.toContainText("回應需求");
});
```

- [ ] **Step 3: Run the tests and verify they fail for the expected reasons**

Run:

```bash
npm test
```

Expected: FAIL. The failures should mention missing `快速約球`, old `我的邀請` navigation, old visibility copy, or missing `.contact-opener`. Runtime build errors are not expected at this step.

## Task 2: Remove Active Invite Navigation And Update Profile Copy

**Files:**
- Modify: `index.html`
- Modify: `src/main.js`

- [ ] **Step 1: Remove the `我的邀請` tab panel from `index.html`**

Delete the entire section that starts with:

```html
<!-- ===================== 我的邀請分頁 ===================== -->
<section id="tab-invites" class="tab-panel">
```

and ends with its matching closing `</section>`.

- [ ] **Step 2: Replace the profile visibility card copy in `index.html`**

Find the card containing `id="prof-share"` and replace only the text block with:

```html
<div style="flex: 1">
  <div class="share-row__title">公開我的球友卡</div>
  <div class="share-row__sub">
    讓其他球友透過 LINE 找你約球。公開前需要填 LINE ID、NTRP 與常打球場。
  </div>
</div>
<button type="button" id="prof-share" class="toggle" aria-label="公開我的球友卡">
  <span class="toggle__knob"></span>
</button>
```

- [ ] **Step 3: Replace the LINE hint in `index.html`**

Find:

```html
<div class="prof-line__hint">收到你同意的邀請後,對方才看得到你的 LINE ID。</div>
```

Replace it with:

```html
<div class="prof-line__hint">只有別人按下快速約球時才會看到,不會顯示在地圖第一層。</div>
```

- [ ] **Step 4: Replace the bottom tabbar in `index.html`**

Replace the full `<nav class="tabbar">...</nav>` block with:

```html
<nav class="tabbar">
  <button type="button" class="tabbar__btn is-active" data-tab="map">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
      <circle class="dot" cx="12" cy="10" r="2.4" />
    </svg>
    <span>地圖</span>
  </button>
  <button type="button" class="tabbar__btn" data-tab="profile">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6.2 8-6.2s8 2.2 8 6.2" />
    </svg>
    <span>個人檔案</span>
  </button>
</nav>
```

- [ ] **Step 5: Remove invite state and rendering from `src/main.js`**

Replace the current `state` object with:

```js
const state = {
  filters: { ...DEFAULT_FILTER_STATE, types: new Set(DEFAULT_FILTER_STATE.types) },
  profile: {
    nick: "我",
    ntrp: 3.5,
    types: new Set(["單打", "對拉"]),
    courts: new Set(["大安森林公園網球場"]),
    slots: new Set(["wd-e", "we-m"]),
    share: false,
    lineId: "",
  },
};
```

Delete the entire `renderInvites()` function.

In `init()`, delete this line:

```js
renderInvites();
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test
```

Expected: FAIL. The active failures should now be about the player sheet still showing old invite behavior or the missing quick-contact modal. There should be no crash from missing `invites-list`.

## Task 3: Add Quick Contact Wiring In `src/main.js`

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Replace the sheets import**

Find:

```js
  openInviteModal,
```

Replace it with:

```js
  openQuickContactModal,
```

- [ ] **Step 2: Replace the player handler and invite function**

Find:

```js
const pinHandlers = {
  onPlayer: (p) => openPlayerSheet(p, { onInvite: startInvite }),
  onDemand: (d) => openDemandSheet(d),
  onCluster: (court, items) => openCourtDrawer(court, items, pinHandlers),
};

function startInvite(p) {
  openInviteModal(p, {
    onSend: ({ player, slot, msg }) => {
      state.invites.unshift({ player, slot, msg, status: "pending", when: "剛剛" });
      renderInvites();
    },
    onGotoInvites: () => switchTab("invites"),
  });
}
```

Replace it with:

```js
const pinHandlers = {
  onPlayer: (p) => openPlayerSheet(p, { onQuickContact: startQuickContact }),
  onDemand: (d) => openDemandSheet(d),
  onCluster: (court, items) => openCourtDrawer(court, items, pinHandlers),
};

function contactMissingFields(profile) {
  const missing = [];
  if (!profile.lineId) missing.push("LINE ID");
  if (!profile.ntrp) missing.push("NTRP");
  if (profile.courts.size === 0) missing.push("常打球場");
  return missing;
}

function showToast(message) {
  const toast = document.getElementById("toast-root");
  toast.innerHTML = `<div class="toast">${esc(message)}</div>`;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toast.innerHTML = ""), 2200);
}

function startQuickContact(p) {
  const missing = contactMissingFields(state.profile);
  if (missing.length > 0) {
    showToast(`先補齊 ${missing.join("、")}，開場白會比較自然。`);
    switchTab("profile");
    return;
  }

  openQuickContactModal(p, { viewerProfile: state.profile });
}
```

- [ ] **Step 3: Simplify the profile save toast**

Inside `setupProfile()`, replace the `prof-save` click listener with:

```js
document.getElementById("prof-save").addEventListener("click", () => {
  showToast("已儲存");
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: FAIL. The failures should now be about missing `openQuickContactModal`, old player sheet content, or missing quick contact DOM.

## Task 4: Replace Player Sheet CTA And Add Quick Contact Modal

**Files:**
- Modify: `src/sheets.js`

- [ ] **Step 1: Replace `openPlayerSheet`**

Replace the current `openPlayerSheet` function with:

```js
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
      <button type="button" class="btn-invite" data-quick-contact>快速約球</button>
    </div>`);
  sheetRoot()
    .querySelector("[data-quick-contact]")
    .addEventListener("click", () => {
      closeSheet();
      onQuickContact(p);
    });
}
```

- [ ] **Step 2: Add quick-contact helpers above the old invite modal section**

Add these helpers before the comment that currently says `邀請 modal`:

```js
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
```

- [ ] **Step 3: Replace `openInviteModal` with `openQuickContactModal`**

Delete the current `openInviteModal` function and add:

```js
export function openQuickContactModal(p, { viewerProfile }) {
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
  };

  render();
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: PASS. The quick-contact DOM exists before its final styling is added, so tests should not depend on Task 5.

## Task 5: Add Quick Contact Styles

**Files:**
- Modify: `src/style.css`

- [ ] **Step 1: Update the modal section comment**

Find:

```css
/* ------------------------------------------------------------
   邀請 modal
   ------------------------------------------------------------ */
```

Replace it with:

```css
/* ------------------------------------------------------------
   快速聯絡 modal
   ------------------------------------------------------------ */
```

- [ ] **Step 2: Add quick-contact style rules after `.modal__nick`**

Add:

```css
.contact-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -4px 0 18px 60px;
  font-size: 12.5px;
  color: var(--muted-2);
  font-weight: 600;
}

.contact-line {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 18px;
  padding: 12px 13px;
  background: #eaf7ee;
  border: 1px solid #c9e8d3;
  border-radius: 14px;
}

.contact-line strong {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  color: #1e6b3a;
  overflow-wrap: anywhere;
}

.contact-line button {
  flex: none;
  border: 0;
  border-radius: 11px;
  background: var(--deep);
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  padding: 8px 10px;
  cursor: pointer;
}

.contact-opener {
  padding: 13px 14px;
  border-radius: 14px;
  background: #f8faf4;
  border: 1px solid #e7eae1;
  color: #2c3a31;
  font-size: 14px;
  line-height: 1.65;
  font-weight: 500;
}

.contact-copy-error {
  margin-top: 10px;
  color: #9a3e2f;
  background: #fff2ed;
  border: 1px solid #f1c8bb;
  border-radius: 12px;
  padding: 9px 11px;
  font-size: 12.5px;
  line-height: 1.45;
}
```

- [ ] **Step 3: Keep old invite-card styles untouched for this increment**

Do not remove `.inv__*`, `.badge-*`, `.empty`, or old `.modal__done*` styles in this task. They are now unused, but removing them is cosmetic and increases review noise.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

## Task 6: Build Verification And Commit

**Files:**
- Verify: all modified files

- [ ] **Step 1: Run production build**

Run:

```bash
npm run build
```

Expected: PASS with Vite build output and no JavaScript syntax errors.

- [ ] **Step 2: Run smoke tests**

Run:

```bash
npm test
```

Expected: PASS. Both Chromium projects configured by Playwright should pass the quick-contact and Maps fallback tests.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git diff -- index.html src/main.js src/sheets.js src/style.css tests/smoke.spec.js
```

Expected:

- `我的邀請` tab and panel removed.
- Player sheet no longer renders `.line-row`.
- Player sheet CTA says `快速約球`.
- Quick contact modal exposes LINE only after CTA.
- Demand source flow remains unchanged.
- No Supabase migration changes.

- [ ] **Step 4: Commit the implementation**

Run:

```bash
git add index.html src/main.js src/sheets.js src/style.css tests/smoke.spec.js
git commit -m "Replace invite flow with quick contact"
```

Expected: commit succeeds with only the five implementation files staged.

## Plan Self-Review

- Spec coverage:
  - Fast contact path: Tasks 3 and 4.
  - No first-layer LINE exposure: Tasks 1 and 4.
  - Remove `我的邀請`: Tasks 1 and 2.
  - Profile visibility copy: Task 2.
  - External demand pins unchanged: Tasks 1 and 4.
  - No platform-owned demand publishing: File structure and Task 6 explicitly exclude it.
- Placeholder scan:
  - No banned marker text or incomplete instructions are used.
  - Every code-changing step includes concrete code or exact deletion boundaries.
- Type and name consistency:
  - `openQuickContactModal` is imported by `src/main.js` and exported by `src/sheets.js`.
  - `onQuickContact` is passed by `src/main.js` and consumed by `openPlayerSheet`.
  - `.contact-opener` is created by `src/sheets.js`, styled by `src/style.css`, and asserted by `tests/smoke.spec.js`.
