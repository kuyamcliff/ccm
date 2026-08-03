import { useMemo } from "react";
import type { DiningTable, FixtureKind, FloorFixture } from "~/lib/api";
import { Icon } from "~/ui/Icon";
import type { IconName } from "~/ui/Icon";

/**
 * The room, drawn the way it actually is.
 *
 * A plan of nothing but bookable rectangles told a guest where the tables were
 * and nothing about the room they sit in — which corner faces the screen, which
 * one is beside the grill and will be warm and loud. Those are the things
 * people choose a table by, so the fixtures the owner places in the console are
 * drawn here underneath the tables.
 *
 * The plan holds a minimum width and scrolls sideways rather than shrinking to
 * fit a phone: squeezed to 360px the tables collided with each other and fell
 * under the size a fingertip can hit, which made the picture both wrong and
 * unusable at once.
 *
 * It is a picture, not the only way in — the list of tables underneath it in
 * the booking form does the same job for anyone who cannot use a map.
 */

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
    if (xs.length === 0) return { minX: 0, minY: 0, width: 640, height: 460 };
    const minX = Math.min(...xs) - PADDING;
    const minY = Math.min(...ys) - PADDING;
    return {
      minX,
      minY,
      width: Math.max(...xs) - minX + PADDING,
      height: Math.max(...ys) - minY + PADDING,
    };
  }, [tables, fixtures]);

  const pct = (value: number, min: number, span: number) => `${((value - min) / span) * 100}%`;

  return (
    <div>
      <div className="plan-frame">
        <div className="plan" style={{ aspectRatio: `${bounds.width} / ${bounds.height}` }}>
          {/* Underneath the tables, and never in the tab order — this is the
              room, not something to choose. */}
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
                <Icon name={look.icon} size={15} />
                <span className="plan__fixture-word">{fixture.label || look.word}</span>
              </div>
            );
          })}

          {tables.map((table) => {
            const free = table.available !== false;
            const fits = table.capacity >= partySize;
            const pickable = free && fits;
            const selected = table.id === selectedId;

            // "Blocked" was one look for two different reasons — occupied, or
            // just too small for this party — which left a guest unable to tell
            // whether a greyed-out table might free up or was never an option.
            const state = selected ? "picked" : pickable ? "free" : !free ? "taken" : "small";

            return (
              <button
                key={table.id}
                type="button"
                className="plan__table"
                data-state={state}
                data-zone={table.zone}
                disabled={!pickable}
                aria-pressed={selected}
                aria-label={`Table ${table.label}, seats ${table.capacity}, ${
                  !free ? "already taken" : !fits ? "too small for your party" : "free"
                }`}
                style={{
                  left: pct(table.pos_x, bounds.minX, bounds.width),
                  top: pct(table.pos_y, bounds.minY, bounds.height),
                  // Bigger tables are drawn bigger, so the plan reads as a room.
                  width: `${Math.min(15, 7.5 + table.capacity * 1.2)}%`,
                }}
                onClick={() => onSelect(selected ? null : table.id)}
              >
                {state === "taken" ? <Icon name="lock" size={12} className="plan__mark" /> : null}
                <span className="plan__label">{table.label}</span>
                <span className="plan__seats mono">{table.capacity}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Outside the scrolling frame, so it stays put while the room moves. */}
      <p className="plan-hint">
        <Icon name="arrow-right" size={14} />
        Scroll to see the whole room
      </p>
    </div>
  );
}
