import "../env.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";

const migrationUrl = new URL(
  "../sql/migrations/20260813_create_boardgame_play_events.sql",
  import.meta.url,
);

if (!String(process.env.DATABASE_URL || "").trim()) {
  throw new Error("DATABASE_URL is required to run the board-game migration.");
}

try {
  const sql = await readFile(fileURLToPath(migrationUrl), "utf8");
  await pool.query(sql);
  console.log("Board-game play event migration completed.");
} finally {
  await pool.end();
}
