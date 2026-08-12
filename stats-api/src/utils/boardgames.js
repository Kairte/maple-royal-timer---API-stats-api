export const BOARDGAME_MODES = Object.freeze([
  "classic",
  "joker",
  "baseball",
  "kaprekar",
  "quinter9",
  "blossom",
  "stella",
  "equinox",
  "overheat",
  "blizzard",
  "relic",
  "survival",
  "ritual",
]);

export const BOARDGAME_DEVICE_TYPES = Object.freeze([
  "desktop",
  "mobile",
  "tablet",
  "unknown",
]);

const modeSet = new Set(BOARDGAME_MODES);
const deviceTypeSet = new Set(BOARDGAME_DEVICE_TYPES);

export function normalizeBoardgameMode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+mode$/i, "")
    .replace(/\s+/g, "-");
}

export function normalizeBoardgameVariant(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return normalized || null;
}

export function normalizeDeviceType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return deviceTypeSet.has(normalized) ? normalized : "unknown";
}

export function isKnownBoardgameMode(value) {
  return modeSet.has(value);
}

export function isValidEventToken(value) {
  const length = String(value || "").trim().length;
  return length >= 8 && length <= 128;
}

export function isValidVariant(value) {
  return value === null || (value.length >= 1 && value.length <= 64);
}
