import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

interface SessionUnavailableSheetProps {
  onClose: () => void;
}

function SessionUnavailableSheet({ onClose }: SessionUnavailableSheetProps) {
  return (
    <>
      <div className="surface__head">
        <div>
          <p className="surface__eyebrow">球局連結</p>
          <h2>找不到這個球局</h2>
        </div>
        <button
          type="button"
          className="surface__close"
          data-surface-close=""
          aria-label="關閉找不到球局訊息"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p className="surface__message">這個球局可能已下架、不再開放，或連結有誤。</p>
    </>
  );
}

/** Mount static React content inside mountSheet's existing surface element. */
export function mountSessionUnavailableSheetContent(rootElement: HTMLElement, onClose: () => void): void {
  const reactRoot = createRoot(rootElement);
  flushSync(() => reactRoot.render(<SessionUnavailableSheet onClose={onClose} />));
}
