import { Router } from "express";
import { pool } from "../db.js";
import { upsertItem } from "../utils/items.js";

export const awardsRouter = Router();

awardsRouter.post("/", async (req, res, next) => {
  try {
    const {
      sessionId,
      awardsCategory,
      roundName,
      groupName,
      matchupId,
      leftItem,
      rightItem,
      chosenItem,
    } = req.body;

    if (!sessionId || !awardsCategory || !roundName || !chosenItem?.itemKey) {
      return res.status(400).json({ ok: false, message: "Missing required awards event fields." });
    }

    await Promise.all([
      upsertItem(leftItem, awardsCategory),
      upsertItem(rightItem, awardsCategory),
      upsertItem(chosenItem, awardsCategory),
    ]);

    await pool.query(
      `insert into awards_events
       (session_id, awards_category, round_name, group_name, matchup_id, left_item_key, right_item_key, chosen_item_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        sessionId,
        String(awardsCategory).toLowerCase(),
        String(roundName).toLowerCase(),
        groupName || null,
        matchupId || null,
        leftItem?.itemKey || null,
        rightItem?.itemKey || null,
        chosenItem.itemKey,
      ]
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
