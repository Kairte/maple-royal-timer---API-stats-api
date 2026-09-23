import assert from "node:assert/strict";
import { isProductionBoardgameOrigin } from "./boardgame-origin.js";

for (const origin of [
  "https://maplestoryhairfaceinfo.netlify.app",
  "https://mapleroyaltimer.com",
  "https://www.mapleroyaltimer.com",
]) {
  assert.equal(isProductionBoardgameOrigin(origin), true, origin);
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
  assert.equal(isProductionBoardgameOrigin(origin), false, String(origin));
}

console.log("Boardgame production origin tests passed.");
