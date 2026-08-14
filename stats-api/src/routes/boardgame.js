import { Router } from "express";
import { pool } from "../db.js";
import { ensureBoardgameSchema } from "../utils/boardgame-schema.js";

export const boardgameRouter = Router();

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeMode(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9-]/g, "");
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

    await ensureBoardgameSchema();

    await pool.query(
      `insert into boardgame_play_events
       (session_id, mode, mode_label, source)
       values ($1, $2, $3, $4)`,
      [
        normalizeText(sessionId),
        normalizedMode,
        normalizeText(modeLabel) || normalizedMode,
        normalizeText(source) || null,
      ]
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
