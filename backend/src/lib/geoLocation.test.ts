import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { geoLocationAvailable, isPubliclyLocatable, locateIp } from "./geoLocation.js";

describe("isPubliclyLocatable", () => {
  it("rules out loopback and private ranges", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.255", "::1", "fd00::1", "fc00::1"]) {
      assert.equal(isPubliclyLocatable(ip), false, `${ip} should not be looked up`);
    }
  });

  it("does not reject a public address that merely starts similarly", () => {
    // 172.32.x.x is outside the private 172.16-172.31 block and is a real,
    // routable address — a sloppy prefix match would wrongly swallow it.
    assert.equal(isPubliclyLocatable("172.32.0.1"), true);
    assert.equal(isPubliclyLocatable("8.8.8.8"), true);
    assert.equal(isPubliclyLocatable("41.202.219.10"), true);
  });

  it("rejects the sentinels this codebase uses for 'no address'", () => {
    assert.equal(isPubliclyLocatable(""), false);
    assert.equal(isPubliclyLocatable("unknown"), false);
  });
});

describe("geoLocationAvailable", () => {
  it("is off by default, with no token in the test environment", () => {
    // The whole point of gating this behind an env var: nothing calls out
    // until an owner deliberately sets IPINFO_TOKEN.
    assert.equal(geoLocationAvailable(), false);
  });
});

describe("locateIp", () => {
  it("never looks anything up while no token is configured", async () => {
    // Same guarantee from the effectful side: a public IP with no token set
    // must come back null, not attempt a network call.
    assert.equal(await locateIp("8.8.8.8"), null);
  });

  it("never throws, even on a malformed address", async () => {
    await assert.doesNotReject(() => locateIp("not-an-ip-at-all"));
  });
});
