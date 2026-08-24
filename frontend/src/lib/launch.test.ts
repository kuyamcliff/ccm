import { strict as assert } from "node:assert";
import { test } from "node:test";
import { basenameFor, enteredViaPreview, PREVIEW_PREFIX } from "./launch.js";

test("the preview prefix is recognised, and nothing else is", () => {
  assert.equal(enteredViaPreview("/admin"), true);
  assert.equal(enteredViaPreview("/admin/"), true);
  assert.equal(enteredViaPreview("/admin/desk/dev"), true);

  /* The near misses matter: a dish called "administration" must not put a
     customer into the staff preview. */
  assert.equal(enteredViaPreview("/"), false);
  assert.equal(enteredViaPreview("/menu"), false);
  assert.equal(enteredViaPreview("/administration"), false);
  assert.equal(enteredViaPreview("/admins"), false);
});

test("the basename follows how somebody arrived, not whether the site is live", () => {
  assert.equal(basenameFor(true), PREVIEW_PREFIX);

  /*
   * The case that was wrong, and the reason this takes arrival rather than
   * liveness: a stranger at the root of a site that has not launched. Answering
   * the prefix gave the router a basename that did not contain the location,
   * and a router in that state renders nothing at all. Not a holding page, not
   * an error. A blank screen.
   */
  assert.equal(basenameFor(false), "/");
});
