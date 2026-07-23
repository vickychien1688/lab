-- PAS English Lab → Supabase 遷移（共用 english-hq 專案）
-- 所有物件皆以 paslab_ 前綴隔離，不影響既有平台。
-- 在 Supabase SQL Editor 執行一次即可；可重複執行（idempotent）。

create table if not exists public.paslab_books (
  id     text primary key,
  title  text not null,
  sort   int  default 99,
  active boolean default true
);

create table if not exists public.paslab_lessons (
  book_id        text not null,
  lesson_id      text not null,
  label          text default '',
  body           text default '',
  audio_url      text default '',
  sort           int  default 99,
  active         boolean default true,
  shadow_mode    boolean default false,
  marks          text default '',
  gap_multiplier text default '',
  primary key (book_id, lesson_id)
);

create table if not exists public.paslab_rooms (
  id     text primary key,
  name   text not null,
  code   text not null,
  active boolean default true,
  sort   int  default 99
);

create table if not exists public.paslab_students (
  id      text primary key,
  room_id text not null,
  name    text not null,
  pin     text default '',
  active  boolean default true,
  sort    int  default 99
);

create table if not exists public.paslab_assignments (
  id        text primary key,
  room_id   text not null,
  book_id   text not null,
  lesson_id text not null,
  due_date  text default '',
  active    boolean default true,
  sort      int  default 99,
  note      text default ''
);

create table if not exists public.paslab_submissions (
  id           bigint generated always as identity primary key,
  ts           timestamptz default now(),
  book_id      text default '',
  lesson_id    text default '',
  student_name text default '',
  file_path    text default '',
  file_name    text default '',
  duration     int  default 0,
  score        text default '',
  comment      text default '',
  status       text default 'new',
  room_id      text default '',
  student_id   text default '',
  assign_id    text default ''
);

create table if not exists public.paslab_teachers (
  username text primary key,
  password text not null,
  name     text default '',
  role     text default 'teacher',
  active   boolean default true
);

create table if not exists public.paslab_config (
  key   text primary key,
  value text
);

-- 鎖上 RLS（不開任何 policy）：外部 API 完全進不來，只有我們的 Edge Function（service role）能存取
alter table public.paslab_books       enable row level security;
alter table public.paslab_lessons     enable row level security;
alter table public.paslab_rooms       enable row level security;
alter table public.paslab_students    enable row level security;
alter table public.paslab_assignments enable row level security;
alter table public.paslab_submissions enable row level security;
alter table public.paslab_teachers    enable row level security;
alter table public.paslab_config      enable row level security;

-- 儲存空間：示範音檔（公開、走 CDN）＋ 學生錄音（私有、簽名網址）
insert into storage.buckets (id, name, public) values ('paslab-audio', 'paslab-audio', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('paslab-rec', 'paslab-rec', false)
  on conflict (id) do nothing;

-- ===== 資料遷移（從舊 Google 系統搬來）=====
insert into public.paslab_config (key, value) values ('adminPassword', '1234')
  on conflict (key) do nothing;

insert into public.paslab_teachers (username, password, name, role, active) values
  ('vicky',  'vicky123',   'Vicky',  'admin', true),
  ('jackie', 'jackie7710', 'jackie', 'admin', true)
  on conflict (username) do nothing;

insert into public.paslab_rooms (id, name, code, active, sort) values
  ('r1784813292078781', 'G7', 'G7-2026', true, 1),
  ('r1784813316742938', 'G8', 'G8-2026', true, 2),
  ('r1784813341745789', 'G9', 'G9-2026', true, 3)
  on conflict (id) do nothing;

select 'paslab schema ready' as result;
