-- 既存 DB 向け: ログインID／パスワード列を追加
-- Supabase SQL Editor で実行してください

alter table members add column if not exists login_id text;
alter table members add column if not exists password_hash text;

create unique index if not exists idx_members_login_id
  on members (lower(login_id))
  where login_id is not null and login_id <> '';
