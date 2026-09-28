const STATS_PRODUCTION_ORIGINS = new Set([
  "https://maplestoryhairfaceinfo.netlify.app",
  "https://mapleroyaltimer.com",
  "https://www.mapleroyaltimer.com",
]);

export function isProductionStatsOrigin(origin) {
  return STATS_PRODUCTION_ORIGINS.has(String(origin || "").trim().toLowerCase());
}

export function requireProductionStatsOrigin(req, res, next) {
  if (!isProductionStatsOrigin(req.get("origin"))) {
    return res.status(202).json({ ok: true, ignored: true });
  }
  return next();
}
