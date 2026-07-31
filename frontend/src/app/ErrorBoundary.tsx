import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * Last line of defence.
 *
 * A render error anywhere below this leaves React with an empty document —
 * a white screen with no explanation, which on a phone reads as "the
 * restaurant's site is broken". This catches it and offers the only two moves
 * that ever help: reload, or go back to the start.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept: the production build ships hidden source maps, so this stack is
    // readable when somebody reports the screen below.
    console.error("[render]", error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="page section stack" style={{ maxWidth: "34rem" }}>
        <h1 className="display display--lg">Something on this page broke</h1>
        <p className="lead">
          Not your fault, and nothing you were doing has been lost. Reload the page and it will most likely behave.
        </p>
        <div className="row row--wrap">
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn btn--ghost" href="/">
            Back to the start
          </a>
        </div>
      </div>
    );
  }
}
