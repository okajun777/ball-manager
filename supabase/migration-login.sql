-- 既存 DB 向け: ログインID／パスワード列を追加
-- Supabase → SQL Editor でこのファイルを全部実行してください

alter table members add column if not exists login_id text;
alter table members add column if not exists password_hash text;

create unique index if not exists idx_members_login_id
  on members (lower(login_id))
  where login_id is not null and login_id <> '';

-- 表示名から仮ログインIDを付ける（まだ空のときだけ）
-- 同じ名前が複数グループにある場合は、メンバー数が多いグループを優先
with ranked as (
  select
    m.id,
    m.display_name,
    m.login_id,
    count(*) over (partition by m.group_id) as group_size,
    row_number() over (
      partition by m.display_name
      order by count(*) over (partition by m.group_id) desc, m.is_self desc, m.id
    ) as rn
  from members m
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
  and r.rn = 1
  and (m.login_id is null or m.login_id = '')
  and r.display_name in ('淳司', 'はるみ', 'ちえこ');
