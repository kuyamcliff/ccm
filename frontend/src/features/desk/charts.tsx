import { useId } from "react";

/**
 * The two charts in the console, drawn by hand in SVG.
 *
 * ── Why no charting library ────────────────────────────────────────────────
 *
 * This product needs a line and some bars. The smallest respectable charting
 * library is larger than the entire customer bundle, on a site whose central
 * problem is weight on a slow connection, to draw two shapes that are forty
 * lines of SVG each.
 *
 * ── One series, always ─────────────────────────────────────────────────────
 *
 * The palette here is black, white and one red, which means there is exactly one
 * colour available to distinguish a series with. So no chart in this console has
 * two series in it. Where a comparison is wanted, it is a number beside another
 * number, which is easier to read anyway.
 *
 * ── The table underneath is not optional ───────────────────────────────────
 *
 * Every chart ships with the same numbers as a real table, visually hidden. A
 * chart is a picture of data, and a picture is exactly the thing a screen reader
 * cannot read out.
 */

interface Point {
  label: string;
  value: number;
}

/** Rounds an axis up to something a person would have chosen. */
function niceMax(values: number[]): number {
  const highest = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(highest));
  return Math.ceil(highest / magnitude) * magnitude;
}

/* ── A line over time ───────────────────────────────────────────────────────*/

export function TrendChart({
  points,
  label,
  format = (value: number) => String(value),
}: {
  points: Point[];
  label: string;
  format?: (value: number) => string;
}) {
  const tableId = useId();

  if (points.length < 2) {
    return <p className="fine faint">Not enough days yet to draw a line.</p>;
  }

  const width = 100;
  const height = 34;
  const max = niceMax(points.map((point) => point.value));

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - (point.value / max) * height;
    return { x, y };
  });

  const line = coords.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  /* The same path closed along the bottom, so the fill under the line is one
     shape rather than a second set of coordinates that can drift out of step. */
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  const first = points[0]!;
  const last = points[points.length - 1]!;

  return (
    <figure className="chart">
      <svg
        className="chart__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        aria-describedby={tableId}
      >
        <path className="chart__area" d={area} />
        <path className="chart__line" d={line} vectorEffect="non-scaling-stroke" />
      </svg>

      <figcaption className="chart__foot fine faint">
        <span>{first.label}</span>
        <span className="push">{last.label}</span>
      </figcaption>

      <table id={tableId} className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/* ── Bars ───────────────────────────────────────────────────────────────────*/

export function BarChart({
  points,
  label,
  format = (value: number) => String(value),
}: {
  points: Point[];
  label: string;
  format?: (value: number) => string;
}) {
  const tableId = useId();

  if (points.length === 0) return <p className="fine faint">Nothing to show yet.</p>;

  const max = niceMax(points.map((point) => point.value));

  return (
    <figure className="chart chart--bars">
      <div className="chart__bars" role="img" aria-label={label} aria-describedby={tableId}>
        {points.map((point) => (
          <div key={point.label} className="chart__bar">
            {/* Scaled with a transform rather than a height, so a re-render
                composites instead of relaying out the whole row. */}
            <span
              className="chart__barfill"
              style={{ transform: `scaleY(${Math.max(0.015, point.value / max)})` }}
            />
            <span className="chart__barlabel micro">{point.label}</span>
          </div>
        ))}
      </div>

      <table id={tableId} className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.label}>
              <th scope="row">{point.label}</th>
              <td>{format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
