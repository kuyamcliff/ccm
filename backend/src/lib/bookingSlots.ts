/**
 * Slot arithmetic for suggesting a way out of a booking clash.
 *
 * Deliberately free of any database import so it can be reasoned about, and
 * tested, on its own — the queries that feed it live in bookingAlternatives.ts.
 */

/** How many suggestions of each kind to offer. More is a list to read, not a
    choice to make. */
export const ALTERNATIVE_LIMIT = 3;

/** Slots either side of the wanted one that are worth suggesting: two hours.
    Beyond that it is not a near miss, it is a different evening, and the guest
    should pick that themselves rather than be nudged into it. */
const REACH = 4;

/**
 * The slots nearest `wanted` that nobody has taken.
 *
 * Ordered by how far they are from what the guest asked for, so the first
 * suggestion is the smallest change to their evening. A tie goes to the later
 * slot: somebody who planned to arrive at 19:30 can usually still make 20:00,
 * and often cannot make 19:00.
 *
 * `earliest` drops slots that have already gone by, so a refusal at seven in
 * the evening never offers the guest lunchtime.
 */
export function nearbySlots(
  all: readonly string[],
  wanted: string,
  taken: ReadonlySet<string>,
  earliest: string | null,
  limit = ALTERNATIVE_LIMIT
): string[] {
  const wantedIndex = all.indexOf(wanted);
  if (wantedIndex < 0) return [];

  const candidates: { slot: string; distance: number; later: boolean }[] = [];
  for (let offset = 1; offset <= REACH; offset++) {
    for (const index of [wantedIndex + offset, wantedIndex - offset]) {
      const slot = all[index];
      if (slot === undefined) continue;
      if (taken.has(slot)) continue;
      if (earliest !== null && slot < earliest) continue;
      candidates.push({ slot, distance: offset, later: index > wantedIndex });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance || Number(b.later) - Number(a.later));
  return candidates.slice(0, limit).map((c) => c.slot);
}
