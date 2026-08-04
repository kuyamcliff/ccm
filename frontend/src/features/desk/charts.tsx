import { useId, useState } from "react";

/**
 * The charts, drawn by hand in SVG.
 *
 * Every chart in this console shows one series, so none of them needs a
 * categorical palette or a legend: the heading names the series, and colour is
 * a single hue whose only job is to be visible against the surface. That is
 * also why there is no charting library here — a dependency measured in
 * hundreds of kilobytes to draw a hundred rectangles would be the largest
 * thing in the bundle.
 *
 * Each chart carries a table of the same numbers for screen readers, so the
 * data is never locked inside a picture.
 */

interface Point {
  label: string;
  value: number;
  /** Optional second line under the label in the readout. */
  note?: string;
}

const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / magnitude) * magnitude;
}

function DataTable({ caption, points, unit }: { caption: string; points: Point[]; unit: string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          <th scope="col">{unit}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point) => (
          <tr key={point.label}>
            <th scope="row">{point.label}</th>
            <td>{point.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * A trend over time. One series, filled underneath so the shape reads at a
 * glance from across the counter.
 */
export function TrendChart({
  points,
  title,
  unit = "value",
  format = (n: number) => n.toLocaleString("en-US"),
}: {
  points: Point[];
  title: string;
  unit?: string;
  format?: (value: number) => string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (points.length === 0) return <p className="fine faint">Nothing to draw yet.</p>;

  const width = 640;
  const height = 200;
  const inner = { w: width - PAD.left - PAD.right, h: height - PAD.top - PAD.bottom };
  const max = niceMax(Math.max(...points.map((point) => point.value)));

  const x = (index: number) => PAD.left + (points.length === 1 ? inner.w / 2 : (index / (points.length - 1)) * inner.w);
  const y = (value: number) => PAD.top + inner.h - (value / max) * inner.h;

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${PAD.top + inner.h} L${x(0)},${PAD.top + inner.h} Z`;
  const active = hover === null ? null : points[hover];

  return (
    <figure className="chart">
      <figcaption className="chart__head">
        <span className="label">{title}</span>
        {active ? (
          <span className="chart__readout">
            <strong className="mono">{format(active.value)}</strong>
            <span className="fine faint">{active.label}</span>
          </span>
        ) : null}
      </figcaption>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart__svg"
        role="img"
        aria-label={`${title}. ${points.length} points, highest ${format(max)}.`}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--red)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--red)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid is recessive: it orients, it does not compete with the data. */}
        {[0, 0.5, 1].map((step) => (
          <line
            key={step}
            x1={PAD.left}
            x2={width - PAD.right}
            y1={PAD.top + inner.h * step}
            y2={PAD.top + inner.h * step}
            stroke="var(--line)"
            strokeWidth="1"
          />
        ))}

        {/* A single day of data has no line to draw, so it gets a marker
            instead of an invisible path. A new restaurant sees this for its
            first week and an empty panel would read as broken. */}
        {points.length === 1 ? (
          <circle cx={x(0)} cy={y(points[0]!.value)} r="5" fill="var(--red)" />
        ) : (
          <>
            <path d={area} fill={`url(#${gradientId})`} />
            <path d={line} fill="none" stroke="var(--red)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}

        {active && hover !== null ? (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + inner.h}
              stroke="var(--line-2)"
              strokeWidth="1"
            />
            <circle cx={x(hover)} cy={y(active.value)} r="4.5" fill="var(--red)" stroke="var(--surface)" strokeWidth="2" />
          </>
        ) : null}

        {/* Hit areas are wider than the marks, so a finger finds them. */}
        {points.map((point, index) => (
          <rect
            key={point.label}
            x={x(index) - inner.w / points.length / 2}
            y={PAD.top}
            width={inner.w / points.length}
            height={inner.h}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          >
            <title>{`${point.label}: ${format(point.value)}`}</title>
          </rect>
        ))}
      </svg>

      <div className="chart__axis fine faint">
        <span>{points[0]?.label}</span>
        {points.length > 1 ? <span>{points[points.length - 1]?.label}</span> : null}
      </div>

      <DataTable caption={title} points={points} unit={unit} />
    </figure>
  );
}

/**
 * Magnitude across labelled buckets. Vertical when there are many short labels
 * (hours), horizontal when the labels are words (dish names).
 */
export function BarChart({
  points,
  title,
  unit = "value",
  horizontal,
  format = (n: number) => n.toLocaleString("en-US"),
}: {
  points: Point[];
  title: string;
  unit?: string;
  horizontal?: boolean;
  format?: (value: number) => string;
}) {
  if (points.length === 0) return <p className="fine faint">Nothing to draw yet.</p>;

  const max = Math.max(...points.map((point) => point.value)) || 1;

  if (horizontal) {
    return (
      <figure className="chart">
        <figcaption className="label chart__head">{title}</figcaption>
        <ul className="hbars">
          {points.map((point) => (
            <li key={point.label} className="hbar">
              <span className="hbar__label">{point.label}</span>
              <span className="hbar__track">
                {/* The fill is anchored to the baseline and rounded only at the
                    data end, so length stays the thing being compared. */}
                <span className="hbar__fill" style={{ width: `${Math.max(2, (point.value / max) * 100)}%` }} />
              </span>
              <span className="hbar__value mono">{format(point.value)}</span>
            </li>
          ))}
        </ul>
        <DataTable caption={title} points={points} unit={unit} />
      </figure>
    );
  }

  return (
    <figure className="chart">
      <figcaption className="label chart__head">{title}</figcaption>
      <div className="vbars" role="img" aria-label={`${title}. Highest ${format(max)}.`}>
        {points.map((point) => (
          <div key={point.label} className="vbar" title={`${point.label}: ${format(point.value)}`}>
            <div className="vbar__col">
              <div className="vbar__fill" style={{ height: `${Math.max(2, (point.value / max) * 100)}%` }} />
            </div>
            <span className="vbar__label fine faint">{point.label}</span>
          </div>
        ))}
      </div>
      <DataTable caption={title} points={points} unit={unit} />
    </figure>
  );
}
