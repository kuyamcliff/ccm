import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { MenuItem } from "~/lib/api";
import { orderable, priceBasket } from "./basketPricing";

/** A dish exactly as the *public* menu returns one: no `is_active`, no `position`. */
function publicDish(over: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 1,
    category: "Grill",
    name: "Grilled chicken",
    description: "",
    price_fcfa: 2500,
    price_label: null,
    image_url: null,
    sold_out: 0,
    dietary_tags: "",
    ...over,
  };
}

test("a dish off the public menu is orderable even though is_active is absent", () => {
  const dish = publicDish();
  assert.equal(dish.is_active, undefined, "the fixture must match what the server actually sends");
  assert.equal(orderable(dish), true);
});

test("the basket keeps its lines when priced against the public menu", () => {
  /* The regression. Every line used to be dropped here, so somebody who added
     two dishes reached the checkout to be told both were off the menu. */
  const menu = [publicDish({ id: 1, price_fcfa: 2500 }), publicDish({ id: 2, price_fcfa: 500 })];
  const result = priceBasket([{ id: 1, qty: 2 }, { id: 2, qty: 1 }], menu);

  assert.equal(result.dropped, 0);
  assert.equal(result.lines.length, 2);
  assert.equal(result.subtotal, 2500 * 2 + 500);
});

test("a dish the console has switched off is still dropped", () => {
  const menu = [publicDish({ is_active: 0 })];
  const result = priceBasket([{ id: 1, qty: 1 }], menu);
  assert.equal(result.dropped, 1);
  assert.equal(result.lines.length, 0);
});

test("sold out, priced by weight, and gone from the menu are all dropped", () => {
  assert.equal(orderable(publicDish({ sold_out: 1 })), false);
  assert.equal(orderable(publicDish({ price_fcfa: null, price_label: "By weight" })), false);

  const gone = priceBasket([{ id: 99, qty: 1 }], [publicDish({ id: 1 })]);
  assert.equal(gone.dropped, 1);
  assert.equal(gone.subtotal, 0);
});

test("quantity multiplies the price, and the subtotal is the sum of the lines", () => {
  const menu = [publicDish({ id: 1, price_fcfa: 1500 })];
  const result = priceBasket([{ id: 1, qty: 3 }], menu);
  assert.equal(result.lines[0]?.lineTotal, 4500);
  assert.equal(result.subtotal, 4500);
});
