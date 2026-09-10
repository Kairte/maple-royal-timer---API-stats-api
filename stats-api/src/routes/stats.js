import { Router } from "express";
import { pool } from "../db.js";
import { ensureBoardgameSchema } from "../utils/boardgame-schema.js";

export const statsRouter = Router();

function toPercent(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

statsRouter.get("/boardgames", async (req, res, next) => {
  try {
    const requestedDays = Number.parseInt(req.query.days, 10);
    const days = Number.isFinite(requestedDays)
      ? Math.min(Math.max(requestedDays, 1), 365)
      : 30;
    const canonicalModeExpr = "case when mode = 'mandara' then 'mandala' else mode end";
    const countedModeClause = "mode <> 'error'";
    const periodClause = `(created_at at time zone 'Asia/Seoul')::date >=
      ((now() at time zone 'Asia/Seoul')::date - ($1::int - 1))`;

    await ensureBoardgameSchema();

    const [overviewResult, modesResult, dailyResult, devicesResult] = await Promise.all([
      pool.query(
        `select
           count(*) filter (where ${periodClause})::int as "periodPlays",
           count(*)::int as "allTimePlays",
           count(distinct session_id) filter (where ${periodClause})::int as "uniqueSessions",
           count(distinct ${canonicalModeExpr}) filter (where ${periodClause})::int as "activeModes"
         from boardgame_play_events
         where ${countedModeClause}`,
        [days]
      ),
      pool.query(
        `with mode_counts as (
           select
             ${canonicalModeExpr} as "gameMode",
             count(*)::int as "playCount",
             count(distinct session_id)::int as "uniqueSessions"
           from boardgame_play_events
           where ${periodClause}
             and ${countedModeClause}
           group by ${canonicalModeExpr}
         ), totals as (
           select coalesce(sum("playCount"), 0)::int as total from mode_counts
         )
         select
           "gameMode",
           "playCount",
           "uniqueSessions",
           case when totals.total = 0 then 0
             else round(("playCount"::numeric / totals.total::numeric) * 100, 1)
           end as "sharePercent"
         from mode_counts
         cross join totals
         order by "playCount" desc, "gameMode" asc`,
        [days]
      ),
      pool.query(
        `with dates as (
           select generate_series(
             (now() at time zone 'Asia/Seoul')::date - ($1::int - 1),
             (now() at time zone 'Asia/Seoul')::date,
             interval '1 day'
           )::date as day
         ), daily_counts as (
           select
             (created_at at time zone 'Asia/Seoul')::date as day,
             count(*)::int as count
           from boardgame_play_events
           where ${periodClause}
             and ${countedModeClause}
           group by (created_at at time zone 'Asia/Seoul')::date
         )
         select to_char(dates.day, 'YYYY-MM-DD') as date, coalesce(daily_counts.count, 0)::int as count
         from dates
         left join daily_counts using (day)
         order by dates.day asc`,
        [days]
      ),
      pool.query(
        `select
           case when device_type in ('desktop', 'mobile', 'tablet') then device_type else 'unknown' end as "deviceType",
           count(*)::int as "playCount"
         from boardgame_play_events
         where ${periodClause}
           and ${countedModeClause}
         group by 1
         order by "playCount" desc`,
        [days]
      ),
    ]);

    const overview = overviewResult.rows[0] || {};
    const periodPlays = Number(overview.periodPlays || 0);

    return res.json({
      ok: true,
      days,
      overview: {
        periodPlays,
        allTimePlays: Number(overview.allTimePlays || 0),
        uniqueSessions: Number(overview.uniqueSessions || 0),
        activeModes: Number(overview.activeModes || 0),
        dailyAverage: toPercent(periodPlays / days),
      },
      modes: modesResult.rows.map((row) => ({
        ...row,
        playCount: Number(row.playCount || 0),
        uniqueSessions: Number(row.uniqueSessions || 0),
        sharePercent: toPercent(row.sharePercent),
      })),
      daily: dailyResult.rows,
      devices: devicesResult.rows,
    });
  } catch (error) {
    return next(error);
  }
});

statsRouter.get("/items/:itemKey", async (req, res, next) => {
  try {
    const { itemKey } = req.params;

    const itemResult = await pool.query(
      `select item_key as "itemKey", name, category, item_type as "itemType", image_url as "imageUrl"
       from items
       where item_key = $1`,
      [itemKey]
    );

    const quizChosen = await pool.query(
      `select count(*)::int as count
       from quiz_events
       where chosen_item_key = $1`,
      [itemKey]
    );

    const quizCorrect = await pool.query(
      `select count(*)::int as count
       from quiz_events
       where chosen_item_key = $1 and is_correct = true`,
      [itemKey]
    );

    const awardsChosen = await pool.query(
      `select count(*)::int as count
       from awards_events
       where chosen_item_key = $1`,
      [itemKey]
    );

    return res.json({
      item: itemResult.rows[0] || null,
      itemKey,
      quizChosenCount: quizChosen.rows[0]?.count || 0,
      quizCorrectCount: quizCorrect.rows[0]?.count || 0,
      awardsChosenCount: awardsChosen.rows[0]?.count || 0,
    });
  } catch (error) {
    return next(error);
  }
});

statsRouter.get("/rankings", async (req, res, next) => {
  try {
    const category = String(req.query.category || "").toLowerCase();
    const type = String(req.query.type || "awards").toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    if (!category) {
      return res.status(400).json({ ok: false, message: "category is required." });
    }

    const sql = type === "quiz"
      ? `select q.chosen_item_key as "itemKey", i.name, i.image_url as "imageUrl", count(*)::int as count
         from quiz_events q
         left join items i on i.item_key = q.chosen_item_key
         where q.quiz_category = $1
         group by q.chosen_item_key, i.name, i.image_url
         order by count desc, i.name asc
         limit $2`
      : `select a.chosen_item_key as "itemKey", i.name, i.image_url as "imageUrl", count(*)::int as count
         from awards_events a
         left join items i on i.item_key = a.chosen_item_key
         where a.awards_category = $1
         group by a.chosen_item_key, i.name, i.image_url
         order by count desc, i.name asc
         limit $2`;

    const result = await pool.query(sql, [category, limit]);
    return res.json({ category, type, items: result.rows });
  } catch (error) {
    return next(error);
  }
});

statsRouter.get("/dashboard-rankings", async (req, res, next) => {
  try {
    const category = String(req.query.category || "").toLowerCase();
    const view = String(req.query.view || "awards").toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    if (!category) {
      return res.status(400).json({ ok: false, message: "category is required." });
    }

    if (view === "boardgame") {
      await ensureBoardgameSchema();

      const canonicalModeExpr = "case when mode = 'mandara' then 'mandala' else mode end";
      const modeFilter = category === "all" ? "" : (category === "mandara" ? "mandala" : category);
      const params = modeFilter ? [modeFilter, limit] : [limit];
      const whereClause = `where mode <> 'error'${modeFilter ? ` and ${canonicalModeExpr} = $1` : ""}`;
      const limitParam = modeFilter ? "$2" : "$1";

      const result = await pool.query(
        `with ranked as (
           select
             ${canonicalModeExpr} as mode,
             case
               when ${canonicalModeExpr} = 'mandala' then 'MANDALA'
               else coalesce(nullif(max(mode_label), ''), ${canonicalModeExpr})
             end as "modeLabel",
             count(*)::int as count,
             max(created_at) as "lastPlayedAt"
           from boardgame_play_events
           ${whereClause}
           group by ${canonicalModeExpr}
         ),
         totals as (
           select coalesce(sum(count), 0)::int as total from ranked
         )
         select
           mode,
           "modeLabel",
           count,
           "lastPlayedAt",
           case
             when totals.total = 0 then 0
             else round((ranked.count::numeric / totals.total::numeric) * 100, 1)
           end as "sharePercent"
         from ranked
         cross join totals
         order by ranked.count desc, ranked.mode asc
         limit ${limitParam}`,
        params
      );

      const totalResult = await pool.query(
        `select count(*)::int as count
         from boardgame_play_events
         ${whereClause}`,
        modeFilter ? [modeFilter] : []
      );

      const totalEvents = totalResult.rows[0]?.count || 0;
      const items = result.rows.map((row) => ({
        ...row,
        itemKey: row.mode,
        name: row.modeLabel,
        sharePercent: toPercent(row.sharePercent),
      }));
      const topShare = items[0]?.sharePercent || 0;

      return res.json({
        ok: true,
        view,
        category,
        totalEvents,
        itemCount: items.length,
        summary: [
          `Total plays ${totalEvents}`,
          `Modes ${items.length}`,
          `Top share ${topShare}%`,
        ],
        items,
      });
    }

    if (view === "quiz") {
      const result = await pool.query(
        `with ranked as (
           select
             q.chosen_item_key as "itemKey",
             coalesce(i.name, q.chosen_item_key) as name,
             i.image_url as "imageUrl",
             count(*)::int as "totalChosenCount",
             count(*) filter (where q.is_correct = false)::int as "wrongCount"
           from quiz_events q
           left join items i on i.item_key = q.chosen_item_key
           where q.quiz_category = $1
           group by q.chosen_item_key, i.name, i.image_url
         )
         select
           "itemKey",
           name,
           "imageUrl",
           "totalChosenCount",
           "wrongCount",
           case
             when "totalChosenCount" = 0 then 0
             else round(("wrongCount"::numeric / "totalChosenCount"::numeric) * 100, 1)
           end as "wrongRate"
         from ranked
         where "wrongCount" > 0
         order by "wrongRate" desc, "wrongCount" desc, name asc
         limit $2`,
        [category, limit]
      );

      const totalResult = await pool.query(
        `select count(*)::int as count
         from quiz_events
         where quiz_category = $1`,
        [category]
      );

      const totalEvents = totalResult.rows[0]?.count || 0;
      const items = result.rows.map((row) => ({
        ...row,
        wrongRate: toPercent(row.wrongRate),
      }));
      const averageWrongRate = items.length
        ? toPercent(items.reduce((sum, row) => sum + Number(row.wrongRate || 0), 0) / items.length)
        : 0;

      return res.json({
        ok: true,
        view,
        category,
        totalEvents,
        itemCount: items.length,
        summary: [
          `총 응답 ${totalEvents}건`,
          `집계 아이템 ${items.length}개`,
          `평균 오답률 ${averageWrongRate}%`,
        ],
        items,
      });
    }

    const result = await pool.query(
      `with ranked as (
         select
           a.chosen_item_key as "itemKey",
           coalesce(i.name, a.chosen_item_key) as name,
           i.image_url as "imageUrl",
           count(*)::int as count
         from awards_events a
         left join items i on i.item_key = a.chosen_item_key
         where a.awards_category = $1
         group by a.chosen_item_key, i.name, i.image_url
       ),
       totals as (
         select coalesce(sum(count), 0)::int as total from ranked
       )
       select
         ranked."itemKey",
         ranked.name,
         ranked."imageUrl",
         ranked.count,
         case
           when totals.total = 0 then 0
           else round((ranked.count::numeric / totals.total::numeric) * 100, 1)
         end as "sharePercent"
       from ranked
       cross join totals
       order by ranked.count desc, ranked.name asc
       limit $2`,
      [category, limit]
    );

    const totalResult = await pool.query(
      `select count(*)::int as count
       from awards_events
       where awards_category = $1`,
      [category]
    );

    const totalEvents = totalResult.rows[0]?.count || 0;
    const items = result.rows.map((row) => ({
      ...row,
      sharePercent: toPercent(row.sharePercent),
    }));
    const topShare = items[0]?.sharePercent || 0;

    return res.json({
      ok: true,
      view,
      category,
      totalEvents,
      itemCount: items.length,
      summary: [
        `총 선택 ${totalEvents}표`,
        `집계 아이템 ${items.length}개`,
        `1위 점유율 ${topShare}%`,
      ],
      items,
    });
  } catch (error) {
    return next(error);
  }
});
