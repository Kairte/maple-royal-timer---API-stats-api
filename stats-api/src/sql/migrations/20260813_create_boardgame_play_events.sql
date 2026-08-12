begin;

-- One row represents one confirmed board-game PLAY action. event_id prevents
-- retries or double clicks from increasing the count more than once.
create table if not exists boardgame_play_events (
  id bigserial primary key,
  event_id text not null unique,
  session_id text not null,
  game_mode text not null,
  game_variant text,
  device_type text not null default 'unknown'
    check (device_type in ('desktop', 'mobile', 'tablet', 'unknown')),
  created_at timestamptz not null default now(),
  check (char_length(event_id) between 8 and 128),
  check (char_length(session_id) between 8 and 128),
  check (char_length(game_mode) between 1 and 64),
  check (game_variant is null or char_length(game_variant) between 1 and 64)
);

create index if not exists idx_boardgame_play_events_mode_created_at
  on boardgame_play_events(game_mode, created_at desc);
create index if not exists idx_boardgame_play_events_session_created_at
  on boardgame_play_events(session_id, created_at desc);
create index if not exists idx_boardgame_play_events_created_at
  on boardgame_play_events(created_at desc);

commit;
