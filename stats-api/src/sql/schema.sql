create table if not exists items (
  id bigserial primary key,
  item_key text not null unique,
  name text not null,
  category text not null,
  item_type text not null,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists quiz_events (
  id bigserial primary key,
  session_id text not null,
  quiz_category text not null,
  left_item_key text references items(item_key) on delete set null,
  right_item_key text references items(item_key) on delete set null,
  chosen_item_key text not null references items(item_key) on delete cascade,
  is_correct boolean not null,
  response_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists awards_events (
  id bigserial primary key,
  session_id text not null,
  awards_category text not null,
  round_name text not null,
  group_name text,
  matchup_id text,
  left_item_key text references items(item_key) on delete set null,
  right_item_key text references items(item_key) on delete set null,
  chosen_item_key text not null references items(item_key) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_items_category on items(category);
create index if not exists idx_quiz_events_category on quiz_events(quiz_category);
create index if not exists idx_quiz_events_chosen_item_key on quiz_events(chosen_item_key);
create index if not exists idx_quiz_events_created_at on quiz_events(created_at);
create index if not exists idx_awards_events_category on awards_events(awards_category);
create index if not exists idx_awards_events_round_name on awards_events(round_name);
create index if not exists idx_awards_events_chosen_item_key on awards_events(chosen_item_key);
create index if not exists idx_awards_events_created_at on awards_events(created_at);
