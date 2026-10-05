import { Router } from "express";
import { pool } from "../db.js";
import { upsertItem } from "../utils/items.js";
import { requireProductionStatsOrigin } from "../utils/stats-origin.js";
import { ensureAwardsSchema } from "../utils/awards-schema.js";

export const awardsRouter = Router();

awardsRouter.post("/", requireProductionStatsOrigin, async (req, res, next) => {
  try {
    const {
      sessionId,
      awardsCategory,
      awardsMode = 'league',
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
    const mode = String(awardsMode).toLowerCase();
    if (!['quick', 'league', 'seize'].includes(mode)) {
      return res.status(400).json({ ok: false, message: 'Invalid awards mode.' });
    }
    await ensureAwardsSchema();

    await Promise.all([
      upsertItem(leftItem || undefined, awardsCategory),
      upsertItem(rightItem || undefined, awardsCategory),
      upsertItem(chosenItem, awardsCategory),
    ]);

    await pool.query(
      `insert into awards_events
       (session_id, awards_category, round_name, group_name, matchup_id, left_item_key, right_item_key, chosen_item_key, awards_mode)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        sessionId,
        String(awardsCategory).toLowerCase(),
        String(roundName).toLowerCase(),
        groupName || null,
        matchupId || null,
        leftItem?.itemKey || null,
        rightItem?.itemKey || null,
        chosenItem.itemKey,
        mode,
      ]
    );

    return res.status(201).json({ ok: true });
  } catch (error) {
    return next(error);
  }
});
