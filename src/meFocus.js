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
