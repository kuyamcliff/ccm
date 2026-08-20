/**
 * Fills a *local* database with enough realistic content to actually use the
 * product: a menu, a room with tables, an owner and a customer.
 *
 *   npm run db:seed
 *
 * This exists so that local development and end-to-end testing do not require
 * a copy of production data. It refuses to run when NODE_ENV is production,
 * and it never touches a database that already has content — running it twice
 * is a no-op rather than a pile of duplicate menu items.
 *
 * The accounts it creates are development credentials and are printed to the
 * terminal on purpose. They are not secrets and must never exist in a
 * deployed environment, which is what the production guard below enforces.
 */
import bcrypt from "bcryptjs";
import { db, pool } from "../src/db.js";
import { IS_PROD } from "../src/config.js";

const OWNER_EMAIL = "owner@camchopmeat.test";
const CUSTOMER_EMAIL = "customer@camchopmeat.test";
const PASSWORD = "Grilled-Goat-9481-Buea";

const MENU: [category: string, name: string, description: string, price: number | null, label: string | null, tags: string][] = [
  ["Grill", "Grilled chicken", "Half a chicken over the coals, with pepper and a wedge of lime.", 3500, null, '["spicy"]'],
  ["Grill", "Grilled pork", "Shoulder, marinated overnight and cut to order.", 4000, null, "[]"],
  ["Grill", "Goat", "Sold by weight and settled at the counter once it is weighed.", null, "By weight", "[]"],
  ["Grill", "Pork ribs", "A full rack, slow over the fire.", 4500, null, "[]"],
  ["Sides", "Fried plantain", "Sweet, fried to order.", 1000, null, '["vegetarian","vegan"]'],
  ["Sides", "Jollof rice", "One pot, smoky.", 1500, null, '["vegetarian"]'],
  ["Sides", "Miondo", "Steamed cassava sticks.", 500, null, '["vegetarian","vegan"]'],
  ["Drinks", "Soft drink", "Chilled, whatever is in the fridge.", 700, null, "[]"],
  ["Drinks", "Beer", "Cold, 65cl.", 1200, null, "[]"],
  ["Drinks", "Water", "50cl bottle.", 500, null, '["vegetarian","vegan"]'],
];

const TABLES: [label: string, capacity: number, zone: string, x: number, y: number][] = [
  ["T1", 2, "Window", 120, 120],
  ["T2", 2, "Window", 260, 120],
  ["T3", 4, "Window", 400, 120],
  ["T4", 4, "Middle", 120, 300],
  ["T5", 6, "Middle", 300, 300],
  ["T6", 6, "Garden", 480, 300],
  ["T7", 8, "Garden", 200, 470],
  ["T8", 10, "Garden", 420, 470],
];

const FIXTURES: [kind: string, label: string, x: number, y: number, w: number, h: number][] = [
  ["grill", "The fire", 560, 120, 110, 90],
  ["door", "Way in", 60, 470, 80, 60],
  ["bar", "Bar", 560, 470, 100, 80],
  ["toilets", "Toilets", 620, 300, 80, 70],
];

async function count(table: string): Promise<number> {
  const row = (await db.prepare(`SELECT count(*)::int AS n FROM ${table}`).get()) as { n: number } | undefined;
  return row?.n ?? 0;
}

async function main(): Promise<void> {
  if (IS_PROD) {
    console.error("Refusing to seed: NODE_ENV is production.");
    process.exitCode = 1;
    return;
  }

  const hash = await bcrypt.hash(PASSWORD, 10);

  if ((await count("users")) === 0) {
    await db
      .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'owner')")
      .run("Kuyam (owner)", OWNER_EMAIL, hash);
    await db
      .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'user')")
      .run("A Regular Customer", CUSTOMER_EMAIL, hash);
    console.log("Created owner and customer accounts.");
  } else {
    console.log("Users already present, left alone.");
  }

  if ((await count("menu_items")) === 0) {
    let position = 0;
    for (const [category, name, description, price, label, tags] of MENU) {
      await db
        .prepare(
          `INSERT INTO menu_items (category, name, description, price_fcfa, price_label, position, dietary_tags)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(category, name, description, price, label, position++, tags);
    }
    console.log(`Added ${MENU.length} menu items.`);
  } else {
    console.log("Menu already present, left alone.");
  }

  if ((await count("restaurant_tables")) === 0) {
    for (const [label, capacity, zone, x, y] of TABLES) {
      await db
        .prepare("INSERT INTO restaurant_tables (label, capacity, zone, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)")
        .run(label, capacity, zone, x, y);
    }
    console.log(`Added ${TABLES.length} tables.`);
  } else {
    console.log("Tables already present, left alone.");
  }

  if ((await count("floor_fixtures")) === 0) {
    for (const [kind, label, x, y, w, h] of FIXTURES) {
      await db
        .prepare("INSERT INTO floor_fixtures (kind, label, pos_x, pos_y, width, height) VALUES (?, ?, ?, ?, ?, ?)")
        .run(kind, label, x, y, w, h);
    }
    console.log(`Added ${FIXTURES.length} floor fixtures.`);
  }

  if ((await count("site_settings")) === 0) {
    const settings: [string, string][] = [
      ["phone", "677123456"],
      ["address", "Razel Street, opposite P and T school"],
      ["city", "Buea"],
      ["region", "South-West"],
      ["hours", "Every day, midday until late"],
      ["booking_deposit_fcfa", "2000"],
      ["late_cancel_fee_fcfa", "1500"],
      ["loyalty_point_value_fcfa", "10"],
      ["loyalty_min_redeem_points", "50"],
      ["loyalty_max_redeem_percent", "30"],
    ];
    for (const [key, value] of settings) {
      await db.prepare("INSERT INTO site_settings (key, value) VALUES (?, ?)").run(key, value);
    }
    console.log(`Added ${settings.length} site settings.`);
  }

  if ((await count("legal_pages")) === 0) {
    for (const slug of ["terms", "privacy"] as const) {
      const title = slug === "terms" ? "Terms" : "Privacy";
      await db
        .prepare("INSERT INTO legal_pages (slug, title, title_fr, body, body_fr) VALUES (?, ?, ?, ?, ?)")
        .run(slug, title, title, `## ${title}\n\nPlaceholder for local development only.`, `## ${title}\n\nContenu de développement.`);
    }
    console.log("Added local legal pages.");
  }

  console.log(`\nSigned-in development accounts (local only):`);
  console.log(`  owner     ${OWNER_EMAIL}  /  ${PASSWORD}`);
  console.log(`  customer  ${CUSTOMER_EMAIL}  /  ${PASSWORD}`);
  await pool.end();
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
  void pool.end();
});
