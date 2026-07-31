import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useLanguage } from "../i18n/context";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

function ErrorScreen({ isStaleChunk, onReload, onReset }: {
  isStaleChunk: boolean;
  onReload: () => void;
  onReset: () => void;
}) {
  const { t } = useLanguage();
  const te = (key: string) => t("errorBoundary", key);
  return (
    <div className="section" role="alert">
      <div className="section-inner error-screen">
        <p className="eyebrow">{te("eyebrow")}</p>
        <h1 className="section-title">
          {isStaleChunk ? te("staleTitle") : te("crashTitle")}
        </h1>
        <p className="error-screen-body">
          {isStaleChunk ? te("staleBody") : te("crashBody")}
        </p>
        <div className="error-screen-actions">
          <button className="btn btn-amber" onClick={onReload}>
            {te("reload")}
          </button>
          {!isStaleChunk && (
            <a className="btn btn-outline" href="/" onClick={onReset}>
              {te("backHome")}
            </a>
          )}
        </div>
      </div>
    </div>
  );
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
  private reload = () => window.location.reload();

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isStaleChunk =
      /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);

    return <ErrorScreen isStaleChunk={isStaleChunk} onReload={this.reload} onReset={this.reset} />;
  }
}
