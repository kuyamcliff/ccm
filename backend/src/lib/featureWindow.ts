/**
 * Whether a scheduled feature is on right now.
 *
 * This exists twice — here and in the customer app's siteConfig.ts — because
 * the two are separate packages with separate builds. That duplication is a
 * liability, so the rules are stated once, here, and both sides are tested
 * against the same cases:
 *
 *   - the start is inclusive, the end is exclusive;
 *   - either end may be absent, and absent means unbounded on that side;
 *   - a window whose end is before its start is never open, rather than being
 *     quietly reinterpreted — an owner who typed the dates the wrong way round
 *     should see the feature off and go and fix it;
 *   - anything unparseable is ignored rather than guessed at, so a typo in one
 *     end does not take the feature down on its own;
 *   - the switch is the primary control and a schedule can only take away,
 *     never give.
 *
 * If either side changes, both change together. A button the customer app
 * hides but the API still accepts is not a disabled feature.
 */

export interface FeatureWindow {
  startAt: string | null;
  endAt: string | null;
}

/** Reads a window off untrusted config, or nothing if there is not one. */
export function readWindow(raw: unknown): FeatureWindow | null {
  if (!raw || typeof raw !== "object") return null;
  const { startAt, endAt } = raw as Record<string, unknown>;
  const start = instant(startAt);
  const end = instant(endAt);
  if (start === null && end === null) return null;
  return { startAt: start, endAt: end };
}

function instant(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function windowIsOpen(window: FeatureWindow, now: Date = new Date()): boolean {
  const at = now.getTime();
  if (Number.isNaN(at)) return false;
  const start = window.startAt === null ? null : Date.parse(window.startAt);
  const end = window.endAt === null ? null : Date.parse(window.endAt);
  if (start !== null && !Number.isNaN(start) && at < start) return false;
  if (end !== null && !Number.isNaN(end) && at >= end) return false;
  return true;
}

/**
 * The whole decision for one feature: its switch, narrowed by its schedule.
 *
 * `features` and `schedules` come straight off the stored config blob, so both
 * are untrusted and either may be missing entirely.
 */
export function featureIsOn(
  features: Record<string, unknown> | undefined,
  schedules: Record<string, unknown> | undefined,
  name: string,
  now: Date = new Date()
): boolean {
  /* Absent means on: a config written before a feature existed must not turn
     that feature off for everybody the day it ships. */
  if (features?.[name] === false) return false;
  const window = readWindow(schedules?.[name]);
  return window === null || windowIsOpen(window, now);
}
