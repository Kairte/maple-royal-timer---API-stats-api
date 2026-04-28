import { Router } from "express";
import { pool } from "../db.js";
import { upsertItem } from "../utils/items.js";

export const quizRouter = Router();

quizRouter.post("/", async (req, res, next) => {
  try {
    const {
      sessionId,
      quizCategory,
      leftItem,
      rightItem,
      chosenItem,
      isCorrect,
      responseMs,
    } = req.body;

    if (!sessionId || !quizCategory || !chosenItem?.itemKey) {
      return res.status(400).json({ ok: false, message: "Missing required quiz event fields." });
    }

    await Promise.all([
      upsertItem(leftItem, quizCategory),
      upsertItem(rightItem, quizCategory),
      upsertItem(chosenItem, quizCategory),
    ]);

    await pool.query(
      `insert into quiz_events
       (session_id, quiz_category, left_item_key, right_item_key, chosen_item_key, is_correct, response_ms)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        sessionId,
        String(quizCategory).toLowerCase(),
        leftItem?.itemKey || null,
        rightItem?.itemKey || null,
        chosenItem.itemKey,
        Boolean(isCorrect),
        Number.isFinite(responseMs) ? Math.max(0, Math.round(responseMs)) : null,
      ]
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
