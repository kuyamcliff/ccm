import { useEffect, useState } from "react";
import { api } from "../api";
import type { LegalPage } from "../api";
import { useSettings } from "../settings";

/*
 * Renders a legal page whose text lives in the database so the owner can edit
 * it from the admin without a deploy.
 *
 * The stored body is plain text, not HTML, and it is rendered by building React
 * elements from it. Nothing an admin types can inject markup or script into the
 * page, which is why there is no dangerouslySetInnerHTML here.
 */

type Block = { kind: "heading" | "paragraph"; text: string };

function parse(body: string): Block[] {
  const blocks: Block[] = [];
  let buffer: string[] = [];

  /* A heading ends the paragraph before it, so headings are recognised line by
     line rather than only after a blank line. Without this, "## Heading" plus
     the sentence on the next line rendered as one very long heading. */
  const flush = () => {
    if (buffer.length) {
      blocks.push({ kind: "paragraph", text: buffer.join(" ").trim() });
      buffer = [];
    }
  };

  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "heading", text: line.slice(3).trim() });
      continue;
    }
    buffer.push(line);
  }
  flush();

  return blocks.filter((b) => b.text.length > 0);
}

function formatUpdated(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function LegalPageView({ slug, fallbackTitle }: { slug: "terms" | "privacy"; fallbackTitle: string }) {
  const year = new Date().getFullYear();
  const { city, address, region } = useSettings();

  const [page, setPage] = useState<LegalPage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let alive = true;
    api.legalPage(slug)
      .then((r) => { if (alive) { setPage(r.page); setState("ready"); } })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [slug]);

  const blocks = page ? parse(page.body) : [];
  const updated = page ? formatUpdated(page.updated_at) : "";

  return (
    <section className="section">
      <div className="section-inner narrow">
        <p className="eyebrow animate-up">Legal</p>
        <h1 className="page-title animate-up delay-1">{page?.title || fallbackTitle}</h1>

        <div className="legal-body animate-up delay-2">
          {state === "loading" && <p className="legal-updated">Loading…</p>}

          {state === "error" && (
            <p className="notice">
              We could not load this page just now. Please refresh, or reach us at {address}.
            </p>
          )}

          {state === "ready" && (
            <>
              {updated && <p className="legal-updated">Last updated: {updated}</p>}

              {blocks.map((b, i) =>
                b.kind === "heading" ? <h2 key={i}>{b.text}</h2> : <p key={i}>{b.text}</p>
              )}

              <p className="legal-fine">
                Cam Chop Meat, {address}, {region}. © {year} Cam Chop Meat, {city}.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
