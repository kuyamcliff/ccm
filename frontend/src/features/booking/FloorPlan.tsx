import { useMemo } from "react";
import type { DiningTable, FixtureKind, FloorFixture } from "~/lib/api";
import { Icon } from "~/ui/Icon";
import type { IconName } from "~/ui/Icon";

/**
 * The room, drawn to fit the screen it is on.
 *
 * The old plan held a minimum width and scrolled sideways, which meant that on
 * the phone almost every guest books from, half the room was off the edge, and
 * a table nobody scrolled to was a table nobody considered. This version never
 * scrolls. It takes the width it is given and derives its height from the
 * shape of the room, so every table is on screen at once.
 *
 * Two things make that work at 350px.
 *
 * The room's proportions are clamped rather than reproduced exactly. A long
 * thin room drawn true to scale on a phone is ninety pixels tall, which is not
 * a plan, it is a stripe. Held between 0.85 and 1.6 the arrangement stays
 * honest, and the arrangement is all anybody reads a plan for: which corner,
 * near what, next to whom.
 *
 * And the plan is not the only way to pick. It answers "where is it", and the
 * list underneath it answers "which one", with a full width row per table that
 * a thumb cannot miss. Anyone who cannot use a picture at all loses nothing.
 */

/** Breathing room around the outermost table, in the server's coordinates. */
const PADDING = 60;

/** How each fixture is drawn. Icon and word together, never colour alone. */
const FIXTURES: Record<FixtureKind, { icon: IconName; word: string }> = {
  grill: { icon: "flame", word: "Grill" },
  tv: { icon: "chart", word: "Screen" },
  bar: { icon: "wallet", word: "Bar" },
  door: { icon: "logout", word: "Way in" },
  toilets: { icon: "user", word: "Toilets" },
  kitchen: { icon: "basket", word: "Kitchen" },
  speaker: { icon: "sparkle", word: "Speaker" },
  plant: { icon: "flame", word: "Plant" },
};

export type TableState = "free" | "picked" | "taken" | "small";

/**
 * One rule for the state of a table, used by the plan and by the list beneath
 * it so the two can never disagree about what is free.
 *
 * "Blocked" used to be one look for two different reasons, occupied or simply
 * too small for this party, which left a guest unable to tell whether a greyed
 * out table might free up or was never an option.
 */
export function tableState(table: DiningTable, selectedId: number | null, partySize: number): TableState {
  if (table.id === selectedId) return "picked";
  if (table.available === false) return "taken";
  if (table.capacity < partySize) return "small";
  return "free";
}

interface Props {
  tables: DiningTable[];
  fixtures?: FloorFixture[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  partySize: number;
}

export function FloorPlan({ tables, fixtures = [], selectedId, onSelect, partySize }: Props) {
  /* The extent covers the fixtures too, or a grill placed past the last table
     would sit outside the picture and be clipped away. */
  const bounds = useMemo(() => {
    const xs = [...tables.map((t) => t.pos_x), ...fixtures.map((f) => f.pos_x)];
    const ys = [...tables.map((t) => t.pos_y), ...fixtures.map((f) => f.pos_y)];
    if (xs.length === 0) return { minX: 0, minY: 0, width: 640, height: 460, ratio: 1.4 };

    const minX = Math.min(...xs) - PADDING;
    const minY = Math.min(...ys) - PADDING;
    const width = Math.max(...xs) - minX + PADDING;
    const height = Math.max(...ys) - minY + PADDING;

    return { minX, minY, width, height, ratio: Math.min(1.6, Math.max(0.85, width / height)) };
  }, [tables, fixtures]);

  const pct = (value: number, min: number, span: number) => `${((value - min) / span) * 100}%`;

  return (
    <div className="plan-fit" style={{ aspectRatio: String(bounds.ratio) }}>
      {/* Underneath the tables and never in the tab order. This is the room,
          not something to choose. */}
      {fixtures.map((fixture) => {
        const look = FIXTURES[fixture.kind] ?? FIXTURES.plant;
        return (
          <div
            key={`f${fixture.id}`}
            className="plan__fixture"
            data-kind={fixture.kind}
            aria-hidden="true"
            style={{
              left: pct(fixture.pos_x, bounds.minX, bounds.width),
              top: pct(fixture.pos_y, bounds.minY, bounds.height),
              width: `${(fixture.width / bounds.width) * 100}%`,
              height: `${(fixture.height / bounds.height) * 100}%`,
            }}
          >
            <Icon name={look.icon} size={14} />
            <span className="plan__fixture-word">{fixture.label || look.word}</span>
          </div>
        );
      })}

      {tables.map((table) => {
        const state = tableState(table, selectedId, partySize);
        const pickable = state === "free" || state === "picked";

        return (
          <button
            key={table.id}
            type="button"
            className="plan__table"
            data-state={state}
            data-zone={table.zone}
            disabled={!pickable}
            aria-pressed={state === "picked"}
            aria-label={`Table ${table.label}, seats ${table.capacity}, ${
              state === "taken" ? "already taken" : state === "small" ? "too small for your party" : "free"
            }`}
            style={{
              left: pct(table.pos_x, bounds.minX, bounds.width),
              top: pct(table.pos_y, bounds.minY, bounds.height),
              /* Bigger tables are drawn bigger so the plan reads as a room. The
                 floor under which one may not shrink is set in CSS, in rems,
                 where a touch target belongs. */
              width: `${Math.min(17, 9 + table.capacity * 1.1)}%`,
            }}
            onClick={() => onSelect(state === "picked" ? null : table.id)}
          >
            {state === "taken" ? <Icon name="lock" size={11} className="plan__mark" /> : null}
            <span className="plan__label">{table.label}</span>
            <span className="plan__seats mono">{table.capacity}</span>
          </button>
        );
      })}
    </div>
  );
}
