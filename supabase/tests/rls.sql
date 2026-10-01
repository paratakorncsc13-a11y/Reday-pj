-- ทดสอบ RLS ของ 20261001000000_init.sql โดยจำลองผู้ใช้สองคน (A, B) ทุกอย่างอยู่ในทรานแซกชันเดียวที่ถูก rollback ปิดท้าย
-- (จบด้วย exception 'RLS_TEST_PASSED' เสมอ ถ้าข้อไหนไม่ผ่านจะ exception ด้วยข้อความ FAIL: ...)
-- รัน: npx supabase db query --linked -f supabase/tests/rls.sql
do $$
declare
  a uuid := '00000000-0000-4000-8000-00000000000a';
  b uuid := '00000000-0000-4000-8000-00000000000b';
  n int;
  ta uuid;
  ca uuid;
begin
  -- สมัครผู้ใช้: trigger ต้องสร้าง profile + consent จาก metadata
  insert into auth.users (id, aud, role, email, raw_user_meta_data)
  values (a, 'authenticated', 'authenticated', 'rls-a@test.invalid', '{"display_name":"เอ","consent_version":"v-test"}'),
         (b, 'authenticated', 'authenticated', 'rls-b@test.invalid', '{"display_name":"บี"}');
  select count(*) into n from public.profiles where id in (a, b);
  if n <> 2 then raise exception 'FAIL: trigger ไม่สร้าง profile (ได้ %)', n; end if;
  select count(*) into n from public.consents where user_id = a and version = 'v-test';
  if n <> 1 then raise exception 'FAIL: trigger ไม่บันทึกความยินยอมแรกของ A'; end if;
  select count(*) into n from public.consents where user_id = b;
  if n <> 0 then raise exception 'FAIL: B ไม่ได้ส่งเวอร์ชัน ไม่ควรมีแถวความยินยอม'; end if;

  -- ผู้ใช้ A
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.tasks (user_id, title) values (a, 'งานของ A') returning id into ta;
  insert into public.chores (user_id, title) values (a, 'ห้องของ A') returning id into ca;
  insert into public.chore_completions (user_id, chore_id, log_date) values (a, ca, '2026-10-01');
  insert into public.daily_logs (user_id, log_date) values (a, '2026-10-01');
  insert into public.reminder_state (user_id, log_date, kind) values (a, '2026-10-01', 'meal');
  insert into public.events (user_id, name) values (a, 'test');
  insert into public.feedback (user_id, message) values (a, 'ทดสอบ');

  -- A แอบใส่ข้อมูลให้ B ต้องถูกปฏิเสธ
  begin
    insert into public.tasks (user_id, title) values (b, 'แอบใส่ให้ B');
    raise exception 'FAIL: A insert งานในนาม B ได้';
  exception when insufficient_privilege then null; end;
  -- A เพิ่มความยินยอมในนาม B ไม่ได้
  begin
    insert into public.consents (user_id, version) values (b, 'x');
    raise exception 'FAIL: A เพิ่มความยินยอมในนาม B ได้';
  exception when insufficient_privilege then null; end;
  -- A ย้ายแถวของตัวเองไปเป็นของ B ไม่ได้
  begin
    update public.tasks set user_id = b where id = ta;
    raise exception 'FAIL: A โอนงานให้ B ได้';
  exception when insufficient_privilege then null; end;

  -- A เห็นเฉพาะโปรไฟล์ตัวเอง และแก้ได้
  select count(*) into n from public.profiles;
  if n <> 1 then raise exception 'FAIL: A เห็นโปรไฟล์ % แถว (ควร 1)', n; end if;
  update public.profiles set display_name = 'เอ2' where id = a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A แก้โปรไฟล์ตัวเองไม่ได้'; end if;
  -- ไม่มีสิทธิ์ insert/delete โปรไฟล์ และไม่มีสิทธิ์ลบ/แก้ events, ลบ consents
  begin insert into public.profiles (id) values (gen_random_uuid()); raise exception 'FAIL: insert profile ได้';
  exception when insufficient_privilege then null; end;
  begin delete from public.profiles where id = a; raise exception 'FAIL: delete profile ได้';
  exception when insufficient_privilege then null; end;
  begin delete from public.consents where user_id = a; raise exception 'FAIL: ลบประวัติความยินยอมได้';
  exception when insufficient_privilege then null; end;
  begin update public.events set name = 'x' where user_id = a; raise exception 'FAIL: แก้ events ได้';
  exception when insufficient_privilege then null; end;
  begin update public.feedback set message = 'x' where user_id = a; raise exception 'FAIL: แก้ feedback ได้';
  exception when insufficient_privilege then null; end;

  -- ข้อจำกัดข้อมูล
  begin insert into public.tasks (user_id, title, minutes) values (a, 'สั้นไป', 1); raise exception 'FAIL: minutes=1 ผ่าน check';
  exception when check_violation then null; end;
  begin insert into public.tasks (user_id, title) values (a, '   '); raise exception 'FAIL: ชื่อว่างผ่าน check';
  exception when check_violation then null; end;
  begin update public.profiles set usual_bedtime = '25:99' where id = a; raise exception 'FAIL: เวลาผิดรูปแบบผ่าน check';
  exception when check_violation then null; end;
  begin insert into public.daily_logs (user_id, log_date) values (a, '2026-10-01'); raise exception 'FAIL: log_date ซ้ำผ่าน';
  exception when unique_violation then null; end;

  -- ผู้ใช้ B ต้องมองไม่เห็น/แก้ไม่ได้/ลบไม่ได้ ข้อมูลของ A
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.tasks;            if n <> 0 then raise exception 'FAIL: B เห็น tasks ของ A (%)', n; end if;
  select count(*) into n from public.chores;           if n <> 0 then raise exception 'FAIL: B เห็น chores ของ A'; end if;
  select count(*) into n from public.chore_completions; if n <> 0 then raise exception 'FAIL: B เห็น chore_completions ของ A'; end if;
  select count(*) into n from public.daily_logs;       if n <> 0 then raise exception 'FAIL: B เห็น daily_logs ของ A'; end if;
  select count(*) into n from public.reminder_state;   if n <> 0 then raise exception 'FAIL: B เห็น reminder_state ของ A'; end if;
  select count(*) into n from public.consents;         if n <> 0 then raise exception 'FAIL: B เห็น consents ของ A'; end if;
  select count(*) into n from public.events;           if n <> 0 then raise exception 'FAIL: B เห็น events ของ A'; end if;
  select count(*) into n from public.feedback;         if n <> 0 then raise exception 'FAIL: B เห็น feedback ของ A'; end if;
  select count(*) into n from public.profiles;         if n <> 1 then raise exception 'FAIL: B เห็นโปรไฟล์ % แถว (ควร 1 ของตัวเอง)', n; end if;
  update public.tasks set title = 'ยึด' where id = ta;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: B แก้งานของ A ได้'; end if;
  delete from public.tasks where id = ta;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: B ลบงานของ A ได้'; end if;
  update public.profiles set display_name = 'ยึด' where id = a;
  get diagnostics n = row_count; if n <> 0 then raise exception 'FAIL: B แก้โปรไฟล์ A ได้'; end if;
  -- B ใส่ chore_completion ที่ชี้ chore ของ A (FK ผ่านเพราะ chore มีอยู่) ต้องไม่ทำให้เห็นข้อมูล A: แต่ user_id ต้องเป็นของ B
  insert into public.chore_completions (user_id, chore_id, log_date) values (b, ca, '2026-10-02');
  select count(*) into n from public.chores where id = ca;
  if n <> 0 then raise exception 'FAIL: B อ่าน chore ของ A ผ่านการอ้างอิง'; end if;

  -- ลบบัญชี: เฉพาะของตัวเอง cascade ทุกตาราง ไม่กระทบอีกคน
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.delete_my_account();
  reset role;
  select count(*) into n from auth.users where id = a;
  if n <> 0 then raise exception 'FAIL: delete_my_account ไม่ลบ auth.users'; end if;
  select count(*) into n from public.tasks where user_id = a;
  select count(*) + n into n from public.chores where user_id = a;
  select count(*) + n into n from public.daily_logs where user_id = a;
  select count(*) + n into n from public.consents where user_id = a;
  select count(*) + n into n from public.events where user_id = a;
  select count(*) + n into n from public.feedback where user_id = a;
  select count(*) + n into n from public.profiles where id = a;
  if n <> 0 then raise exception 'FAIL: ข้อมูลของ A เหลือหลังลบบัญชี (% แถว)', n; end if;
  select count(*) into n from auth.users where id = b;
  if n <> 1 then raise exception 'FAIL: ลบบัญชี A แล้ว B หาย'; end if;

  raise exception 'RLS_TEST_PASSED';
end $$;
