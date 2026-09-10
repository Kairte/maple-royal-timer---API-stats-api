import { Router } from "express";
import { pool } from "../db.js";
import { ensureBoardgameSchema } from "../utils/boardgame-schema.js";

export const boardgameRouter = Router();

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeMode(value) {
  const normalized = normalizeText(value).toLowerCase().replace(/[^a-z0-9-]/g, "");
  return normalized === "mandara" ? "mandala" : normalized;
}

function detectDeviceType(req) {
  const mobileHint = String(req.get("sec-ch-ua-mobile") || "").toLowerCase();
  const userAgent = String(req.get("user-agent") || "").toLowerCase();

  if (/ipad|tablet|kindle|silk/.test(userAgent) || (/android/.test(userAgent) && !/mobile/.test(userAgent))) {
    return "tablet";
  }
  if (mobileHint === "?1" || /mobile|iphone|ipod|android/.test(userAgent)) {
    return "mobile";
  }
  return userAgent ? "desktop" : "unknown";
}

boardgameRouter.post("/", async (req, res, next) => {
  try {
    const {
      sessionId,
      mode,
      modeLabel,
      source,
    } = req.body;

    const normalizedMode = normalizeMode(mode);
    if (!sessionId || !normalizedMode) {
      return res.status(400).json({ ok: false, message: "Missing required boardgame event fields." });
    }
    if (normalizedMode === "error") {
      return res.status(202).json({ ok: true, ignored: true });
    }

    await ensureBoardgameSchema();

    await pool.query(
      `insert into boardgame_play_events
       (session_id, mode, mode_label, source, device_type)
       values ($1, $2, $3, $4, $5)`,
      [
        normalizeText(sessionId),
        normalizedMode,
        normalizeText(modeLabel) || normalizedMode,
        normalizeText(source) || null,
        detectDeviceType(req),
      ]
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
