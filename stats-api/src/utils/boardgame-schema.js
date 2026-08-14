import { pool } from "../db.js";

let ensureBoardgameSchemaPromise = null;

export function ensureBoardgameSchema() {
  if (!ensureBoardgameSchemaPromise) {
    ensureBoardgameSchemaPromise = pool.query(`
      create table if not exists boardgame_play_events (
        id bigserial primary key,
        session_id text not null,
        mode text not null,
        mode_label text not null,
        source text,
        created_at timestamptz not null default now()
      );

      create index if not exists idx_boardgame_play_events_mode
        on boardgame_play_events(mode);

      create index if not exists idx_boardgame_play_events_created_at
        on boardgame_play_events(created_at);
    `).catch((error) => {
      ensureBoardgameSchemaPromise = null;
      throw error;
    });
  }

  return ensureBoardgameSchemaPromise;
}
