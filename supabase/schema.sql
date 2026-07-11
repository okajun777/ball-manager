-- Ball Manager schema (Supabase)
-- SQL Editor で実行してください

create extension if not exists "pgcrypto";

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  display_name text not null,
  is_self boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists balls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  name text not null,
  brand text not null default '',
  weight_lb numeric,
  purchased_on date,
  shop_name text default '',
  driller_name text default '',
  drilled_on date,
  price integer,
  layout_note text default '',
  surface_note text default '',
  memo text default '',
  created_at timestamptz not null default now()
);

create table if not exists score_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  played_on date not null,
  session_type text not null check (session_type in ('practice', 'tournament')),
  tournament_name text default '',
  shop_name text default '',
  oil_note text default '',
  memo text default '',
  created_at timestamptz not null default now()
);

create table if not exists score_games (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references score_sessions(id) on delete cascade,
  game_no integer not null,
  score integer not null check (score >= 0 and score <= 300),
  ball_id uuid references balls(id) on delete set null,
  frames jsonb
);

-- 既存DB向け: frames 列が無い場合に追加
alter table score_games add column if not exists frames jsonb;

create table if not exists surface_maintenances (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  ball_id uuid not null references balls(id) on delete cascade,
  done_on date,
  kind text not null check (kind in ('clean', 'polish', 'sand', 'compound', 'factory', 'other')),
  grit text default '',
  note text default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_members_group on members(group_id);
create index if not exists idx_balls_member on balls(member_id);
create index if not exists idx_sessions_member on score_sessions(member_id);
create index if not exists idx_sessions_played_on on score_sessions(played_on);
create index if not exists idx_maintenances_ball on surface_maintenances(ball_id);

-- まずは家族利用向けに anon から読み書き可能（後で認証付きに強化可能）
alter table groups enable row level security;
alter table members enable row level security;
alter table balls enable row level security;
alter table score_sessions enable row level security;
alter table score_games enable row level security;
alter table surface_maintenances enable row level security;

create policy "groups_all" on groups for all using (true) with check (true);
create policy "members_all" on members for all using (true) with check (true);
create policy "balls_all" on balls for all using (true) with check (true);
create policy "sessions_all" on score_sessions for all using (true) with check (true);
create policy "games_all" on score_games for all using (true) with check (true);
create policy "maintenances_all" on surface_maintenances for all using (true) with check (true);
