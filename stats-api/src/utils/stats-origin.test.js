import assert from "node:assert/strict";
import { isProductionStatsOrigin, requireProductionStatsOrigin } from "./stats-origin.js";

for (const origin of [
  "https://maplestoryhairfaceinfo.netlify.app",
  "https://mapleroyaltimer.com",
  "https://www.mapleroyaltimer.com",
]) {
  assert.equal(isProductionStatsOrigin(origin), true, origin);
}

for (const origin of [
  "http://localhost:8765",
  "http://127.0.0.1:8765",
  "null",
  "file://",
  "https://mapleroyaltimer.com.evil.example",
  "https://deploy-preview-1--maplestoryhairfaceinfo.netlify.app",
  "",
  undefined,
]) {
  assert.equal(isProductionStatsOrigin(origin), false, String(origin));
}

for (const origin of ["https://mapleroyaltimer.com", "http://localhost:8765", "null", undefined]) {
  let proceeded = false;
  let status;
  let body;
  requireProductionStatsOrigin({ get: () => origin }, {
    status(value) { status = value; return this; },
    json(value) { body = value; },
  }, () => { proceeded = true; });
  assert.equal(proceeded, isProductionStatsOrigin(origin));
  if (!proceeded) {
    assert.equal(status, 202);
    assert.deepEqual(body, { ok: true, ignored: true });
  }
}

console.log("Shared stats production origin tests passed.");
