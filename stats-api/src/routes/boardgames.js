import { Router } from "express";
import { pool } from "../db.js";
import {
  BOARDGAME_MODES,
  isKnownBoardgameMode,
  isValidEventToken,
  isValidVariant,
  normalizeBoardgameMode,
  normalizeBoardgameVariant,
  normalizeDeviceType,
} from "../utils/boardgames.js";

export const boardgameRouter = Router();

boardgameRouter.post("/", async (req, res, next) => {
  try {
    const eventId = String(req.body?.eventId || "").trim();
    const sessionId = String(req.body?.sessionId || "").trim();
    const gameMode = normalizeBoardgameMode(req.body?.gameMode);
    const gameVariant = normalizeBoardgameVariant(req.body?.gameVariant);
    const deviceType = normalizeDeviceType(req.body?.deviceType);

    if (!isValidEventToken(eventId) || !isValidEventToken(sessionId) || !gameMode) {
      return res.status(400).json({
        ok: false,
        message: "eventId, sessionId, and gameMode are required.",
      });
    }

    if (!isKnownBoardgameMode(gameMode)) {
      return res.status(400).json({
        ok: false,
        message: "Unknown board-game mode.",
        supportedModes: BOARDGAME_MODES,
      });
    }

    if (!isValidVariant(gameVariant)) {
      return res.status(400).json({
        ok: false,
        message: "gameVariant must be 64 characters or fewer.",
      });
    }

    const result = await pool.query(
      `insert into boardgame_play_events
       (event_id, session_id, game_mode, game_variant, device_type)
       values ($1, $2, $3, $4, $5)
       on conflict (event_id) do nothing
       returning id, created_at as "createdAt"`,
      [eventId, sessionId, gameMode, gameVariant, deviceType],
    );

    const inserted = result.rowCount === 1;
    return res.status(inserted ? 201 : 200).json({
      ok: true,
      inserted,
      duplicate: !inserted,
      gameMode,
      gameVariant,
      deviceType,
      createdAt: result.rows[0]?.createdAt || null,
    });
  } catch (error) {
    return next(error);
  }
});

boardgameRouter.get("/modes", (_req, res) => {
  return res.json({ ok: true, modes: BOARDGAME_MODES });
});
