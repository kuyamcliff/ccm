import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so one broken page shows a recovery screen instead of
 * blanking the whole site. A failed lazy chunk is treated separately: that
 * usually means the app was redeployed while this tab was open, and a reload
 * fixes it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isStaleChunk =
      /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);

    return (
      <div className="section" role="alert">
        <div className="section-inner error-screen">
          <p className="eyebrow">Something went wrong</p>
          <h1 className="section-title">
            {isStaleChunk ? "The site was just updated" : "This page hit a problem"}
          </h1>
          <p className="error-screen-body">
            {isStaleChunk
              ? "Reload to pick up the newest version. Nothing you entered has been sent."
              : "The rest of the site still works. Try again, or head back to the home page."}
          </p>
          <div className="error-screen-actions">
            <button className="btn btn-amber" onClick={() => window.location.reload()}>
              Reload the page
            </button>
            {!isStaleChunk && (
              <a className="btn btn-outline" href="/" onClick={this.reset}>
                Back to home
              </a>
            )}
          </div>
        </div>
      </div>
    );
  }
}
