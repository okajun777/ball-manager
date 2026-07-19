-- 既存 DB 向け: ログインID／パスワード列を追加
-- Supabase → SQL Editor または supabase db query --linked で実行

alter table members add column if not exists login_id text;
alter table members add column if not exists password_hash text;

create unique index if not exists idx_members_login_id
  on members (lower(login_id))
  where login_id is not null and login_id <> '';

-- 表示名から仮ログインID（同名が複数ある場合は人数が多いグループを優先）
with group_sizes as (
  select group_id, count(*)::int as group_size
  from members
  group by group_id
),
ranked as (
  select
    m.id,
    m.display_name,
    row_number() over (
      partition by m.display_name
      order by gs.group_size desc, m.is_self desc, m.id
    ) as rn
  from members m
  join group_sizes gs on gs.group_id = m.group_id
  where m.display_name in ('淳司', 'はるみ', 'ちえこ')
    and (m.login_id is null or m.login_id = '')
)
update members m
set login_id = case
  when r.display_name = '淳司' then 'junji'
  when r.display_name = 'はるみ' then 'harumi'
  when r.display_name = 'ちえこ' then 'chieko'
  else m.login_id
end
from ranked r
where m.id = r.id
  and r.rn = 1;
