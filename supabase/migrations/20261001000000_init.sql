-- ReDay v2: schema เริ่มต้น + RLS
-- ตารางตรงกับรูปแบบข้อมูลใน js/store.js (profiles, tasks, chores, chore_completions, daily_logs,
-- reminder_state, consents, events, feedback) เวลาเก็บเป็น timestamptz (UTC) ส่วนวันที่ log_date เป็นวันตามเวลาตัดวัน 04:00 ของผู้ใช้
-- นโยบาย: ทุกตารางเปิด RLS และให้สิทธิ์เฉพาะ role authenticated เฉพาะแถวของตัวเอง (anon ไม่มีสิทธิ์เลย)

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  usual_bedtime text not null default '01:00' check (usual_bedtime ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  target_bedtime text not null default '23:30' check (target_bedtime ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  target_wake text not null default '08:00' check (target_wake ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  meal_delay_minutes int not null default 30 check (meal_delay_minutes in (15, 30, 45, 60, 90)),
  quiet_start text check (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_end text check (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  notify_meal boolean not null default true,
  notify_winddown boolean not null default true,
  notify_room boolean not null default true,
  track_meals boolean not null default true,
  day_cutoff text not null default '04:00' check (day_cutoff ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  onboarding_complete boolean not null default false,
  consent_version text,
  consent_at timestamptz,
  care_card_shown_on date,
  care_card_dismissed_on date,
  last_rollover date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  minutes int not null default 25 check (minutes between 5 and 240),
  energy_needed text not null default 'med' check (energy_needed in ('low', 'med', 'high')),
  is_micro boolean not null default false,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done', 'dropped')),
  due_date date,
  postponed_until date,
  postponed_count int not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  micro_done_date date,
  micro_session boolean not null default false,
  last_shown_date date,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index tasks_user_status_idx on public.tasks (user_id, status);

-- ---------------------------------------------------------------- chores
create table public.chores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  minutes int not null default 10 check (minutes between 5 and 15),
  is_sample boolean not null default false,
  archived_at timestamptz, -- "ลบ" = เก็บเข้า archive ประวัติที่เคยทำยังอยู่
  created_at timestamptz not null default now()
);
create index chores_user_idx on public.chores (user_id);

-- ---------------------------------------------------------------- chore_completions (แหล่งความจริงเดียวของสถานะงานห้อง)
create table public.chore_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  chore_id uuid not null references public.chores (id) on delete cascade,
  log_date date not null,
  started_at timestamptz,
  completed_at timestamptz,
  minutes_spent int,
  planned_minutes int,
  partial boolean not null default false,
  skipped boolean not null default false,
  unique (user_id, chore_id, log_date)
);
create index chore_completions_user_date_idx on public.chore_completions (user_id, log_date);

-- ---------------------------------------------------------------- daily_logs
create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  woke_at timestamptz,
  first_meal_at timestamptz,
  meal_status text not null default 'unknown' check (meal_status in ('unknown', 'logged', 'skipped')),
  bedtime_at timestamptz,
  energy_override text check (energy_override in ('low', 'normal', 'good')),
  day_mode text not null default 'normal' check (day_mode in ('normal', 'light')),
  slipped_reasons text[] not null default '{}',
  reasons_edited boolean not null default false,
  swapped jsonb not null default '{"task": [], "chore": []}'::jsonb,
  skipped_task boolean not null default false,
  notes text,
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

-- ---------------------------------------------------------------- reminder_state
create table public.reminder_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  kind text not null check (kind in ('meal', 'room', 'winddown')),
  fired_at timestamptz,
  dismissed_at timestamptz,
  primary key (user_id, log_date, kind)
);

-- ---------------------------------------------------------------- consents (ประวัติความยินยอม ไม่ลบเมื่อเนื้อหาเปลี่ยนเวอร์ชัน)
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index consents_user_idx on public.consents (user_id);

-- ---------------------------------------------------------------- events (analytics แบบเบา: ชื่อเหตุการณ์ + props สั้น ๆ ห้ามข้อความอิสระ)
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) <= 40),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 512),
  at timestamptz not null default now()
);
create index events_user_at_idx on public.events (user_id, at desc);

-- ---------------------------------------------------------------- feedback
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  page text not null default '' check (char_length(page) <= 40),
  message text not null check (char_length(btrim(message)) between 1 and 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- สร้างโปรไฟล์ + บันทึกความยินยอมแรกเมื่อสมัคร
-- ชื่อและเวอร์ชันความยินยอมมาจาก options.data ตอน signUp (ผู้ใช้ตั้งเองได้ แต่ถูกตัดความยาวและเขียนได้เฉพาะแถวของตัวเอง)
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v text := nullif(left(new.raw_user_meta_data ->> 'consent_version', 40), '');
begin
  insert into public.profiles (id, display_name, consent_version, consent_at)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 40), v, case when v is null then null else now() end);
  if v is not null then
    insert into public.consents (user_id, version) values (new.id, v);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- ลบบัญชีตัวเอง (ลบ auth.users → cascade ทุกตาราง)
create function public.delete_my_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = (select auth.uid());
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------- RLS + สิทธิ์ (ให้ทีละตาราง ทีละ operation)
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.chores enable row level security;
alter table public.chore_completions enable row level security;
alter table public.daily_logs enable row level security;
alter table public.reminder_state enable row level security;
alter table public.consents enable row level security;
alter table public.events enable row level security;
alter table public.feedback enable row level security;

-- profiles: อ่าน/แก้ของตัวเอง (แถวสร้างโดย trigger ไม่ให้ client insert/delete)
grant select, update on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ตารางข้อมูลหลัก: CRUD เฉพาะแถวของตัวเอง
do $$
declare t text;
begin
  foreach t in array array['tasks', 'chores', 'chore_completions', 'daily_logs', 'reminder_state'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete', t);
  end loop;
end $$;

-- consents: อ่าน, เพิ่มแถวใหม่ (ขอใหม่เมื่อเวอร์ชันเปลี่ยน), ถอนความยินยอม (อัปเดต withdrawn_at) ไม่ให้ลบประวัติ
grant select, insert, update on public.consents to authenticated;
create policy consents_select on public.consents for select to authenticated using (user_id = (select auth.uid()));
create policy consents_insert on public.consents for insert to authenticated with check (user_id = (select auth.uid()));
create policy consents_update on public.consents for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- events / feedback: เพิ่ม อ่าน และลบของตัวเอง (ลบใช้ตอน "ลบข้อมูลทั้งหมด") ไม่ให้แก้ไข
grant select, insert, delete on public.events to authenticated;
create policy events_select on public.events for select to authenticated using (user_id = (select auth.uid()));
create policy events_insert on public.events for insert to authenticated with check (user_id = (select auth.uid()));
create policy events_delete on public.events for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.feedback to authenticated;
create policy feedback_select on public.feedback for select to authenticated using (user_id = (select auth.uid()));
create policy feedback_insert on public.feedback for insert to authenticated with check (user_id = (select auth.uid()));
create policy feedback_delete on public.feedback for delete to authenticated using (user_id = (select auth.uid()));
