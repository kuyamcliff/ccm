import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decide, readMaintenance } from "./maintenance.js";

const ON = { enabled: true };
const OFF = { enabled: false };

describe("readMaintenance", () => {
  it("is off by default", () => {
    assert.deepEqual(readMaintenance(undefined), { enabled: false });
    assert.deepEqual(readMaintenance({}), { enabled: false });
  });

  it("is on only when the config says exactly true", () => {
    assert.equal(readMaintenance({ maintenance: { enabled: true } }).enabled, true);
    // Anything else is off. A site must not close itself because a value
    // arrived as the string "true" or a stray 1.
    assert.equal(readMaintenance({ maintenance: { enabled: "true" } }).enabled, false);
    assert.equal(readMaintenance({ maintenance: { enabled: 1 } }).enabled, false);
    assert.equal(readMaintenance({ maintenance: {} }).enabled, false);
  });

  it("survives a maintenance block that is not an object", () => {
    for (const value of ["on", 1, [], null]) {
      assert.equal(readMaintenance({ maintenance: value }).enabled, false);
    }
  });
});

describe("decide", () => {
  it("lets everything through when maintenance is off", () => {
    assert.equal(decide(OFF, "/api/reservations", undefined), "open");
    assert.equal(decide(OFF, "/api/menu", "user"), "open");
  });

  it("closes the ordinary customer endpoints", () => {
    for (const path of ["/api/reservations", "/api/takeaway", "/api/menu", "/api/waitlist", "/api/reviews"]) {
      assert.equal(decide(ON, path, undefined), "closed", `${path} must be closed`);
      assert.equal(decide(ON, path, "user"), "closed", `${path} must be closed for a signed-in customer too`);
    }
  });

  /*
   * Everything below is one rule: turning maintenance on must never lock the
   * owner out of turning it off again. Each case is a way that has actually
   * gone wrong in products that shipped this feature.
   */

  it("lets staff through", () => {
    for (const role of ["admin", "super_admin", "owner"]) {
      assert.equal(decide(ON, "/api/admin/stats", role), "open", `${role} must get through`);
      assert.equal(decide(ON, "/api/reservations", role), "open", `${role} must see the customer side too`);
    }
  });

  it("keeps signing in open, so a signed-out owner can become staff", () => {
    assert.equal(decide(ON, "/api/auth/login", undefined), "open");
    assert.equal(decide(ON, "/api/auth/me", undefined), "open");
    assert.equal(decide(ON, "/api/auth/logout", undefined), "open");
  });

  it("keeps the settings readable, so the console can render the switch that turns this off", () => {
    assert.equal(decide(ON, "/api/site-settings", undefined), "open");
  });

  it("keeps the health check open, so the platform does not stop routing to us", () => {
    // A 503 here and the host decides the service is dead, taking the console
    // down with the site and leaving nobody able to turn maintenance off.
    assert.equal(decide(ON, "/api/health", undefined), "open");
  });

  it("keeps account recovery open, so a locked-out owner is not locked out twice", () => {
    assert.equal(decide(ON, "/api/recovery/status", undefined), "open");
  });

  it("does not let a path merely starting with the same letters through", () => {
    // "/api/authorised-dealers" is not "/api/auth".
    assert.equal(decide(ON, "/api/authorised", undefined), "closed");
    assert.equal(decide(ON, "/api/site-settings-export", undefined), "closed");
    assert.equal(decide(ON, "/api/healthy-eating", undefined), "closed");
  });

  it("does not treat an unknown role as staff", () => {
    assert.equal(decide(ON, "/api/reservations", "manager"), "closed");
    assert.equal(decide(ON, "/api/reservations", ""), "closed");
  });
});
