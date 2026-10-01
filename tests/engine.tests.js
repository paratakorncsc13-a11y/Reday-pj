/* ReDay v2 — unit tests ของ rule engine และฟังก์ชันเวลา
 * ชุดทดสอบ 11 ข้อจากสเปก (หัวข้อ "ตัวอย่างทดสอบ") + กฎอื่น ๆ ของ R1–R10
 * ใช้ runner เล็ก ๆ ใน tests/index.html (ไม่ต้องติดตั้งอะไร)
 */
(function (g) {
  const RD = g.RD;
  const T = RD.time;
  const E = RD.engine;
  const M = RD.msg;
  const { suite, test, eq, ok, notOk } = g.TestKit;

  const DAY = '2026-10-01';
  const at = (hm, day) => T.atBkk(day || DAY, T.parseHM(hm));

  const profile = (o) =>
    Object.assign(
      {
        id: 'u1',
        display_name: 'มะนาว',
        usual_bedtime: '01:00',
        target_bedtime: '23:30',
        target_wake: '08:00',
        meal_delay_minutes: 30,
        quiet_start: null,
        quiet_end: null,
        notify_meal: true,
        notify_winddown: true,
        notify_room: true,
        track_meals: true,
        day_cutoff: '04:00',
      },
      o
    );
  const mkLog = (o) =>
    Object.assign(
      {
        log_date: DAY,
        woke_at: null,
        first_meal_at: null,
        meal_status: 'unknown',
        bedtime_at: null,
        energy_override: null,
        day_mode: 'normal',
        slipped_reasons: [],
        reasons_edited: false,
        swapped: { task: [], chore: [] },
        skipped_task: false,
      },
      o
    );
  const tasks = () => [
    { id: 't1', title: 'อ่านสรุปวิชาสถิติ บทที่ 4', energy_needed: 'med', minutes: 45, status: 'todo', due_date: null, is_micro: false, created_at: '2026-09-30T01:00:00Z' },
    { id: 't2', title: 'ตอบอีเมลที่ค้างอยู่', energy_needed: 'low', minutes: 15, status: 'todo', due_date: null, is_micro: true, created_at: '2026-09-30T00:00:00Z' },
  ];
  const chores = () => [
    { id: 'c1', title: 'เก็บโต๊ะ', minutes: 10, archived_at: null, created_at: '2026-09-30T00:00:00Z' },
    { id: 'c2', title: 'กวาดพื้น', minutes: 10, archived_at: null, created_at: '2026-09-30T00:00:01Z' },
    { id: 'c3', title: 'เก็บผ้า', minutes: 10, archived_at: null, created_at: '2026-09-30T00:00:02Z' },
  ];
  const day = (o) =>
    E.buildDay(
      Object.assign(
        {
          now: at('09:30'),
          profile: profile(),
          log: mkLog({}),
          prevLog: null,
          recentLogs: [],
          tasks: tasks(),
          chores: chores(),
          completions: [],
          reminderState: [],
        },
        o
      )
    );

  // ---------------------------------------------------------------
  suite('ตัวอย่างทดสอบจากสเปก (11 ข้อ)');

  test('#1 ตื่น 09:20 (ช้า 80 นาที) ยังไม่บันทึกมื้อ ตอนนี้ 09:30 → ปกติ · ตรงเวลา · มื้อถัดไป 09:50', () => {
    const p = day({ now: at('09:30'), log: mkLog({ woke_at: at('09:20') }) });
    eq(p.energy.level, 'normal');
    eq(p.energy.source, 'rule');
    eq(p.wake.chipText, 'ตื่น 09:20 น. · ตรงเวลา');
    eq(T.formatTime(p.nextMeal.at), '09:50 น.');
  });

  test('#2 ตื่น 10:00 (ช้า 120 นาที) → พลังงานต่ำ (ระบบเดา) ไม่มีคำว่า ตรงเวลา มีเฉพาะงานย่อย', () => {
    const p = day({ now: at('10:05'), log: mkLog({ woke_at: at('10:00') }) });
    eq(p.energy.level, 'low');
    eq(p.energy.source, 'rule');
    eq(p.copy.energyChip, 'พลังงานต่ำ · ระบบเดา');
    eq(p.wake.chipText, 'ตื่น 10:00 น.');
    notOk(p.wake.chipText.includes('ตรงเวลา'));
    eq(p.mainTask, null);
    ok(p.microTask, 'ต้องมีงานย่อย');
    eq(p.microTask.task.id, 't2');
  });

  test('#3 เคส 2 และผู้ใช้เลือกพลังงานปกติ → ปกติ (คุณเลือก) มีงานหลักได้', () => {
    const p = day({ now: at('10:05'), log: mkLog({ woke_at: at('10:00'), energy_override: 'normal' }) });
    eq(p.energy.level, 'normal');
    eq(p.energy.source, 'user');
    eq(p.copy.energyChip, 'พลังงานปกติ · คุณเลือก');
    ok(p.mainTask, 'ต้องมีงานหลัก');
    eq(p.mainTask.task.id, 't1');
  });

  test('#4 ตื่น 09:20 มื้อ unknown ตอนนี้ 10:30 → พลังงานต่ำ (เลย 09:50 + 30 นาที)', () => {
    const p = day({ now: at('10:30'), log: mkLog({ woke_at: at('09:20') }) });
    eq(p.energy.level, 'low');
  });

  test('#5 เหมือนเคส 4 แต่ตอนนี้ 10:10 → พลังงานปกติ', () => {
    const p = day({ now: at('10:10'), log: mkLog({ woke_at: at('09:20') }) });
    eq(p.energy.level, 'normal');
  });

  test('#6 นอนปกติ 03:30 เป้า 23:30 → แนะนำนอน 03:10 ผ่อนจังหวะ 02:25', () => {
    const p = day({ profile: profile({ usual_bedtime: '03:30' }), log: mkLog({}), now: at('09:00') });
    eq(T.formatTime(p.sleep.suggestedBedtime), '03:10 น.');
    eq(T.formatTime(p.sleep.winddownAt), '02:25 น.');
  });

  test('#7 นอนปกติ 00:10 เป้า 23:30 → แนะนำนอน 23:30 ผ่อนจังหวะ 22:45', () => {
    const p = day({ profile: profile({ usual_bedtime: '00:10' }), log: mkLog({}), now: at('09:00') });
    eq(T.formatTime(p.sleep.suggestedBedtime), '23:30 น.');
    eq(T.formatTime(p.sleep.winddownAt), '22:45 น.');
  });

  test('#8 รายการเวลา 03:40, 23:50, 00:10 → เรียง 23:50 → 00:10 → 03:40', () => {
    const sorted = T.sortByDayMinute(['03:40', '23:50', '00:10'], (s) => T.parseHM(s), 240);
    eq(sorted, ['23:50', '00:10', '03:40']);
  });

  test('#9 ตอนนี้ 02:10 ของวันที่ 2 ต.ค. → log_date คือวันที่ 1 ต.ค.', () => {
    eq(T.logDateOf(at('02:10', '2026-10-02'), 240), '2026-10-01');
    eq(T.logDateOf(at('04:00', '2026-10-02'), 240), '2026-10-02');
    eq(T.logDateOf(at('03:59', '2026-10-02'), 240), '2026-10-01');
  });

  test('#10 winddownAt 02:25 → 01:30 ไม่เตือน, 02:40 เตือน, 03:30 ไม่เตือน', () => {
    const base = { profile: profile({ usual_bedtime: '03:30' }), log: mkLog({ woke_at: at('09:00') }) };
    const d2 = '2026-10-02';
    const n = (hm) => E.nudgesDue(at(hm, d2), Object.assign({ prevLog: null, recentLogs: [], tasks: [], chores: [], completions: [], reminderState: [] }, base));
    eq(n('01:30').filter((x) => x.kind === 'winddown').length, 0);
    eq(n('02:40').filter((x) => x.kind === 'winddown').length, 1);
    eq(n('03:30').filter((x) => x.kind === 'winddown').length, 0);
  });

  test('#11 ตื่นแล้วแต่ไม่แตะมื้อ ตอนนี้ 09:30 → มื้อเป็น unknown ไม่มี flag missing_meal', () => {
    const p = day({ now: at('09:30'), log: mkLog({ woke_at: at('09:20') }) });
    eq(p.nextMeal.status, 'unknown');
    notOk(p.flags.some((f) => f.key === 'missing_meal'));
  });

  // ---------------------------------------------------------------
  suite('ฟังก์ชันเวลา');

  test('formatTime คืน HH:mm น. ทุกค่า และไม่มี AM/PM', () => {
    eq(T.formatTime(at('02:30')), '02:30 น.');
    eq(T.formatTime(at('00:00')), '00:00 น.');
    eq(T.formatTime(at('23:59')), '23:59 น.');
    eq(T.formatTime(at('12:05')), '12:05 น.');
    eq(T.formatTime(150), '02:30 น.');
    eq(T.formatTime('7:05'), '07:05 น.');
    for (let m = 0; m < 1440; m += 7) notOk(/[AP]M/i.test(T.formatTime(m)), `พบ AM/PM ที่ ${m}`);
  });

  test('instant เก็บเป็น UTC แสดงตามเวลา Asia/Bangkok', () => {
    const d = new Date('2026-10-01T02:20:00Z');
    eq(T.formatTime(d), '09:20 น.');
    eq(T.ymd(new Date('2026-09-30T18:00:00Z')), '2026-10-01');
  });

  test('sleepMinute นับจาก 18:00 (ข้ามเที่ยงคืนได้)', () => {
    eq(T.sleepMinute(T.parseHM('18:00')), 0);
    eq(T.sleepMinute(T.parseHM('23:30')), 330);
    eq(T.sleepMinute(T.parseHM('03:30')), 570);
    eq(T.sleepMinute(T.parseHM('17:59')), 1439);
  });

  test('วันที่ไทยใช้ปี พ.ศ. รูปแบบตามสเปก "พฤ. 1 ต.ค. 2569" (ฐานข้อมูลเก็บ ค.ศ.)', () => {
    eq(T.formatDate('2026-10-01'), 'พฤ. 1 ต.ค. 2569');
    eq(T.formatDate('2026-10-02'), 'ศ. 2 ต.ค. 2569');
    eq(T.formatDate('2026-10-04'), 'อา. 4 ต.ค. 2569');
    eq(T.formatDateShort('2026-10-01'), '1 ต.ค.');
  });

  test('resolveInLogDay / latestAtOrBefore / nearest', () => {
    eq(T.resolveInLogDay('2026-10-01', T.parseHM('02:00'), 240).toISOString(), at('02:00', '2026-10-02').toISOString());
    eq(T.resolveInLogDay('2026-10-01', T.parseHM('09:00'), 240).toISOString(), at('09:00').toISOString());
    eq(T.latestAtOrBefore(T.parseHM('23:30'), at('09:00')).toISOString(), at('23:30', '2026-09-30').toISOString());
    eq(T.nearest(T.parseHM('00:10'), at('23:50')).toISOString(), at('00:10', '2026-10-02').toISOString());
  });

  // ---------------------------------------------------------------
  suite('R1 พลังงาน และ R2 ชิปเวลาตื่น');

  test('ยังไม่บันทึกเวลาตื่น → ปกติ ชิป "ยังไม่บันทึกเวลาตื่น"', () => {
    const p = day({ log: mkLog({}), now: at('08:00') });
    eq(p.energy.level, 'normal');
    eq(p.wake.chipText, 'ยังไม่บันทึกเวลาตื่น');
    eq(p.nextMeal.waitingForWake, true);
    eq(p.copy.meal.main, 'รอบันทึกเวลาตื่นก่อน');
  });

  test('R1 ข้อ 5 ไม่ทำให้ทุกคนพลังงานต่ำทันทีหลังกด ตื่นแล้ว (v1 bug)', () => {
    const p = day({ now: at('08:01'), log: mkLog({ woke_at: at('08:00') }) });
    eq(p.energy.level, 'normal');
  });

  test('ค่าที่ผู้ใช้เลือกชนะกฎ (ตื่นช้าแต่เลือก "ดี")', () => {
    const p = day({ now: at('11:00'), log: mkLog({ woke_at: at('10:30'), energy_override: 'good' }) });
    eq(p.energy.level, 'good');
    eq(p.copy.energyChip, 'พลังงานดี · คุณเลือก');
  });

  test('โหมดขอเบา ๆ = พลังงานต่ำ ไม่มี flags ซ่อนการ์ดงาน ปิดเตือน', () => {
    const p = day({ now: at('21:00'), log: mkLog({ woke_at: at('12:00'), day_mode: 'light' }) });
    eq(p.energy.level, 'low');
    eq(p.mode, 'light');
    eq(p.flags.length, 0);
    eq(p.taskCard, null);
    eq(p.nudges.length, 0);
    eq(p.summary.text, 'วันนี้ขอเบา ๆ ก็พอแล้ว พรุ่งนี้ค่อยเริ่มจากเวลาตื่น');
    eq(p.chore.minutes, 5);
    ok(p.chore.optional);
  });

  test('ตื่นห่างเป้า 90 นาทีพอดียังเป็น ตรงเวลา, 91 นาทีไม่ใช่', () => {
    eq(day({ log: mkLog({ woke_at: at('09:30') }), now: at('09:40') }).wake.chipText, 'ตื่น 09:30 น. · ตรงเวลา');
    eq(day({ log: mkLog({ woke_at: at('09:31') }), now: at('09:40') }).wake.chipText, 'ตื่น 09:31 น.');
    eq(day({ log: mkLog({ woke_at: at('06:30') }), now: at('09:40') }).wake.chipText, 'ตื่น 06:30 น. · ตรงเวลา');
  });

  test('ซ่อนเสา กิน: พลังงานเดาจากเวลาตื่นอย่างเดียว ไม่มีมื้อ ไม่มี flag ไม่มีเตือน', () => {
    const p = day({ profile: profile({ track_meals: false }), now: at('13:00'), log: mkLog({ woke_at: at('09:00') }) });
    eq(p.energy.level, 'normal');
    eq(p.nextMeal, null);
    eq(p.copy.meal, null);
    notOk(p.flags.some((f) => f.key === 'missing_meal'));
    notOk(p.nudges.some((n) => n.kind === 'meal'));
    notOk(p.timeline.some((i) => i.kind === 'meal'));
    eq(T.formatTime(p.taskCard.startAt), '10:00 น.'); // ตื่น + 60 นาที
  });

  test('มื้อ skipped เลยเวลา 30 นาที → พลังงานต่ำ และเข้า flag', () => {
    const p = day({ now: at('11:00'), log: mkLog({ woke_at: at('09:00'), meal_status: 'skipped' }) });
    eq(p.energy.level, 'low');
    ok(p.flags.some((f) => f.key === 'missing_meal'));
  });

  // ---------------------------------------------------------------
  suite('R4 นอน');

  test('ใช้เวลานอนที่บันทึกล่าสุดภายใน 3 วันเป็นค่าฐาน', () => {
    const prev = mkLog({ log_date: '2026-09-30', bedtime_at: at('03:00', '2026-10-01') });
    const p = day({ prevLog: prev, profile: profile({ usual_bedtime: '23:30' }), log: mkLog({}), now: at('09:00') });
    eq(T.formatTime(p.sleep.suggestedBedtime), '02:40 น.');
    eq(T.formatTime(p.sleep.winddownAt), '01:55 น.');
    eq(p.sleep.shiftMinutes, 20);
  });

  test('ค่าฐานเก่าเกิน 3 วันไม่นับ ใช้ usual_bedtime', () => {
    const old = mkLog({ log_date: '2026-09-25', bedtime_at: at('04:30', '2026-09-26') });
    const p = day({ recentLogs: [old], profile: profile({ usual_bedtime: '23:45' }), now: at('09:00') });
    eq(T.formatTime(p.sleep.suggestedBedtime), '23:30 น.');
  });

  test('แนะนำนอนไม่เร็วกว่าเป้าหมาย', () => {
    // ค่าฐาน 00:40 ช้ากว่าเป้า 70 นาที → 00:20 ยังช้ากว่าเป้า
    const p = day({ profile: profile({ usual_bedtime: '00:40' }), now: at('09:00') });
    eq(T.formatTime(p.sleep.suggestedBedtime), '00:20 น.');
    // ค่าฐาน 00:30 ช้ากว่าเป้า 60 นาทีพอดี (ไม่เกิน) → ใช้เป้า
    const q = day({ profile: profile({ usual_bedtime: '00:30' }), now: at('09:00') });
    eq(T.formatTime(q.sleep.suggestedBedtime), '23:30 น.');
  });

  test('flag late_bedtime จากเวลานอนของคืนก่อนช้ากว่าเป้าเกิน 60 นาที', () => {
    const late = day({ prevLog: mkLog({ log_date: '2026-09-30', bedtime_at: at('01:00', '2026-10-01') }), now: at('12:00') });
    ok(late.flags.some((f) => f.key === 'late_bedtime'));
    const ok1 = day({ prevLog: mkLog({ log_date: '2026-09-30', bedtime_at: at('00:30', '2026-10-01') }), now: at('12:00') });
    notOk(ok1.flags.some((f) => f.key === 'late_bedtime'));
  });

  // ---------------------------------------------------------------
  suite('R5 งานหลัก/งานย่อย');

  test('พลังงานต่ำ ไม่มีงานย่อย → engine เสนอ เริ่มงาน "ชื่องาน" แค่ 25 นาที', () => {
    const only = [tasks()[0]];
    const p = day({ tasks: only, now: at('10:30'), log: mkLog({ woke_at: at('10:00') }) });
    ok(p.microTask.proposed);
    eq(p.microTask.minutes, 25);
    ok(p.microTask.title.includes('อ่านสรุปวิชาสถิติ บทที่ 4'));
    ok(p.microTask.title.includes('25 นาที'));
  });

  test('เรียงตาม due_date ใกล้สุดก่อน', () => {
    const ts = tasks();
    ts[0].due_date = '2026-10-05';
    ts.push({ id: 't3', title: 'ส่งงานด่วน', energy_needed: 'med', minutes: 30, status: 'todo', due_date: '2026-10-02', is_micro: false, created_at: '2026-09-30T02:00:00Z' });
    const p = day({ tasks: ts, now: at('09:30'), log: mkLog({ woke_at: at('08:30') }) });
    eq(p.mainTask.task.id, 't3');
  });

  test('งานที่ถูกเลื่อนไปพรุ่งนี้ไม่ถูกเลือกวันนี้ แต่กลับมาเมื่อถึงวัน', () => {
    const ts = tasks();
    ts[0].postponed_until = '2026-10-02';
    const p = day({ tasks: ts, now: at('09:30'), log: mkLog({ woke_at: at('08:30') }) });
    notOk(p.mainTask && p.mainTask.task.id === 't1');
    const tomorrow = day({ tasks: ts, now: at('09:30', '2026-10-02'), log: null, prevLog: null, profile: profile() });
    eq(tomorrow.logDate, '2026-10-02');
    eq(tomorrow.mainTask.task.id, 't1');
  });

  test('งานที่ผู้ใช้กดเปลี่ยนอันอื่นไม่ถูกเลือกซ้ำวันนี้', () => {
    const p = day({ now: at('09:30'), log: mkLog({ woke_at: at('08:30'), swapped: { task: ['t1'], chore: [] } }) });
    notOk(p.mainTask && p.mainTask.task.id === 't1');
  });

  test('งานเริ่มได้หลังมื้อ + 15 นาที (ใช้เวลามื้อที่บันทึกจริงถ้ามี)', () => {
    const p = day({ log: mkLog({ woke_at: at('09:00'), first_meal_at: at('09:50'), meal_status: 'logged' }), now: at('10:00') });
    eq(T.formatTime(p.taskCard.startAt), '10:05 น.');
    const q = day({ log: mkLog({ woke_at: at('09:00') }), now: at('09:10') });
    eq(T.formatTime(q.taskCard.startAt), '09:45 น.');
  });

  test('งานเริ่มแล้ว/เสร็จวันนี้ → การ์ดแสดงสถานะนั้น ไม่เด้งไปงานอื่น', () => {
    const ts = tasks();
    ts[0].status = 'doing';
    ts[0].started_at = at('10:00').toISOString();
    const doing = day({ tasks: ts, now: at('10:10'), log: mkLog({ woke_at: at('08:30') }) });
    eq(doing.taskCard.state, 'doing');
    eq(doing.taskCard.task.id, 't1');
    ts[0].status = 'done';
    ts[0].completed_at = at('10:45').toISOString();
    const done = day({ tasks: ts, now: at('11:00'), log: mkLog({ woke_at: at('08:30') }) });
    eq(done.taskCard.state, 'done');
  });

  // ---------------------------------------------------------------
  suite('R6 งานห้อง');

  test('เลือกงานที่ไม่ได้ทำใน 3 วัน เรียงตามที่ทำล่าสุดนานสุดก่อน', () => {
    const comps = [
      { id: 'x1', chore_id: 'c1', log_date: '2026-09-28', completed_at: at('18:00', '2026-09-28').toISOString(), skipped: false },
      { id: 'x2', chore_id: 'c2', log_date: '2026-09-29', completed_at: at('18:00', '2026-09-29').toISOString(), skipped: false },
    ];
    // c1 ทำเมื่อ 3 วันก่อน (พ้นช่วง) c2 ทำเมื่อ 2 วันก่อน (ยังอยู่ในช่วง) c3 ไม่เคยทำ → c3 ก่อน
    const p = day({ completions: comps });
    eq(p.chore.chore.id, 'c3');
    eq(p.chore.state, 'todo');
    eq(p.chore.minutes, 10);
  });

  test('งานถือว่าเสร็จเมื่อ completed_at ไม่ว่างเท่านั้น (ไทเมอร์เดินอยู่ = running)', () => {
    const running = [{ id: 'x1', chore_id: 'c1', log_date: DAY, started_at: at('10:00').toISOString(), completed_at: null, skipped: false, planned_minutes: 10 }];
    const a = day({ completions: running, now: at('10:05') });
    eq(a.chore.state, 'running');
    eq(a.chore.chore.id, 'c1');
    const done = [Object.assign({}, running[0], { completed_at: at('10:10').toISOString() })];
    const b = day({ completions: done, now: at('10:11') });
    eq(b.chore.state, 'done');
    eq(b.chore.chore.id, 'c1');
  });

  test('ข้ามวันนี้ → สถานะ skipped และไม่ถูกตีความว่าเสร็จ', () => {
    const sk = [{ id: 'x1', chore_id: 'c1', log_date: DAY, started_at: null, completed_at: null, skipped: true }];
    const p = day({ completions: sk, now: at('21:00'), log: mkLog({ woke_at: at('09:00') }) });
    eq(p.chore.state, 'skipped');
    ok(p.flags.some((f) => f.key === 'chore_skipped'));
  });

  test('ความยาวงานห้องไม่เกิน 10 นาทีเสมอ แม้งานตั้ง 15 นาที', () => {
    const cs = [{ id: 'c1', title: 'จัดตู้', minutes: 15, archived_at: null, created_at: '2026-09-30T00:00:00Z' }];
    eq(day({ chores: cs }).chore.minutes, 10);
  });

  test('งานห้องที่ถูกลบ (archived) ไม่ถูกเลือก', () => {
    const cs = chores();
    cs[0].archived_at = '2026-09-30T00:00:00Z';
    notOk(day({ chores: cs }).chore.chore.id === 'c1');
  });

  // ---------------------------------------------------------------
  suite('R7 ไทม์ไลน์');

  test('เรียงตามนาทีนับจากเวลาตัดวัน และงานมาหลังมื้อ', () => {
    const p = day({ now: at('09:30'), log: mkLog({ woke_at: at('09:20') }) });
    const kinds = p.timeline.map((i) => i.kind);
    ok(kinds.indexOf('wake') < kinds.indexOf('meal'));
    ok(kinds.indexOf('meal') < kinds.indexOf('task'));
    ok(kinds.indexOf('task') < kinds.indexOf('chore'));
    ok(kinds.indexOf('chore') < kinds.indexOf('winddown'));
    ok(kinds.indexOf('winddown') < kinds.indexOf('sleep'));
    const mins = p.timeline.map((i) => T.dayMinuteOf(i.at, 240));
    eq(mins, mins.slice().sort((a, b) => a - b));
  });

  test('รายการ 00:10 น. ไม่มาหลัง 03:40 น. (บั๊ก v1)', () => {
    const p = day({ profile: profile({ usual_bedtime: '03:30' }), now: at('09:30'), log: mkLog({ woke_at: at('09:20'), bedtime_at: at('00:10', '2026-10-02') }) });
    const sleepItem = p.timeline.find((i) => i.kind === 'sleep');
    eq(T.formatTime(sleepItem.at), '00:10 น.');
    const idxWind = p.timeline.findIndex((i) => i.kind === 'winddown');
    const idxSleep = p.timeline.findIndex((i) => i.kind === 'sleep');
    ok(idxSleep >= 0 && idxWind >= 0);
  });

  test('มีสถานะ next ได้ไม่เกินหนึ่งรายการ', () => {
    const p = day({ now: at('09:30'), log: mkLog({ woke_at: at('09:20') }) });
    eq(p.timeline.filter((i) => i.status === 'next').length, 1);
  });

  // ---------------------------------------------------------------
  suite('R8 flags และสรุป');

  test('main_task_not_started หลัง 16:00 เท่านั้น', () => {
    const lg = mkLog({ woke_at: at('09:00') });
    notOk(day({ log: lg, now: at('15:59') }).flags.some((f) => f.key === 'main_task_not_started'));
    ok(day({ log: lg, now: at('16:00') }).flags.some((f) => f.key === 'main_task_not_started'));
  });

  test('chore_skipped หลัง 20:00 และยังไม่มี completion', () => {
    const lg = mkLog({ woke_at: at('09:00') });
    notOk(day({ log: lg, now: at('19:59') }).flags.some((f) => f.key === 'chore_skipped'));
    ok(day({ log: lg, now: at('20:00') }).flags.some((f) => f.key === 'chore_skipped'));
    const comp = [{ id: 'x', chore_id: 'c1', log_date: DAY, started_at: at('18:00').toISOString(), completed_at: at('18:10').toISOString(), skipped: false }];
    notOk(day({ log: lg, now: at('21:00'), completions: comp }).flags.some((f) => f.key === 'chore_skipped'));
  });

  test('flags ผ่านเวลาหลังเที่ยงคืนแต่ก่อนตัดวันยังนับเป็นวันเดิม', () => {
    const lg = mkLog({ woke_at: at('09:00') });
    const p = day({ log: lg, now: at('01:00', '2026-10-02') });
    eq(p.logDate, DAY);
    ok(p.flags.some((f) => f.key === 'main_task_not_started'));
  });

  test('ตัวอย่างสรุปตามสเปก: นอนดึก + ยังไม่ได้กินมื้อแรก + งานไม่เริ่ม', () => {
    const p = day({
      now: at('17:00'),
      prevLog: mkLog({ log_date: '2026-09-30', bedtime_at: at('02:30', '2026-10-01') }),
      log: mkLog({ woke_at: at('09:00') }),
      completions: [{ id: 'x', chore_id: 'c1', log_date: DAY, completed_at: at('16:30').toISOString(), started_at: at('16:20').toISOString(), skipped: false }],
    });
    const keys = p.flags.map((f) => f.key);
    ok(keys.includes('late_bedtime') && keys.includes('missing_meal') && keys.includes('main_task_not_started'));
    ok(p.summary.text.includes('นอนดึก'), p.summary.text);
    ok(p.summary.text.includes('ยังไม่ได้กินมื้อแรก'), p.summary.text);
    ok(p.summary.text.includes('งานใหญ่เลยไม่ถูกเริ่ม'), p.summary.text);
    ok(p.summary.text.includes('มื้อแรกใน 30 นาทีหลังตื่น แล้วทำงานย่อย 25 นาที'), p.summary.text);
    eq(p.summary.badge, 'ระบบช่วยคิด');
    eq(p.summary.title, 'ทำไมวันนี้เลื่อน');
  });

  test('ไม่มี flag → "วันนี้ไม่มีอะไรที่ต้องแก้" ไม่แต่งเหตุผลขึ้นมา', () => {
    const p = day({
      now: at('12:00'),
      log: mkLog({ woke_at: at('08:00'), first_meal_at: at('08:30'), meal_status: 'logged' }),
    });
    eq(p.flags.length, 0);
    ok(p.summary.text.startsWith('วันนี้ไม่มีอะไรที่ต้องแก้'));
    eq(p.summary.title, 'จนถึงตอนนี้');
  });

  test('เหตุผลที่ผู้ใช้แก้เอง (slipped_reasons) ชนะ flags', () => {
    const p = day({
      now: at('17:00'),
      log: mkLog({ woke_at: at('09:00'), slipped_reasons: ['sick'], reasons_edited: true }),
    });
    ok(p.flags.length > 0);
    eq(p.summary.chips.map((c) => c.key), ['sick']);
    ok(p.summary.text.includes('เพราะป่วย'), p.summary.text);
    eq(p.summary.chips[0].text, 'ป่วย'); // ชิปกับเมนู "เหตุผลอื่น" ใช้คำเดียวกัน
  });

  // ---------------------------------------------------------------
  suite('R9 รีเซ็ตตอนนี้');

  test('เหลือไม่เกิน 3 อย่าง ตามลำดับ มื้อ → งานย่อย → งานห้อง', () => {
    const p = day({ now: at('13:00'), log: mkLog({ woke_at: at('11:00') }) });
    const r = E.resetFrom(at('13:00'), p);
    ok(r.items.length <= 3 && r.items.length >= 1);
    eq(r.items.map((i) => i.kind), ['meal', 'task', 'chore']);
    // พลังงานต่ำ → การ์ดเป็นงานย่อยจริง 15 นาที (ใช้นาทีของตัวมันเอง ให้ตรงกับไทเมอร์ที่เริ่มจริง ไม่ใช่ 25 ตายตัว)
    eq(r.items[1].minutes, 15);
    ok(r.items[2].minutes <= 10);
  });

  test('ผ่อนจังหวะอยู่ภายใน 90 นาทีข้างหน้า → ผ่อนจังหวะแทนงานห้อง', () => {
    const lg = mkLog({ woke_at: at('09:00'), first_meal_at: at('09:30'), meal_status: 'logged' });
    const p = day({ now: at('21:30'), log: lg, profile: profile({ usual_bedtime: '23:30' }) });
    const r = E.resetFrom(at('21:30'), p); // winddown 22:45 = อีก 75 นาที
    eq(r.items.map((i) => i.kind), ['task', 'winddown']);
  });

  test('ซ่อนเสา กิน → ไม่มีข้อมูลมื้อในรีเซ็ต และ resetFrom ไม่แก้ plan', () => {
    const p = day({ profile: profile({ track_meals: false }), now: at('13:00'), log: mkLog({ woke_at: at('11:00') }) });
    const before = JSON.stringify(p.timeline.map((i) => i.id));
    const r = E.resetFrom(at('13:00'), p);
    notOk(r.items.some((i) => i.kind === 'meal'));
    eq(JSON.stringify(p.timeline.map((i) => i.id)), before);
  });

  // ---------------------------------------------------------------
  suite('R10 เงื่อนไขการเตือน');

  const nudgeKinds = (o) => day(o).nudges.map((n) => n.kind);

  test('เตือนมื้อแรก: เลยเวลาแนะนำ + unknown + เปิดสวิตช์ + ยังไม่เคยเตือน', () => {
    const lg = mkLog({ woke_at: at('09:00') });
    notOk(nudgeKinds({ log: lg, now: at('09:29') }).includes('meal'));
    ok(nudgeKinds({ log: lg, now: at('09:30') }).includes('meal'));
    notOk(nudgeKinds({ log: lg, now: at('09:40'), profile: profile({ notify_meal: false }) }).includes('meal'));
    notOk(nudgeKinds({ log: mkLog({ woke_at: at('09:00'), meal_status: 'logged', first_meal_at: at('09:20') }), now: at('09:40') }).includes('meal'));
    notOk(nudgeKinds({ log: lg, now: at('09:40'), reminderState: [{ log_date: DAY, kind: 'meal', fired_at: at('09:31').toISOString(), dismissed_at: null }] }).includes('meal'));
  });

  test('เตือนงานห้อง: ตั้งแต่ 17:00 ครั้งเดียวต่อวัน', () => {
    const lg = mkLog({ woke_at: at('09:00'), first_meal_at: at('09:30'), meal_status: 'logged' });
    notOk(nudgeKinds({ log: lg, now: at('16:59') }).includes('room'));
    ok(nudgeKinds({ log: lg, now: at('17:00') }).includes('room'));
    notOk(nudgeKinds({ log: lg, now: at('17:30'), reminderState: [{ log_date: DAY, kind: 'room', dismissed_at: at('17:01').toISOString() }] }).includes('room'));
  });

  test('Quiet hours ปิดทุกเตือน (ไม่ใช่แค่ wind-down)', () => {
    const lg = mkLog({ woke_at: at('09:00') });
    const quiet = profile({ quiet_start: '22:00', quiet_end: '08:00' });
    eq(nudgeKinds({ log: lg, now: at('23:00'), profile: quiet }), []);
    eq(nudgeKinds({ log: mkLog({ woke_at: at('09:00') }), now: at('09:40') }).includes('meal'), true);
    const quiet2 = profile({ quiet_start: '09:00', quiet_end: '10:00' });
    eq(nudgeKinds({ log: lg, now: at('09:40'), profile: quiet2 }), []);
  });

  test('รวมทุกชนิดไม่เกิน 3 ครั้งต่อวัน', () => {
    const lg = mkLog({ woke_at: at('09:00') });
    const fired = ['meal', 'room', 'winddown'].map((k) => ({ log_date: DAY, kind: k, fired_at: at('09:01').toISOString() }));
    eq(day({ log: lg, now: at('22:50'), reminderState: fired }).nudges.length, 0);
  });

  // ---------------------------------------------------------------
  suite('การ์ดชวนคุย (กฎความปลอดภัยด้านมื้ออาหาร)');

  const skippedLogs = (n) =>
    Array.from({ length: n }, (_, i) => {
      const d = T.addDays(DAY, -(n - i));
      return mkLog({ log_date: d, woke_at: at('09:00', d), meal_status: 'skipped' });
    });

  test('บันทึกว่าไม่กินมื้อแรกติดกัน 4 วัน → แสดงการ์ดชวนคุย ไม่บอกชื่อโรค', () => {
    const p = day({ recentLogs: skippedLogs(4), log: mkLog({ woke_at: at('09:00') }), now: at('09:30') });
    ok(p.care.show);
    ok(p.care.text.includes('คุยกับเพื่อนหรือคนใกล้ตัว'));
    const three = day({ recentLogs: skippedLogs(3), log: mkLog({ woke_at: at('09:00') }), now: at('09:30') });
    notOk(three.care.show);
  });

  test('การ์ดชวนคุยไม่เกินสัปดาห์ละครั้ง และปิดได้', () => {
    const base = { recentLogs: skippedLogs(5), log: mkLog({ woke_at: at('09:00') }), now: at('09:30') };
    ok(day(base).care.show);
    notOk(day(Object.assign({}, base, { profile: profile({ care_card_shown_on: '2026-09-28', care_card_dismissed_on: '2026-09-28' }) })).care.show);
    ok(day(Object.assign({}, base, { profile: profile({ care_card_shown_on: '2026-09-24', care_card_dismissed_on: '2026-09-24' }) })).care.show);
    notOk(day(Object.assign({}, base, { profile: profile({ care_card_shown_on: DAY, care_card_dismissed_on: DAY }) })).care.show);
  });

  test('ซ่อนเสา กิน → ไม่นับ flag มื้อ ไม่ขึ้นการ์ดเรื่องมื้อ', () => {
    const p = day({ profile: profile({ track_meals: false }), recentLogs: skippedLogs(5), log: mkLog({ woke_at: at('09:00') }), now: at('09:30') });
    notOk(p.care.show);
  });

  test('นอนน้อยกว่าเป้ามากติดกัน 4 วัน → แสดงการ์ด', () => {
    const logs = [];
    for (let i = 5; i >= 1; i--) {
      const d = T.addDays(DAY, -i);
      logs.push(mkLog({ log_date: d, woke_at: at('09:00', d), bedtime_at: at('04:30', T.addDays(d, 1)) }));
    }
    // นอน 04:30 ตื่นวันถัดไป 09:00 = 4.5 ชม. เป้า 8.5 ชม. ขาด 4 ชม.
    const p = day({ recentLogs: logs, log: mkLog({ woke_at: at('09:00') }), prevLog: logs[logs.length - 1], now: at('09:30') });
    ok(p.care.show);
  });

  // ---------------------------------------------------------------
  suite('ข้อความ: สร้างจาก DayPlan ชิปกับข้อความไม่ขัดกัน (บั๊ก v1 #7) และไม่ตัดสิน');

  test('ชิปว่า ตรงเวลา แล้วข้อความต้องไม่เป็นพลังงานต่ำ (snapshot เคส 1–5)', () => {
    const cases = [
      { woke: '09:20', now: '09:30' },
      { woke: '10:00', now: '10:05' },
      { woke: '09:20', now: '10:30' },
      { woke: '09:20', now: '10:10' },
    ];
    for (const c of cases) {
      const p = day({ now: at(c.now), log: mkLog({ woke_at: at(c.woke) }) });
      if (p.wake.chipText.includes('ตรงเวลา') && p.energy.level === 'low') {
        // เป็นไปได้ (เคส 4: ตรงเวลาแต่เลยมื้อ) ต้องไม่เกิดข้อความเชิงตำหนิ
        notOk(/(?<!เ)ช้า|(?<!ส)สาย|ตำหนิ|ล้มเหลว|ขี้เกียจ/.test(JSON.stringify(p.copy)));
      }
      eq(p.copy.energyChip, M.energyChip(p.energy.level, p.energy.source));
    }
    const p4 = day({ now: at('10:30'), log: mkLog({ woke_at: at('09:20') }) });
    eq(p4.copy.energyChip, 'พลังงานต่ำ · ระบบเดา');
    eq(p4.wake.chipText, 'ตื่น 09:20 น. · ตรงเวลา');
  });

  test('คำทัก: ตามช่วงเวลาและไม่ใช้คำตัดสิน', () => {
    const g = (hm, bed) => M.greeting(T.parseHM(hm), 'มะนาว', bed);
    eq(g('05:00', false), 'สวัสดีตอนเช้า มะนาว');
    eq(g('11:59', false), 'สวัสดีตอนเช้า มะนาว');
    eq(g('12:00', false), 'สวัสดีตอนบ่าย มะนาว');
    eq(g('16:59', false), 'สวัสดีตอนบ่าย มะนาว');
    eq(g('17:00', false), 'สวัสดีตอนเย็น มะนาว');
    eq(g('21:59', false), 'สวัสดีตอนเย็น มะนาว');
    eq(g('22:00', false), 'ยังตื่นอยู่ มะนาว เดี๋ยวค่อยเข้านอนตามจังหวะ');
    eq(g('02:00', true), 'ราตรีสวัสดิ์ มะนาว');
    eq(g('04:59', false), 'ยังตื่นอยู่ มะนาว เดี๋ยวค่อยเข้านอนตามจังหวะ');
    eq(M.greeting(600, '', false), 'สวัสดีตอนเช้า');
  });

  test('ข้อความหมุนหลายแบบ ไม่ซ้ำกันสองวันติด (R11) และอย่างน้อย 3 แบบต่อชนิด', () => {
    for (const [k, list] of Object.entries(M.L)) ok(list.length >= 3, `${k} มีแค่ ${list.length} แบบ`);
    for (const [key, list] of Object.entries(M.L)) {
      let prev = null;
      for (let i = 0; i < 40; i++) {
        const d = T.addDays('2026-09-01', i);
        const v = M.pick(key, list, { userId: 'abc', logDate: d });
        if (prev !== null) notOk(v === prev, `${key} ซ้ำกันสองวันติดที่ ${d}`);
        prev = v;
      }
    }
  });

  test('ข้อความที่ระบบพูดไม่มีคำต้องห้าม (AM, PM, ยังไม่นอนอีกเหรอ, ล้มเหลว, ขี้เกียจ, ข้ามมื้อ)', () => {
    const banned = [/\b[AP]M\b/i, /ยังไม่นอนอีกเหรอ/, /ล้มเหลว/, /ขี้เกียจ/, /ข้ามมื้อ/];
    const strings = [];
    const walk = (v) => {
      if (typeof v === 'string') strings.push(v);
      else if (typeof v === 'function') {
        try { walk(v('ตัวอย่าง', 25)); } catch (e) { /* ignore */ }
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object' && !(v instanceof Date)) Object.values(v).forEach(walk);
    };
    walk(M.L);
    walk(M.FLAG_TEXT);
    walk([M.LIGHT_SUMMARY, M.CARE_TEXT]);
    // ผลลัพธ์ของ engine ในหลายสถานการณ์
    const scenes = [
      day({ now: at('10:30'), log: mkLog({ woke_at: at('09:20') }) }),
      day({ now: at('20:30'), log: mkLog({ woke_at: at('10:30'), meal_status: 'skipped' }), prevLog: mkLog({ bedtime_at: at('03:00') }) }),
      day({ now: at('21:00'), log: mkLog({ woke_at: at('12:00'), day_mode: 'light' }) }),
      day({ now: at('02:00', '2026-10-02'), log: mkLog({ woke_at: at('12:00') }) }),
    ];
    for (const p of scenes) {
      walk(p.copy);
      walk(p.summary);
      walk(p.nudges);
      walk(p.timeline);
      walk(p.flags);
    }
    for (const s of strings) for (const re of banned) notOk(re.test(s), `พบคำต้องห้าม ${re} ใน: ${s}`);
    ok(strings.length > 50, 'ควรสแกนข้อความได้มากพอ');
  });

  // ---------------------------------------------------------------
  suite('ค่าที่ขัดกัน: ถาม "นอนข้ามคืนใช่ไหม" ไม่แสดง error');

  test('sleepConflict: ตื่นก่อนเวลานอนที่เพิ่งบันทึก หรือช่วงนอนผิดปกติ → ถาม', () => {
    // ตื่นก่อนเวลานอนที่เพิ่งบันทึก
    ok(E.sleepConflict(at('09:30'), at('09:00')));
    // ปกติ: นอน 23:30 ของคืนก่อน ตื่น 09:00 (9.5 ชม.) ไม่ต้องถาม
    notOk(E.sleepConflict(at('23:30', '2026-09-30'), at('09:00')));
    notOk(E.sleepConflict(at('02:00'), at('09:00')));
    // นอนเช้า 05:00 ตื่น 13:00 (8 ชม.) ก็ไม่ต้องถาม
    notOk(E.sleepConflict(at('05:00'), at('13:00')));
    // ลืมแก้เวลาเริ่มต้น: นอน "09:30" ของเมื่อวาน ตื่น 09:20 วันนี้ (เกือบ 24 ชม.)
    ok(E.sleepConflict(at('09:30', '2026-09-30'), at('09:20')));
    // ช่วงนอนสั้นมาก
    ok(E.sleepConflict(at('08:40'), at('09:00')));
    notOk(E.sleepConflict(null, at('09:00')));
  });

  // ---------------------------------------------------------------
  suite('Engine บริสุทธิ์');

  test('buildDay ไม่แก้ข้อมูลที่ส่งเข้ามา และให้ผลเดิมเมื่อข้อมูลเดิม', () => {
    const input = {
      now: at('13:00'),
      profile: profile(),
      log: mkLog({ woke_at: at('11:00') }),
      prevLog: null,
      recentLogs: [],
      tasks: tasks(),
      chores: chores(),
      completions: [],
      reminderState: [],
    };
    const snap = JSON.stringify(input);
    const a = E.buildDay(input);
    const b = E.buildDay(input);
    eq(JSON.stringify(input), snap);
    eq(JSON.stringify(a.copy), JSON.stringify(b.copy));
    eq(JSON.stringify(a.summary), JSON.stringify(b.summary));
  });

  // ---------------------------------------------------------------
  suite('บั๊กจาก QA รอบ 2: ข้ามเวลาตัดวัน, คำทักดึก, รีเซ็ต, เตือนระหว่างไทเมอร์');

  test('คำทัก 04:00–04:59: บันทึกเวลานอนของเมื่อคืนไว้แล้ว (และยังไม่ตื่น) ต้องเป็น ราตรีสวัสดิ์ ไม่ใช่ ยังตื่นอยู่', () => {
    const d2 = '2026-10-02';
    // 04:30 ของวันที่ 2 = log_date วันที่ 2 แต่เพิ่งนอนตอน 02:00 (บันทึกไว้ใน log เมื่อวาน)
    const slept = day({ now: at('04:30', d2), log: null, prevLog: mkLog({ bedtime_at: at('02:00', d2) }) });
    eq(slept.logDate, d2);
    eq(slept.copy.greeting, 'ราตรีสวัสดิ์ มะนาว');
    // ไม่ได้บันทึกเวลานอนเลย ก็ยังเป็นคำทักเดิม
    eq(day({ now: at('04:30', d2), log: null, prevLog: null }).copy.greeting, 'ยังตื่นอยู่ มะนาว เดี๋ยวค่อยเข้านอนตามจังหวะ');
    // ตื่นแล้วตอนเช้า (06:00 = สวัสดีตอนเช้า) ไม่ใช่ราตรีสวัสดิ์
    eq(day({ now: at('06:00', d2), log: mkLog({ log_date: d2, woke_at: at('05:30', d2) }), prevLog: mkLog({ bedtime_at: at('02:00', d2) }) }).copy.greeting, 'สวัสดีตอนเช้า มะนาว');
  });

  test('รีเซ็ตตอนนี้: งานย่อยจริงใช้นาทีของตัวมันเอง ข้อเสนอ/งานใหญ่ใช้ 25 นาที (ตรงกับไทเมอร์ที่เริ่มจริง)', () => {
    const real = tasks();
    real[1].minutes = 15;
    const p = day({ now: at('13:00'), log: mkLog({ woke_at: at('12:00'), energy_override: 'low' }), tasks: real });
    eq(p.taskCard.task.id, 't2');
    const r = E.resetFrom(at('13:00'), p);
    const t = r.items.find((i) => i.kind === 'task');
    eq([t.minutes, t.sub], [15, '15 นาที พอแล้ว']);
    const big = day({ now: at('13:00'), log: mkLog({ woke_at: at('12:00'), energy_override: 'normal' }), tasks: [tasks()[0]] });
    const t2 = E.resetFrom(at('13:00'), big).items.find((i) => i.kind === 'task');
    eq(t2.minutes, 25);
  });

  test('เตือนงานห้องไม่ขึ้นขณะไทเมอร์งานห้องกำลังเดิน (กำลังทำอยู่แล้ว)', () => {
    const lg = mkLog({ woke_at: at('09:00'), first_meal_at: at('09:30'), meal_status: 'logged' });
    const running = [{ id: 'x', chore_id: 'c1', log_date: DAY, started_at: at('17:05').toISOString(), completed_at: null, skipped: false, planned_minutes: 10 }];
    notOk(day({ log: lg, now: at('17:10'), completions: running }).nudges.some((n) => n.kind === 'room'));
    ok(day({ log: lg, now: at('17:10') }).nudges.some((n) => n.kind === 'room'));
  });

  test('ไทเมอร์งานห้องที่เริ่ม 03:50 ยังเดินต่อได้หลังเวลาตัดวัน 04:00 (log_date เมื่อวาน)', () => {
    const d2 = '2026-10-02';
    const comp = [{ id: 'x', chore_id: 'c1', log_date: DAY, started_at: at('03:50', d2).toISOString(), completed_at: null, skipped: false, planned_minutes: 15 }];
    const before = day({ now: at('03:55', d2), log: mkLog({ woke_at: at('09:00') }), completions: comp });
    eq([before.logDate, before.chore.state, before.chore.chore.id], [DAY, 'running', 'c1']);
    const after = day({ now: at('04:05', d2), log: null, prevLog: mkLog({ woke_at: at('09:00') }), completions: comp });
    eq(after.logDate, d2);
    eq([after.chore.state, after.chore.chore.id, after.chore.completion.log_date], ['running', 'c1', DAY]);
    // เริ่มนานเกินช่วงที่ยอมให้ข้ามวัน (เริ่ม 20:00 ของเมื่อวาน) ไม่ถือว่ายังเดิน
    const old = [Object.assign({}, comp[0], { started_at: at('20:00').toISOString() })];
    notOk(day({ now: at('04:05', d2), log: null, completions: old }).chore.state === 'running');
  });

  test('ไทเมอร์งานหลักที่เริ่ม 03:50 ยังเป็น doing หลัง 04:00 (ไม่ถูกรีเซ็ตเงียบ ๆ)', () => {
    const d2 = '2026-10-02';
    const ts = tasks();
    ts[0].status = 'doing';
    ts[0].started_at = at('03:50', d2).toISOString();
    const p = day({ now: at('04:10', d2), log: null, tasks: ts });
    eq([p.taskCard.state, p.taskCard.task.id], ['doing', 't1']);
  });

  test('engine ไม่เรียกนาฬิกาเอง (ตรวจจาก source: ไม่มี new Date() เปล่า ๆ / Date.now)', () => {
    const src = String(E.buildDay) + String(E.resetFrom) + String(E.nudgesDue);
    notOk(/new Date\(\s*\)/.test(src), 'พบ new Date()');
    notOk(/Date\.now\(/.test(src), 'พบ Date.now()');
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
