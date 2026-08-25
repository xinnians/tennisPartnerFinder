import { Component, type ReactNode } from "react";

import { captureAppError, type AppErrorSurface } from "../appErrors.ts";
import { getE2ETestHooks } from "../e2eTestHooks.ts";

interface AppErrorBoundaryProps {
  children: ReactNode;
  onError?: () => void;
  resetKey?: number;
  rootElement?: HTMLElement;
  surface: AppErrorSurface;
}

interface AppErrorBoundaryState {
  dismissed: boolean;
  failed: boolean;
}

interface ErrorInjectionHooks {
  reactRenderError?: { surface?: string };
}

function shouldInjectRenderError(surface: AppErrorSurface): boolean {
  const hooks = getE2ETestHooks<ErrorInjectionHooks>();
  return hooks?.reactRenderError?.surface === surface;
}

function InjectedRenderError({ children, surface }: { children: ReactNode; surface: AppErrorSurface }) {
  if (shouldInjectRenderError(surface)) throw new Error("Injected React render failure");
  return children;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { dismissed: false, failed: false };

  static getDerivedStateFromError(): Partial<AppErrorBoundaryState> {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    captureAppError("react-render", this.props.surface, error);
    this.props.onError?.();
  }

  componentDidUpdate(previous: AppErrorBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && (this.state.failed || this.state.dismissed)) {
      this.setState({ dismissed: false, failed: false });
    }
  }

  private dismiss = (): void => {
    const dismissControl = this.props.rootElement?.parentElement?.querySelector<HTMLElement>("[data-surface-dismiss]");
    if (dismissControl) dismissControl.click();
    else this.setState({ dismissed: true });
  };

  render(): ReactNode {
    if (this.state.dismissed) return null;
    if (this.state.failed) {
      return (
        <section className="app-error-fallback" role="alert" data-testid="app-error-fallback">
          <h2 tabIndex={-1}>這個畫面暫時無法顯示</h2>
          <p>請關閉後再試一次；其他功能仍可繼續使用。</p>
          <button type="button" className="session-secondary" onClick={this.dismiss}>
            關閉
          </button>
        </section>
      );
    }
    return <InjectedRenderError surface={this.props.surface}>{this.props.children}</InjectedRenderError>;
  }
}
