import type { CSSProperties } from "react";

const screen: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "2rem",
  background: "#0A0A0A",
  color: "#FFFFFF",
  textAlign: "center",
  fontFamily: "Inter, system-ui, sans-serif",
};

const content: CSSProperties = {
  width: "min(100%, 34rem)",
  display: "grid",
  justifyItems: "center",
  gap: "1.25rem",
};

const badge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.45rem 0.8rem",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: "999px",
  color: "rgba(255,255,255,0.72)",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const dot: CSSProperties = {
  width: "0.45rem",
  height: "0.45rem",
  borderRadius: "50%",
  background: "#E31C23",
  boxShadow: "0 0 16px rgba(227,28,35,0.55)",
};

const title: CSSProperties = {
  margin: 0,
  fontSize: "clamp(2.5rem, 9vw, 5rem)",
  lineHeight: 0.95,
  letterSpacing: "-0.055em",
  fontWeight: 800,
};

const copy: CSSProperties = {
  margin: 0,
  maxWidth: "30rem",
  color: "rgba(255,255,255,0.62)",
  fontSize: "1rem",
  lineHeight: 1.65,
};

function NotAvailable() {
  return (
    <main style={screen} aria-labelledby="not-available-title">
      <section style={content}>
        <div style={badge}>
          <span style={dot} aria-hidden="true" />
          Coming soon
        </div>
        <h1 id="not-available-title" style={title}>
          Not available yet.
        </h1>
        <p style={copy}>
          CCM is still being finished behind the scenes. The site is temporarily
          unavailable while we put the final pieces in place.
        </p>
        <p style={{ ...copy, fontSize: "0.88rem" }}>
          Please check back soon.
        </p>
      </section>
    </main>
  );
}

export function App() {
  return <NotAvailable />;
}
