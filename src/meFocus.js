/**
 * 「我」頁待還原焦點的釋放判定。
 *
 * 抽成純函式是為了讓判定本身能用 node unit test 覆蓋——`src/main.js` 進入時就會操作
 * DOM，無法在沒有瀏覽器的環境 import。這裡刻意只依賴 `root.contains`，不碰 `Node`
 * 全域，測試才能傳入輕量替身。
 */

/**
 * 焦點離開「我」頁 root 時，是否要放棄待還原的目標。
 *
 * 焦點還原改由動作端明確托管後，只剩一種情況要保留待還原目標：焦點仍在 root 內部移動
 * （`focusout` 會從內層元素往上冒泡）。其餘一律釋放，避免背景重繪把焦點從頁面外搶回來。
 *
 * @param {{ contains?: (node: unknown) => boolean } | null} root 「我」頁 root
 * @param {unknown} relatedTarget `focusout` 事件的 `relatedTarget`；焦點掉到 body 時為 null
 * @returns {boolean} true 代表應清空待還原目標
 */
export function shouldReleasePendingMeFocus(root, relatedTarget) {
  if (!relatedTarget) return true;
  if (!root || typeof root.contains !== "function") return true;
  return !root.contains(relatedTarget);
}

/**
 * 這個元素現在能不能真的接住焦點。
 *
 * 收合後的球場清單仍留在 DOM、也沒有 disabled，但對隱藏元素呼叫 `focus()` 是空操作——
 * 焦點會靜靜留在 body。還原目標前必須先問這一句。
 *
 * @param {{ disabled?: boolean, checkVisibility?: () => boolean, offsetParent?: unknown } | null} element
 * @returns {boolean}
 */
export function canReceiveFocus(element) {
  if (!element || element.disabled) return false;
  if (typeof element.checkVisibility === "function") return element.checkVisibility();
  return element.offsetParent != null;
}
