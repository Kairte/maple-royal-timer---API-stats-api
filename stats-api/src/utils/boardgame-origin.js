const BOARDGAME_PRODUCTION_ORIGINS = new Set([
  "https://maplestoryhairfaceinfo.netlify.app",
  "https://mapleroyaltimer.com",
  "https://www.mapleroyaltimer.com",
]);

export function isProductionBoardgameOrigin(origin) {
  return BOARDGAME_PRODUCTION_ORIGINS.has(String(origin || "").trim().toLowerCase());
}
