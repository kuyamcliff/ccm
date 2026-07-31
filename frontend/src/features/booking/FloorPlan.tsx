import { useMemo } from "react";
import type { DiningTable } from "~/lib/api";

/**
 * The room, laid out the way it actually is.
 *
 * Positions are stored in whatever coordinate space the owner dragged them
 * into in the console, so nothing here assumes a fixed canvas: the extent of
 * the tables is measured and mapped onto the available width. That way adding
 * a table out past the others rescales the plan instead of pushing it off the
 * edge.
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
    <div className="plan" style={{ aspectRatio: `${bounds.width} / ${bounds.height}` }}>
      {tables.map((table) => {
        const free = table.available !== false;
        const fits = table.capacity >= partySize;
        const pickable = free && fits;
        const selected = table.id === selectedId;

        return (
          <button
            key={table.id}
            type="button"
            className="plan__table"
            data-state={selected ? "picked" : pickable ? "free" : "blocked"}
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
            <span className="plan__label">{table.label}</span>
            <span className="plan__seats mono">{table.capacity}</span>
          </button>
        );
      })}

      {zones.length > 1 ? (
        <p className="plan__key fine faint">
          {zones.map((zone) => (
            <span key={zone}>{zone}</span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
