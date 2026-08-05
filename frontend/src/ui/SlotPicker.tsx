import { SLOTS } from "~/lib/api";
import { todayISO } from "~/lib/format";

/**
 * Picking a time to come and sit down.
 *
 * The booking flow only. Takeaway asks with a plain select, which is what the
 * owner wants there.
 *
 * Two things it does that a select cannot. It groups the day into the three
 * parts people actually think in, so somebody eating in the evening never
 * scrolls past the lunch service. And it drops any time that has already gone
 * today, so nobody picks half past six at seven and finds out at the door.
 */

const BLOCKS: { label: string; from: string; to: string }[] = [
  { label: "Midday", from: "09:00", to: "14:30" },
  { label: "Evening", from: "15:00", to: "19:30" },
  { label: "Late", from: "20:00", to: "22:30" },
];

/** True once the clock has passed the slot, and only for today. */
export function isPastSlot(date: string, slot: string): boolean {
  if (date !== todayISO()) return false;
  const now = new Date();
  const [hour, minute] = slot.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0) <= now.getHours() * 60 + now.getMinutes();
}

export function SlotPicker({
  date,
  value,
  onChange,
  emptyMessage,
}: {
  /** Which day the slots belong to, so "already gone" can be worked out. */
  date: string;
  value: string | null;
  onChange: (slot: string) => void;
  emptyMessage?: React.ReactNode;
}) {
  const usable = SLOTS.filter((slot) => !isPastSlot(date, slot));

  if (usable.length === 0) {
    return <>{emptyMessage ?? <p className="muted">There are no times left today.</p>}</>;
  }

  return (
    <div className="stack stack--loose">
      {BLOCKS.map((block) => {
        const slots = usable.filter((slot) => slot >= block.from && slot <= block.to);
        if (slots.length === 0) return null;

        return (
          <section key={block.label} className="stack stack--tight">
            <h3 className="label">{block.label}</h3>
            <div className="slots">
              {slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className="slot"
                  aria-pressed={slot === value}
                  onClick={() => onChange(slot)}
                >
                  {slot}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
