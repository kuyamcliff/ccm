import { db } from "../db.js";

/*
 * Everything in the room that is not a table.
 *
 * A plan made only of bookable rectangles tells a guest where the tables are
 * but nothing about the room they sit in — which corner faces the screen, which
 * one is beside the grill and will be warm and loud. Those are the things
 * people actually choose a table by.
 *
 * The kinds are a closed list rather than free text: the plan draws each one
 * differently, and a fixture whose kind nothing recognises would be an unlabelled
 * grey box, which is worse than not showing it.
 */

export const FIXTURE_KINDS = ["grill", "tv", "bar", "door", "toilets", "kitchen", "speaker", "plant"] as const;

export type FixtureKind = (typeof FIXTURE_KINDS)[number];

export interface Fixture {
  id: number;
  kind: FixtureKind;
  label: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
}

export function isFixtureKind(value: unknown): value is FixtureKind {
  return typeof value === "string" && (FIXTURE_KINDS as readonly string[]).includes(value);
}

/** The canvas the console drags things around in. Shared with the guest plan. */
export const FLOOR_CANVAS = { width: 640, height: 560 };

/** Keeps a fixture on the floor however it was moved or sized. */
export function clampFixture(x: number, y: number, w: number, h: number) {
  const width = Math.round(Math.min(Math.max(w, 30), FLOOR_CANVAS.width));
  const height = Math.round(Math.min(Math.max(h, 30), FLOOR_CANVAS.height));
  return {
    pos_x: Math.round(Math.min(Math.max(x, 0), FLOOR_CANVAS.width)),
    pos_y: Math.round(Math.min(Math.max(y, 0), FLOOR_CANVAS.height)),
    width,
    height,
  };
}

export async function readFixtures(): Promise<Fixture[]> {
  try {
    return (await db
      .prepare("SELECT id, kind, label, pos_x, pos_y, width, height FROM floor_fixtures ORDER BY id")
      .all()) as unknown as Fixture[];
  } catch {
    /* The table is created at boot, but a plan is not worth failing to draw
       over a fixture list. An empty room is the old behaviour, which was fine. */
    return [];
  }
}
