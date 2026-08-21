import { useMemo } from "react";
import type { DiningTable, FloorFixture } from "~/lib/api";
import { usePress } from "~/ui/press";

/**
 * The room, drawn.
 *
 * Guests pick a table off the actual shape of the place rather than out of a
 * dropdown of numbers, because "the one by the grill" is how people think about
 * where they want to sit and "Table 7" is not.
 *
 * ── The one hard rule ──────────────────────────────────────────────────────
 *
 * **It fits the screen and never scrolls sideways.** A floor plan you have to
 * pan around on a phone is worse than a list. The whole room is scaled into the
 * viewBox, so the plan gets smaller on a small screen rather than getting cut
 * off, and the labels stay legible because they are drawn at a fixed size
 * outside the scaling.
 *
 * ── Why SVG and not divs ───────────────────────────────────────────────────
 *
 * The coordinates in the database are arbitrary units from the console's floor
 * editor. SVG's viewBox does the scaling arithmetic for free and keeps the
 * proportions of the room correct at any width, which absolutely positioned divs
 * would need a resize observer and a lot of maths to match.
 */

/** Padding around the extremes of the room, in the room's own units. */
const MARGIN = 14;

export type TableState = "free" | "taken" | "too-small" | "chosen";

export function tableState(table: DiningTable, party: number, chosenId: number | null): TableState {
  if (table.id === chosenId) return "chosen";
  if (table.available === false) return "taken";
  if (table.capacity < party) return "too-small";
  return "free";
}

export function FloorPlan({
  tables,
  fixtures,
  party,
  chosenId,
  onChoose,
  labels,
}: {
  tables: DiningTable[];
  fixtures: FloorFixture[];
  party: number;
  chosenId: number | null;
  onChoose: (table: DiningTable) => void;
  labels: { free: string; taken: string; tooSmall: string; seats: (n: number) => string };
}) {
  /* The bounding box of everything in the room, so the plan is framed to its
     contents rather than to whatever coordinate space the editor happened to
     use. A room drawn in the top left corner of a 1000-unit canvas would
     otherwise render as a tiny cluster with three quarters of the plan empty. */
  const box = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];

    for (const table of tables) {
      xs.push(table.pos_x - 6, table.pos_x + 6);
      ys.push(table.pos_y - 6, table.pos_y + 6);
    }
    for (const fixture of fixtures) {
      xs.push(fixture.pos_x, fixture.pos_x + fixture.width);
      ys.push(fixture.pos_y, fixture.pos_y + fixture.height);
    }
    if (xs.length === 0) return { x: 0, y: 0, w: 100, h: 100 };

    const minX = Math.min(...xs) - MARGIN;
    const minY = Math.min(...ys) - MARGIN;
    return {
      x: minX,
      y: minY,
      w: Math.max(1, Math.max(...xs) + MARGIN - minX),
      h: Math.max(1, Math.max(...ys) + MARGIN - minY),
    };
  }, [tables, fixtures]);

  return (
    <div className="plan">
      <svg
        className="plan__svg"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        role="group"
        aria-label="Floor plan"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Fixtures first, so a table can never be drawn underneath the grill. */}
        {fixtures.map((fixture) => (
          <g key={`f-${fixture.id}`} className={`plan__fixture plan__fixture--${fixture.kind}`}>
            <rect
              x={fixture.pos_x}
              y={fixture.pos_y}
              width={fixture.width}
              height={fixture.height}
              rx={2}
            />
            {fixture.label ? (
              <text
                x={fixture.pos_x + fixture.width / 2}
                y={fixture.pos_y + fixture.height / 2}
                className="plan__fixturelabel"
                textAnchor="middle"
                dominantBaseline="central"
              >
                {fixture.label}
              </text>
            ) : null}
          </g>
        ))}

        {tables.map((table) => (
          <TableMark
            key={table.id}
            table={table}
            state={tableState(table, party, chosenId)}
            onChoose={() => onChoose(table)}
            labels={labels}
          />
        ))}
      </svg>

      <ul className="plan__key fine">
        <li>
          <span className="plan__swatch" data-state="free" /> {labels.free}
        </li>
        <li>
          <span className="plan__swatch" data-state="chosen" /> Yours
        </li>
        <li>
          <span className="plan__swatch" data-state="taken" /> {labels.taken}
        </li>
      </ul>
    </div>
  );
}

function TableMark({
  table,
  state,
  onChoose,
  labels,
}: {
  table: DiningTable;
  state: TableState;
  onChoose: () => void;
  labels: { free: string; taken: string; tooSmall: string; seats: (n: number) => string };
}) {
  const disabled = state === "taken" || state === "too-small";
  const press = usePress({ disabled });

  const why = state === "taken" ? labels.taken : state === "too-small" ? labels.tooSmall : labels.free;

  return (
    <g
      className="plan__table"
      data-state={state}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-pressed={state === "chosen"}
      aria-label={`Table ${table.label}, ${labels.seats(table.capacity)}, ${why}`}
      onClick={disabled ? undefined : onChoose}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onChoose();
        }
      }}
      {...press.pressProps}
    >
      {/* A round table for four or fewer, a rectangle above that, which is what
          the room actually looks like and makes the plan readable at a glance. */}
      {table.capacity <= 4 ? (
        <circle cx={table.pos_x} cy={table.pos_y} r={6} />
      ) : (
        <rect x={table.pos_x - 8} y={table.pos_y - 5} width={16} height={10} rx={2} />
      )}
      <text x={table.pos_x} y={table.pos_y} textAnchor="middle" dominantBaseline="central" className="plan__label">
        {table.label}
      </text>
    </g>
  );
}
