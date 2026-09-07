import { expect } from "@playwright/test";

export function createTouchTargetScanner(page) {
  return async (root) =>
    page.locator(root).evaluateAll((roots) => {
      const effectiveBox = (element) => {
        const box = element.getBoundingClientRect();
        const before = globalThis.getComputedStyle(element, "::before");
        if (before.content === "none" || (before.position !== "absolute" && before.position !== "fixed")) return box;
        const expand = (value) => Math.max(0, -(Number.parseFloat(value) || 0));
        return {
          height: box.height + expand(before.top) + expand(before.bottom),
          width: box.width + expand(before.left) + expand(before.right),
        };
      };

      return roots
        .flatMap((node) => [
          ...node.querySelectorAll(
            "button, a[href], input, select, textarea, label, summary, [role='button'], [role='switch']"
          ),
        ])
        .filter((element) => element.checkVisibility())
        .filter((element) => !element.matches(":disabled"))
        .filter((element) => {
          const wrappingLabel = element.closest("label");
          if (element.tagName !== "LABEL" && wrappingLabel && wrappingLabel !== element) return false;
          return element.tagName !== "LABEL" || Boolean(element.querySelector("input, select, textarea"));
        })
        .map((element) => {
          const box = effectiveBox(element);
          return {
            height: Math.round(box.height * 100) / 100,
            name:
              element.getAttribute("aria-label") ||
              element.getAttribute("data-testid") ||
              element.id ||
              element.textContent?.trim().replace(/\s+/gu, " ") ||
              element.tagName.toLowerCase(),
            width: Math.round(box.width * 100) / 100,
          };
        });
    });
}

export async function expectTouchTargets(page, root, minimumCount, message) {
  const measure = createTouchTargetScanner(page);
  await expect
    .poll(async () => (await measure(root)).length, { message: `${message}掃描集不得為空` })
    .toBeGreaterThanOrEqual(minimumCount);
  await expect
    .poll(async () => (await measure(root)).filter(({ height, width }) => height < 44 || width < 44), {
      message: `${message}全部點擊目標必須至少 44×44px`,
    })
    .toEqual([]);
}
