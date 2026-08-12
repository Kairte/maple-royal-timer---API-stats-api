import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARDGAME_MODES,
  isKnownBoardgameMode,
  isValidEventToken,
  normalizeBoardgameMode,
  normalizeBoardgameVariant,
  normalizeDeviceType,
} from "../src/utils/boardgames.js";

test("the board-game allowlist contains all 13 released modes", () => {
  assert.equal(BOARDGAME_MODES.length, 13);
  assert.equal(new Set(BOARDGAME_MODES).size, 13);
  assert.equal(isKnownBoardgameMode("classic"), true);
  assert.equal(isKnownBoardgameMode("ritual"), true);
});

test("mode and variant values are normalized for storage", () => {
  assert.equal(normalizeBoardgameMode(" CLASSIC MODE "), "classic");
  assert.equal(normalizeBoardgameMode("QUINTER9"), "quinter9");
  assert.equal(normalizeBoardgameVariant(" HARD MODE "), "hard-mode");
  assert.equal(normalizeBoardgameVariant(""), null);
});

test("unknown device values fall back without rejecting the event", () => {
  assert.equal(normalizeDeviceType("MOBILE"), "mobile");
  assert.equal(normalizeDeviceType("television"), "unknown");
});

test("event tokens follow the database length constraints", () => {
  assert.equal(isValidEventToken("12345678"), true);
  assert.equal(isValidEventToken("short"), false);
  assert.equal(isValidEventToken("x".repeat(129)), false);
});
