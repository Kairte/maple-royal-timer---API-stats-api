import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { mapleRouter } from "./maple.js";

test("profile bundle reports upstream timings and bounds stalled requests", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.NEXON_OPEN_API_KEY;
  const originalBaseUrl = process.env.NEXON_MAPLE_API_BASE_URL;
  const originalTimeout = process.env.NEXON_MAPLE_FETCH_TIMEOUT_MS;
  const app = express();
  app.use("/api/maple", mapleRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/maple/profile-bundle?characterName=Test`;

  t.after(async () => {
    globalThis.fetch = originalFetch;
    for (const [key, value] of [
      ["NEXON_OPEN_API_KEY", originalKey],
      ["NEXON_MAPLE_API_BASE_URL", originalBaseUrl],
      ["NEXON_MAPLE_FETCH_TIMEOUT_MS", originalTimeout],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise((resolve) => server.close(resolve));
  });

  process.env.NEXON_OPEN_API_KEY = "test-key";
  process.env.NEXON_MAPLE_API_BASE_URL = "https://mock-maple.test";
  process.env.NEXON_MAPLE_FETCH_TIMEOUT_MS = "1000";
  const paths = [];
  globalThis.fetch = async (input, options) => {
    const target = String(input);
    if (!target.startsWith("https://mock-maple.test")) return originalFetch(input, options);
    paths.push(new URL(target).pathname);
    if (target.includes("/id?")) return Response.json({ ocid: "test-ocid" });
    if (target.includes("/character/basic?")) return Response.json({ character_name: "Test", character_level: 100, character_class: "제로", unused_basic_data: "not-for-client" });
    return Response.json({
      character_hair: { hair_name: "Alpha Hair" },
      additional_character_hair: { hair_name: "Beta Hair" },
      character_face: { face_name: "Alpha Face" },
      additional_character_face: { face_name: "Beta Face" },
      unused_beauty_data: "not-for-client",
    });
  };

  const ping = await originalFetch(url.replace("/profile-bundle?characterName=Test", "/ping"));
  assert.equal(ping.status, 200);
  assert.deepEqual(await ping.json(), { ok: true });
  assert.equal(ping.headers.get("cache-control"), "no-store");
  assert.equal(paths.length, 0);

  const success = await originalFetch(url);
  assert.equal(success.status, 200);
  const successPayload = await success.json();
  assert.equal(successPayload.characterName, "Test");
  assert.equal(successPayload.zeroAppearanceSources.alpha.hair.name, "Alpha Hair");
  assert.equal(successPayload.zeroAppearanceSources.beta.hair.name, "Beta Hair");
  assert.equal(successPayload.zeroAppearanceSources.alpha.face.name, "Alpha Face");
  assert.equal(successPayload.zeroAppearanceSources.beta.face.name, "Beta Face");
  assert.equal(Object.hasOwn(successPayload, "raw"), false);
  assert.equal(Object.hasOwn(successPayload, "debugZeroAppearance"), false);
  assert.deepEqual(paths.sort(), ["/character/basic", "/character/beauty-equipment", "/id"]);
  assert.match(success.headers.get("server-timing"), /profile_cache;desc="MISS", ocid_cache;desc="MISS", id;dur=\d+\.\d, basic;dur=\d+\.\d, beauty;dur=\d+\.\d, total;dur=\d+\.\d/);

  const cached = await originalFetch(url);
  assert.equal(cached.status, 200);
  assert.equal((await cached.json()).characterName, "Test");
  assert.equal(paths.length, 3);
  assert.match(cached.headers.get("server-timing"), /profile_cache;desc="HIT", ocid_cache;desc="SKIP", total;dur=/);

  const otherWorld = await originalFetch(`${url}&world=Scania`);
  assert.equal(otherWorld.status, 200);
  assert.equal((await otherWorld.json()).worldName, "Scania");
  assert.equal(paths.filter((path) => path === "/id").length, 1);
  assert.equal(paths.length, 5);
  assert.match(otherWorld.headers.get("server-timing"), /profile_cache;desc="MISS", ocid_cache;desc="HIT", basic;dur=/);

  process.env.NEXON_MAPLE_FETCH_TIMEOUT_MS = "20";
  globalThis.fetch = async (input, options) => {
    if (!String(input).startsWith("https://mock-maple.test")) return originalFetch(input, options);
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
  };

  const timedOut = await originalFetch(url.replace("characterName=Test", "characterName=Stalled"));
  assert.equal(timedOut.status, 504);
  assert.equal((await timedOut.json()).message, "Maple Open API request timed out.");
  assert.match(timedOut.headers.get("server-timing"), /profile_cache;desc="MISS", ocid_cache;desc="MISS", id;dur=\d+\.\d, total;dur=\d+\.\d/);
});
