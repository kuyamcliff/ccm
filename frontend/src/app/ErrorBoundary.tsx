import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * The last thing between a bug and a blank page.
 *
 * A thrown render in React 19 unmounts the whole tree, so without this the
 * result of one bad property access is a white screen with no explanation and no
 * way out. Here it is a short apology, a reload button, and the phone number,
 * because somebody who cannot book online should still be able to ring the door.
 *
 * Deliberately a class. Error boundaries are the one thing hooks still cannot
 * do.
 */

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    /* The console is the only place this can go. There is no error reporting
       service wired up, and adding one means a third-party script on a page
       whose whole problem is weight on a slow connection. */
    console.error("[ccm] render failed", error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="page section stack center broke" role="alert">
        <h1 className="display display--xl">This page broke</h1>
        <p className="lead">
          Sorry about that. Reload it, and if it keeps happening give us a call and we will take your order over the
          phone.
        </p>
        <div className="bar bar--tight" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn--primary" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn btn--ghost" href="/">
            Back to the start
          </a>
        </div>
      </main>
    );
  }
}
