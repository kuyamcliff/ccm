import { useMemo } from "react";
import type { DiningTable } from "~/lib/api";
import { Icon } from "~/ui/Icon";

/**
 * The room, laid out the way it actually is.
 *
 * Positions are stored in whatever coordinate space the owner dragged them
 * into in the console, so nothing here assumes a fixed canvas: the extent of
 * the tables is measured and mapped onto the available width. That way adding
 * a table out past the others rescales the plan instead of pushing it off the
 * edge.
 *
 * The plan holds a minimum width and scrolls sideways rather than shrinking to
 * fit a phone. Squeezed to 360px the tables collided with each other and fell
 * under the size a fingertip can hit, which made the picture both wrong and
 * unusable at once.
 *
 * It is a picture, not the only way in — the list of tables underneath it in
 * the booking form does the same job for anyone who cannot use a map.
 */

const PADDING = 60;

interface Props {
  tables: DiningTable[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  partySize: number;
}

export function FloorPlan({ tables, selectedId, onSelect, partySize }: Props) {
  const bounds = useMemo(() => {
    if (tables.length === 0) return { minX: 0, minY: 0, width: 600, height: 400 };
    const xs = tables.map((t) => t.pos_x);
    const ys = tables.map((t) => t.pos_y);
    const minX = Math.min(...xs) - PADDING;
    const minY = Math.min(...ys) - PADDING;
    return {
      minX,
      minY,
      width: Math.max(...xs) - minX + PADDING,
      height: Math.max(...ys) - minY + PADDING,
    };
  }, [tables]);

  const zones = [...new Set(tables.map((table) => table.zone))];

  return (
    <div>
      <div className="plan-frame">
        <div className="plan" style={{ aspectRatio: `${bounds.width} / ${bounds.height}` }}>
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
                  left: `${((table.pos_x - bounds.minX) / bounds.width) * 100}%`,
                  top: `${((table.pos_y - bounds.minY) / bounds.height) * 100}%`,
                  // Bigger tables are drawn bigger, so the plan reads as a room.
                  width: `${Math.min(18, 8 + table.capacity * 1.6)}%`,
                }}
                onClick={() => onSelect(selected ? null : table.id)}
              >
                {state === "taken" ? <Icon name="lock" size={13} className="plan__mark" /> : null}
                <span className="plan__label">{table.label}</span>
                <span className="plan__seats mono">{table.capacity}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sits outside the scrolling frame, so it stays put while the room moves
          under it. The zone names are here rather than floated over the plan,
          where on a phone they started life off the right-hand edge. */}
      <p className="plan-hint">
        <Icon name="arrow-right" size={14} />
        Scroll to see the whole room
        {zones.length > 1 ? <span className="plan-hint__zones">{zones.join(" · ")}</span> : null}
      </p>
    </div>
  );
}
