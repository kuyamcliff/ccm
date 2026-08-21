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
 * off.
 *
 * ── Everything is sized from the room, not from the database ───────────────
 *
 * This is the part that was wrong before, and badly. A table was drawn at a
 * fixed radius of 6 and labelled at a fixed 5px — both in the room's own
 * coordinate units, which are whatever the console's floor editor happened to
 * use. The editor's canvas is 640 units wide, so a table came out at about two
 * percent of the plan's width: roughly seven pixels on a phone. Too small to
 * read and far too small to hit.
 *
 * So nothing here is a constant in room units. `unit` is derived from the
 * bounding box, every mark is a multiple of it, and a table is the same
 * comfortable size whether the room was drawn across 200 units or 2000.
 *
 * ── Why SVG and not divs ───────────────────────────────────────────────────
 *
 * SVG's viewBox does the scaling arithmetic for free and keeps the proportions
 * of the room correct at any width, which absolutely positioned divs would need
 * a resize observer and a lot of maths to match.
 */

/** Padding around the extremes of the room, as a multiple of `unit`. Enough
    that a table on the edge is not flush against the border, and no more:
    margin is width the tables do not get. */
const MARGIN_UNITS = 1.1;

/**
 * How many tables wide the room is treated as being.
 *
 * The divisor that turns a room of any size into marks of a usable one.
 *
 * Measured rather than guessed. At twelve a table came out about 31px wide on a
 * 390px phone: legible, but under the 44px this design uses for everything else
 * you are meant to hit. Nine puts it around 45px and the room still reads as a
 * room rather than as eight rectangles filling the screen.
 */
const TABLES_ACROSS = 9;

export type TableState = "free" | "taken" | "too-small" | "chosen" | "in-use";

export function tableState(
  table: DiningTable,
  party: number,
  chosenIds: number[],
  showInUse: boolean
): TableState {
  if (chosenIds.includes(table.id)) return "chosen";
  /*
   * "Somebody is sitting there now" is a fact about this minute, and the guest
   * is choosing a table for nine o'clock. Showing it to them would grey out a
   * table that is going to be free by the time they arrive, so it is only ever
   * drawn for the console, which is reading the room mid-service.
   */
  if (showInUse && table.in_use) return "in-use";
  if (table.available === false) return "taken";
  /*
   * Too small for the party — but only when the party is being sat at one
   * table. Once a second table is in play the capacities add up, so a four-top
   * is a perfectly good half of a party of eight and greying it out would make
   * booking for eight impossible.
   */
  if (chosenIds.length === 0 && table.capacity < party) return "too-small";
  return "free";
}

export interface PlanLabels {
  free: string;
  taken: string;
  tooSmall: string;
  inUse: string;
  yours: string;
  seats: (n: number) => string;
}

export function FloorPlan({
  tables,
  fixtures,
  party,
  chosenIds,
  onChoose,
  labels,
  showInUse = false,
}: {
  tables: DiningTable[];
  fixtures: FloorFixture[];
  party: number;
  chosenIds: number[];
  onChoose: (table: DiningTable) => void;
  labels: PlanLabels;
  /** The console cares which tables have somebody at them. A guest does not. */
  showInUse?: boolean;
}) {
  /*
   * The room, and the size of everything drawn in it.
   *
   * Two passes, because the margin depends on `unit` and `unit` depends on how
   * far apart the tables are. The first pass frames the furniture; the second
   * derives the mark size from that frame and pads the frame by it.
   */
  const plan = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];

    for (const table of tables) {
      xs.push(table.pos_x);
      ys.push(table.pos_y);
    }
    for (const fixture of fixtures) {
      xs.push(fixture.pos_x, fixture.pos_x + fixture.width);
      ys.push(fixture.pos_y, fixture.pos_y + fixture.height);
    }
    if (xs.length === 0) return { x: 0, y: 0, w: 100, h: 100, unit: 100 / TABLES_ACROSS };

    const rawW = Math.max(1, Math.max(...xs) - Math.min(...xs));
    const rawH = Math.max(1, Math.max(...ys) - Math.min(...ys));

    /* Off the wider side, so a long thin room does not end up with marks that
       are enormous relative to its short axis. */
    const unit = Math.max(rawW, rawH) / TABLES_ACROSS;
    const margin = unit * MARGIN_UNITS;

    const minX = Math.min(...xs) - margin;
    const minY = Math.min(...ys) - margin;

    return {
      x: minX,
      y: minY,
      w: Math.max(...xs) + margin - minX,
      h: Math.max(...ys) + margin - minY,
      unit,
    };
  }, [tables, fixtures]);

  return (
    <div className="plan">
      <svg
        className="plan__svg"
        viewBox={`${plan.x} ${plan.y} ${plan.w} ${plan.h}`}
        /* The element takes its height from the room's own proportions, so the
           plan fills the width it is given and is never letterboxed inside a
           box of the wrong shape. The CSS caps it on very tall rooms. */
        style={{ aspectRatio: `${plan.w} / ${plan.h}` }}
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
              rx={plan.unit * 0.25}
              strokeWidth={plan.unit * 0.06}
              strokeDasharray={`${plan.unit * 0.3} ${plan.unit * 0.2}`}
            />
            {fixture.label ? (
              <text
                x={fixture.pos_x + fixture.width / 2}
                y={fixture.pos_y + fixture.height / 2}
                className="plan__fixturelabel"
                fontSize={plan.unit * 0.34}
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
            unit={plan.unit}
            state={tableState(table, party, chosenIds, showInUse)}
            order={chosenIds.indexOf(table.id)}
            multiple={chosenIds.length > 1}
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
          <span className="plan__swatch" data-state="chosen" /> {labels.yours}
        </li>
        <li>
          <span className="plan__swatch" data-state="taken" /> {labels.taken}
        </li>
        {showInUse ? (
          <li>
            <span className="plan__swatch" data-state="in-use" /> {labels.inUse}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function TableMark({
  table,
  unit,
  state,
  order,
  multiple,
  onChoose,
  labels,
}: {
  table: DiningTable;
  unit: number;
  state: TableState;
  /** Where this table came in the selection, or -1. Only shown when there is
      more than one, since "1" beside a single table says nothing. */
  order: number;
  multiple: boolean;
  onChoose: () => void;
  labels: PlanLabels;
}) {
  const disabled = state === "taken" || state === "too-small" || state === "in-use";
  const press = usePress({ disabled });

  const why =
    state === "taken"
      ? labels.taken
      : state === "in-use"
        ? labels.inUse
        : state === "too-small"
          ? labels.tooSmall
          : state === "chosen"
            ? labels.yours
            : labels.free;

  /* A round table for four or fewer, a rectangle above that, which is what the
     room actually looks like and makes the plan readable at a glance. */
  const round = table.capacity <= 4;
  /* Sized so both shapes land near the 44px tap target on a phone showing the
     whole room. A circle is measured across, a rectangle along its longer
     side, which is why the two numbers are not the same. */
  const r = unit * 0.7;
  const rectW = unit * 1.6;
  const rectH = unit * 1.0;

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
      {round ? (
        <circle cx={table.pos_x} cy={table.pos_y} r={r} strokeWidth={unit * 0.07} />
      ) : (
        <rect
          x={table.pos_x - rectW / 2}
          y={table.pos_y - rectH / 2}
          width={rectW}
          height={rectH}
          rx={unit * 0.18}
          strokeWidth={unit * 0.07}
        />
      )}
      <text
        x={table.pos_x}
        y={table.pos_y}
        textAnchor="middle"
        dominantBaseline="central"
        className="plan__label"
        fontSize={unit * 0.42}
      >
        {table.label}
      </text>

      {/* Which one this was in the order they were picked. Only drawn for a
          party across several tables, where knowing the order is the difference
          between "these three" and "three separate mistakes". */}
      {multiple && order >= 0 ? (
        <>
          <circle
            className="plan__order"
            cx={table.pos_x + (round ? r : rectW / 2) * 0.85}
            cy={table.pos_y - (round ? r : rectH / 2) * 0.85}
            r={unit * 0.28}
          />
          <text
            className="plan__ordernum"
            x={table.pos_x + (round ? r : rectW / 2) * 0.85}
            y={table.pos_y - (round ? r : rectH / 2) * 0.85}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={unit * 0.3}
          >
            {order + 1}
          </text>
        </>
      ) : null}
    </g>
  );
}
