/* ReDay v2 — ชุดทดสอบฝั่งแอป: store, ผู้ใช้คุมได้, บั๊ก v1 ที่ต้องมีการทดสอบกันกลับมา, สแกนทุกหน้า
 * (e2e แบบเบา ๆ ในเบราว์เซอร์: เรียก handler จริงและ render หน้าจริง) ข้อมูลทดสอบอยู่ใน namespace reday2test
 */
(function (g) {
  const RD = g.RD;
  const TK = g.TestKit;
  const { suite, test, eq, ok, notOk } = TK;
  const S = RD.store;
  const T = RD.time;
  const A = RD.actions;
  const P = RD.pages;
  const stage = document.getElementById('view');
  const overlay = document.getElementById('overlay');

  // รวม null/undefined/NaN: el.append(null) จะพิมพ์คำว่า "null" ลงหน้า (เคยเกิดบนหน้า ห้อง ตอนโหมดขอเบา ๆ)
  const BANNED = [/\b[AP]M\b/i, /ยังไม่นอนอีกเหรอ/, /ล้มเหลว/, /ขี้เกียจ/, /ข้ามมื้อ/, /\b(null|undefined|NaN)\b/];
  const DAY = '2026-10-01';
  const at = (hm, day) => T.atBkk(day || DAY, T.parseHM(hm));
  const setNow = (hm, day) => T.clock.setFrom(at(hm, day).toISOString());
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ctxFor = (name) => ({ plan: S.isLoggedIn() ? S.plan() : null, path: '/' + name, def: {}, go() {}, back() {}, rerender() {}, params: {} });

  function visibleText(root) {
    const labels = [...root.querySelectorAll('[aria-label],[placeholder],[title]')].map((e) => [e.getAttribute('aria-label'), e.getAttribute('placeholder'), e.getAttribute('title')].filter(Boolean).join(' '));
    return root.textContent + ' ' + labels.join(' ');
  }
  function renderPage(name) {
    const node = P[name].render(ctxFor(name));
    stage.replaceChildren(node);
    return { text: visibleText(stage), root: stage };
  }
  function closeSheets() {
    RD.ui.closeAllSheets(); // รวมแผ่น modal (Esc ปิด modal ไม่ได้)
    overlay.innerHTML = '';
  }

  g.__appTestsReady = (async function () {
    Object.keys(localStorage).filter((k) => k.startsWith('reday2test') || k.startsWith('reday2iframe')).forEach((k) => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter((k) => k.startsWith('reday2test')).forEach((k) => sessionStorage.removeItem(k));
    sessionStorage.removeItem('reday2.reset');
    S.reloadFromStorage(); // store อ่านคีย์ตอนโหลดสคริปต์ ถ้ารอบก่อนค้างข้อมูลไว้ ต้อง sync ให้ตรงกับ storage ที่เพิ่งล้าง
    setNow('08:00');

    // ------------------------------------------------------------------
    suite('บัญชี การยินยอม และ onboarding');

    const bad1 = await S.signup({ name: 'ก', email: 'not-an-email', password: 'abcdef', consent: true });
    const bad2 = await S.signup({ name: 'ก', email: 'a@b.test', password: 'abc', consent: true });
    const bad3 = await S.signup({ name: 'ก', email: 'a@b.test', password: 'abcdef', consent: false });
    const good = await S.signup({ name: 'ทดสอบ', email: 'Tester@Example.test', password: 'test-pass-1', consent: true });
    const dup = await S.signup({ name: 'ข', email: 'tester@example.test', password: 'test-pass-2', consent: true });
    const profile0 = Object.assign({}, S.profile());

    test('สมัคร: อีเมลผิดรูป / รหัสสั้นกว่า 6 / ไม่ติ๊กยินยอม ถูกปฏิเสธ (ไม่ติ๊กไว้ล่วงหน้า)', () => {
      eq(bad1.error, 'bad_email');
      eq(bad2.error, 'short_password');
      eq(bad3.error, 'no_consent');
      ok(good.ok);
    });
    test('อีเมลซ้ำ (ไม่สนตัวพิมพ์) ถูกปฏิเสธ', () => eq(dup.error, 'duplicate'));
    test('สมัครเสร็จเข้าสู่ระบบทันที ไม่รออีเมลยืนยัน และมีบันทึกความยินยอม (เวอร์ชัน + เวลา)', () => {
      ok(S.isLoggedIn());
      eq(profile0.onboarding_complete, false);
      eq(profile0.consent_version, RD.config.consentVersion);
      ok(profile0.consent_at);
      const ex = S.exportData();
      eq(ex.consents.length, 1);
      eq(ex.consents[0].version, RD.config.consentVersion);
      eq(ex.consents[0].withdrawn_at, null);
    });
    test('รหัสผ่านไม่ถูกเก็บเป็นข้อความธรรมดา และส่งออกข้อมูลไม่มี hash/รหัสผ่าน', () => {
      const raw = localStorage.getItem('reday2test.accounts');
      notOk(raw.includes('test-pass-1'));
      const dump = JSON.stringify(S.exportData());
      notOk(/test-pass-1|"pw"|"rec"|salt/.test(dump));
    });

    S.logout();
    const wrong = await S.login({ email: 'tester@example.test', password: 'wrong-pass' });
    const none = await S.login({ email: 'nobody@example.test', password: 'whatever1' });
    const right = await S.login({ email: 'TESTER@example.test', password: 'test-pass-1' });
    test('เข้าสู่ระบบ: รหัสผิดและอีเมลที่ไม่มีให้ผลเหมือนกัน (ไม่บอกว่ามีอีเมลในระบบหรือไม่)', () => {
      eq(wrong, { ok: false, error: 'invalid' });
      eq(none, { ok: false, error: 'invalid' });
      ok(right.ok);
    });

    // ลืมรหัสผ่านด้วยรหัสกู้คืน
    const code = S.takePendingRecovery();
    S.clearPendingRecovery();
    const code2 = await S.newRecoveryCode();
    test('รหัสกู้คืน: ตั้งรหัสผ่านใหม่ได้เฉพาะเมื่อรหัสถูก รหัสเดิมใช้ไม่ได้หลังสร้างใหม่', async () => {
      ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code2));
      eq(await S.verifyRecovery('tester@example.test', code), false);
      eq(await S.verifyRecovery('nobody@example.test', code2), false);
      eq(await S.verifyRecovery('tester@example.test', code2.toLowerCase()), true);
      const r = await S.resetWithRecovery({ email: 'tester@example.test', code: code2, newPassword: 'new-pass-9' });
      ok(r.ok);
      // รหัสกู้คืนใช้ได้ครั้งเดียว: ใช้แล้วรหัสเดิมใช้ไม่ได้ และออกรหัสใหม่ให้
      ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(r.newCode));
      eq(await S.verifyRecovery('tester@example.test', code2), false);
      eq(await S.verifyRecovery('tester@example.test', r.newCode), true);
      eq((await S.resetWithRecovery({ email: 'tester@example.test', code: code2, newPassword: 'zzzzzzz' })).ok, false);
      S.logout();
      eq((await S.login({ email: 'tester@example.test', password: 'test-pass-1' })).ok, false);
      ok((await S.login({ email: 'tester@example.test', password: 'new-pass-9' })).ok);
    });
    // รอให้การทดสอบ async ข้างบนเสร็จก่อนทำต่อ
    await TK.results[TK.results.length - 1].pending;

    // เตรียมให้มีเวลาตื่นอยู่แล้ว เพื่อตรวจว่า onboarding ไม่เขียนทับ
    S.upsertLog(DAY, { woke_at: at('07:45').toISOString() });
    S.completeOnboarding({
      usual_bedtime: '01:00', target_bedtime: '23:30', target_wake: '08:00', meal_delay_minutes: 30, track_meals: true,
      tasks: ['เขียนรายงานวิชาเศรษฐศาสตร์', '  ', 'ทำสไลด์พรีเซนต์'],
      chores: ['เก็บโต๊ะเขียนหนังสือ', '', ''],
    });
    const tasksAfter = S.listTasks();
    const choresAfter = S.listChores();

    test('#3 งานที่พิมพ์ใน onboarding แทนที่ตัวอย่าง (ไม่พบ "อ่านสรุปวิชาสถิติ บทที่ 4") ไม่ปนตัวอย่างกับของผู้ใช้', () => {
      ok(tasksAfter.some((t) => t.title === 'เขียนรายงานวิชาเศรษฐศาสตร์' && !t.is_sample));
      ok(tasksAfter.some((t) => t.title === 'ทำสไลด์พรีเซนต์' && !t.is_sample));
      eq(tasksAfter.length, 2);
      eq(tasksAfter.filter((t) => t.is_sample).length, 0);
      eq(choresAfter.length, 1);
      eq(choresAfter.filter((c) => c.is_sample).length, 0);
    });
    test('onboarding เรียกซ้ำไม่ซ้อนตัวอย่าง และลบแถว is_sample เดิมก่อนเพิ่มของผู้ใช้', () => {
      S.completeOnboarding({
        usual_bedtime: '01:00', target_bedtime: '23:30', target_wake: '08:00', meal_delay_minutes: 30, track_meals: true,
        tasks: ['งาน ก', 'งาน ข', 'งาน ค'], chores: ['เช็ดกระจก', 'ถูพื้น', 'จัดตู้เสื้อผ้า'],
      });
      const ts = S.listTasks();
      ok(ts.every((t) => !t.is_sample));
      ok(ts.some((t) => t.title === 'งาน ก'));
      // พิมพ์ครบทุกช่อง → ไม่พบตัวอย่างใด ๆ (เคส e2e ของสเปก: ไม่พบ "อ่านสรุปวิชาสถิติ บทที่ 4")
      eq(ts.filter((t) => RD.config.sampleTasks.some((s) => s.title === t.title)).length, 0);
      // งานที่ผู้ใช้พิมพ์ไว้ก่อนหน้า (2 รายการ) ยังอยู่ + ที่เพิ่มใหม่ 3 รายการ; แถวตัวอย่างเดิม 1 รายการถูกลบ
      eq(ts.length, 5);
      ok(S.listChores().filter((c) => c.is_sample).length === 0);
    });
    test('onboarding สร้าง log วันนี้ใหม่ โดยไม่เขียน woke_at ทับค่าของผู้ใช้', () => {
      eq(new Date(S.getLog(DAY).woke_at).toISOString(), at('07:45').toISOString());
      eq(S.profile().onboarding_complete, true);
    });

    // ------------------------------------------------------------------
    suite('บั๊ก v1 #1 #2: ผู้ใช้ตั้งเวลาเอง และทุกเวลาเป็น HH:mm น.');

    S.upsertLog(DAY, { woke_at: null });
    setNow('12:00');
    test('#1 ตั้งตื่น 11:20 น. แล้วมื้อถัดไปเป็น 11:50 น. ทั้งหน้า วันนี้ และ แผน', () => {
      S.upsertLog(DAY, { woke_at: T.resolveInLogDay(DAY, T.parseHM('11:20'), 240).toISOString() });
      const today = renderPage('today').text;
      ok(today.includes('มื้อถัดไป 11:50 น.'), today.slice(0, 400));
      const plan = renderPage('plan').text;
      ok(plan.includes('11:50 น.'));
      ok(plan.includes('11:20 น.'));
    });

    test('ยังไม่บันทึก ≠ ข้าม: ค่าเริ่มต้นคือ unknown, ไม่กินมื้อนี้คือ skipped, ล้างกลับเป็น unknown ได้', () => {
      eq(S.getLog(DAY).meal_status, 'unknown');
      S.setMeal(DAY, 'skipped');
      eq([S.getLog(DAY).meal_status, S.getLog(DAY).first_meal_at], ['skipped', null]);
      S.setMeal(DAY, 'logged', at('12:10'));
      eq(S.getLog(DAY).meal_status, 'logged');
      S.setMeal(DAY, 'unknown');
      eq([S.getLog(DAY).meal_status, S.getLog(DAY).first_meal_at], ['unknown', null]);
    });

    test('TimePicker เปิดมาพร้อมเวลาปัจจุบัน แก้ได้ก่อนบันทึก และไม่มี <input type="time"> ในแอป', async () => {
      setNow('13:07');
      const p = RD.ui.pickTime({ title: 'ทดสอบ' });
      eq(overlay.querySelector('.tp-display').textContent, '13:07 น.');
      eq(overlay.querySelector('.tp-input').getAttribute('inputmode'), 'numeric');
      eq(overlay.querySelectorAll('.tp-grid.hours .tp-cell').length, 24);
      eq(overlay.querySelectorAll('.tp-grid.mins .tp-cell').length, 12);
      overlay.querySelectorAll('.tp-grid.hours .tp-cell')[9].click();
      overlay.querySelector('.sheet .btn.primary').click();
      const r = await p;
      eq(r.minutes, 9 * 60 + 7);
      ok(r.edited);
      closeSheets();
      setNow('12:00');
    });
    await TK.results[TK.results.length - 1].pending; // เทสต์ async ต้องจบก่อนข้อถัดไป (ใช้ overlay/นาฬิการ่วมกัน)

    // ------------------------------------------------------------------
    suite('บั๊ก v1 #4 #5: ไทเมอร์ห้องและสถานะเดียวกันทุกหน้า');

    const plan0 = S.plan();
    const cid = plan0.chore.chore.id;
    S.startChore(cid, plan0.logDate, 10);
    test('#4 เริ่มไทเมอร์ 10 นาทีแล้ว งานยังไม่เสร็จ (ทั้ง วันนี้ แผน ห้อง)', () => {
      const p = S.plan();
      eq(p.chore.state, 'running');
      ok(renderPage('today').text.includes('กำลังจับเวลาอยู่'));
      ok(renderPage('plan').root.querySelector('.tl-item.room.doing'));
      ok(renderPage('room').root.querySelector('.timer-card .ring'));
      notOk(S.listCompletions().some((c) => c.completed_at));
    });
    test('#4 ครบเวลาแล้วก็ยังไม่เสร็จเอง และรีโหลด (คำนวณจากข้อมูลที่เก็บ) แล้วนับต่อได้', () => {
      T.clock.offsetMs += 11 * 60000;
      const p = S.plan();
      eq(p.chore.state, 'running');
      const r = renderPage('room');
      ok(r.text.includes('ครบเวลาแล้ว เสร็จหรือยัง?'));
      notOk(S.listCompletions().some((c) => c.completed_at));
    });
    test('#4/#5 กด เสร็จ แล้วเสร็จตรงกันทั้ง 3 หน้า และมีแถวเดียวต่อ (chore_id, log_date)', () => {
      S.completeChore(cid, S.plan().logDate);
      S.startChore(cid, S.plan().logDate, 10); // เริ่มซ้ำหลังเสร็จ ต้องไม่สร้างแถวซ้ำหรือทำให้เสร็จหาย
      const p = S.plan();
      eq(p.chore.state, 'done');
      ok(renderPage('today').text.includes('เสร็จแล้ว'));
      ok(renderPage('plan').root.querySelector('.tl-item.room.done'));
      ok(renderPage('room').text.includes('เสร็จแล้ว'));
      eq(S.listCompletions().filter((c) => c.chore_id === cid).length, 1);
    });
    test('#5 ชื่องานห้องซ้ำถูกปฏิเสธ (ไม่สนตัวพิมพ์/ช่องว่าง) และเพิ่มใหม่ได้หลังลบ', () => {
      eq(S.addChore({ title: ' เช็ดกระจก ' }).error, 'duplicate');
      eq(S.addChore({ title: 'เช็ด กระจก' }).ok, true);
      const c = S.listChores().find((x) => x.title === 'เช็ดกระจก');
      S.archiveChore(c.id);
      eq(S.addChore({ title: 'เช็ดกระจก' }).ok, true);
    });
    test('#5 แก้ชื่องานห้องให้ซ้ำกับงานอื่นถูกปฏิเสธ', () => {
      const [a, b] = S.listChores();
      eq(S.updateChore(a.id, { title: b.title.toUpperCase() }).error, 'duplicate');
      eq(S.updateChore(a.id, { title: a.title }).ok, true);
    });

    // ------------------------------------------------------------------
    suite('หลักอิสระของผู้ใช้: เปลี่ยน เลื่อน ข้าม ลบ แก้ย้อนหลัง');

    const resetDay = () => {
      Object.keys(localStorage); // no-op
      S.deleteLog(DAY);
      S.upsertLog(DAY, { woke_at: at('08:30').toISOString() });
    };
    test('พลังงานที่ผู้ใช้เลือกชนะกฎ และล้างเพื่อให้ระบบเดาใหม่ได้', () => {
      resetDay();
      setNow('11:00');
      S.upsertLog(DAY, { woke_at: at('10:30').toISOString(), energy_override: 'good' });
      eq([S.plan().energy.level, S.plan().energy.source], ['good', 'user']);
      S.upsertLog(DAY, { energy_override: null });
      eq(S.plan().energy.source, 'rule');
    });
    test('เลื่อนงานไปพรุ่งนี้: ไม่ถูกลบ ไม่ถูกเลือกวันนี้ กลับมาพรุ่งนี้ และนับ postponed_count', () => {
      resetDay();
      setNow('09:00');
      const p = S.plan();
      const t = p.taskCard.task;
      S.postponeTask(t.id, p.logDate);
      const q = S.plan();
      notOk(q.taskCard && q.taskCard.task && q.taskCard.task.id === t.id);
      eq(S.getTask(t.id).postponed_count, 1);
      eq(S.getTask(t.id).status, 'todo');
      setNow('09:00', '2026-10-02');
      const tomorrow = S.plan();
      eq(tomorrow.logDate, '2026-10-02');
      ok(S.listTasks().find((x) => x.id === t.id).postponed_until <= tomorrow.logDate);
      setNow('09:00');
      S.unpostponeTask(t.id);
    });
    test('เปลี่ยนอันอื่น (swap) และข้ามวันนี้: ไม่เป็นความล้มเหลว ไม่มีสถานะแดง', () => {
      resetDay();
      const p = S.plan();
      const t = p.taskCard.task;
      S.swapItem(DAY, 'task', t.id);
      const q = S.plan();
      ok(!q.taskCard || q.taskCard.task.id !== t.id);
      S.unswapItem(DAY, 'task', t.id);
      S.upsertLog(DAY, { skipped_task: true });
      eq(S.plan().taskCard.state, 'skipped');
      notOk(S.plan().flags.some((f) => f.key === 'main_task_not_started'));
      S.upsertLog(DAY, { skipped_task: false });
    });
    test('งานของผู้ใช้เพิ่ม แก้ ลบได้ (ชื่อว่างถูกปฏิเสธเบา ๆ) และแก้แล้วไม่ใช่ตัวอย่างอีก', () => {
      eq(S.addTask({ title: '   ' }).error, 'empty_title');
      const r = S.addTask({ title: 'อ่านบทที่ 5', minutes: 30, energy_needed: 'low', due_date: '2026-10-03', is_micro: false });
      ok(r.ok);
      eq(S.updateTask(r.task.id, { title: 'อ่านบทที่ 5 ให้จบ' }).task.title, 'อ่านบทที่ 5 ให้จบ');
      S.removeTask(r.task.id);
      ok(!S.getTask(r.task.id));
    });
    test('แก้ข้อมูลย้อนหลังได้ และ planForDay คำนวณสรุปของวันนั้นใหม่; ลบบันทึกได้', () => {
      const d = '2026-09-28';
      S.upsertLog(d, { woke_at: at('09:00', d).toISOString(), meal_status: 'skipped' });
      const day = S.planForDay(d);
      ok(day.summary.chips.some((c) => c.key === 'missing_meal'));
      S.upsertLog(d, { meal_status: 'logged', first_meal_at: at('09:40', d).toISOString() });
      notOk(S.planForDay(d).summary.chips.some((c) => c.key === 'missing_meal'));
      S.deleteLog(d);
      eq(S.getLog(d), null);
    });
    test('วันนี้ขอเบา ๆ: ซ่อนการ์ดงาน เหลืองานห้อง 5 นาที ปิดเตือน ไม่มี flags', () => {
      setNow('22:50');
      S.upsertLog(DAY, { woke_at: at('12:00').toISOString(), day_mode: 'light' });
      const p = S.plan();
      eq(p.mode, 'light');
      eq(p.taskCard, null);
      eq(p.nudges.length, 0);
      eq(p.flags.length, 0);
      const t = renderPage('today');
      ok(t.text.includes('วันนี้ขอเบา ๆ — เหลือแค่สิ่งจำเป็น'));
      ok(t.text.includes('กลับโหมดปกติ'));
      notOk(t.root.querySelector('.pcard.work'));
      S.upsertLog(DAY, { day_mode: 'normal' });
    });
    test('หน้า วันนี้ มีปุ่มหลักปุ่มเดียว (ตัวเลือกอื่นอยู่ในเมนู …)', () => {
      setNow('12:00');
      S.upsertLog(DAY, { woke_at: at('08:30').toISOString() });
      const t = renderPage('today');
      eq(t.root.querySelectorAll('.btn.primary').length, 1);
      ok(t.root.querySelectorAll('.pcard .more').length >= 3);
    });
    test('ซ่อนเสา กิน: ไม่มีการ์ดกิน แถวมื้อ ข้อความมื้อ หรือ flag มื้อ ทุกหน้า', () => {
      S.updateProfile({ track_meals: false });
      setNow('14:00');
      S.upsertLog(DAY, { woke_at: at('09:00').toISOString(), meal_status: 'unknown' });
      for (const name of ['today', 'plan', 'summary', 'history', 'me']) {
        const r = renderPage(name);
        notOk(r.root.querySelector('.pcard.meal'), name);
        if (name !== 'me') notOk(/มื้อ/.test(r.text), `${name} ยังมีคำว่า มื้อ`);
      }
      eq(S.plan().nudges.filter((n) => n.kind === 'meal').length, 0);
      S.updateProfile({ track_meals: true });
    });

    // ------------------------------------------------------------------
    suite('การเตือนในแอป (เฟส A) และบันทึกสถานะกันเตือนซ้ำ');
    test('markReminder กันเตือนซ้ำชนิดเดิมในวันนั้น (reminder_state unique ต่อ วัน+ชนิด)', () => {
      S.deleteLog(DAY);
      S.upsertLog(DAY, { woke_at: at('09:00').toISOString() });
      setNow('09:40');
      ok(S.plan().nudges.some((n) => n.kind === 'meal'));
      S.markReminder(DAY, 'meal', 'fired_at');
      S.markReminder(DAY, 'meal', 'dismissed_at');
      notOk(S.plan().nudges.some((n) => n.kind === 'meal'));
      eq(S.exportData().reminder_state.filter((r) => r.kind === 'meal').length, 1);
    });
    test('analytics: track() ไม่เก็บข้อความอิสระ/ข้อมูลระบุตัวตนใน props', () => {
      S.track('time_logged', { kind: 'wake', edited: true, note: 'ข้อความอิสระยาวเกินกว่าจะเป็นชื่อเหตุการณ์ที่อนุญาตให้เก็บ', who: { a: 1 } });
      const e = S.exportData().events.slice(-1)[0];
      eq(e.name, 'time_logged');
      eq(e.props, { kind: 'wake', edited: true });
    });

    // ------------------------------------------------------------------
    suite('สแกนทุกหน้า: ไม่มี AM/PM, ไม่มี <input type="time">, ไม่มีคำต้องห้าม');

    const scenes = [
      { name: 'เช้า ยังไม่บันทึกอะไร', now: '08:00', day: DAY, prep: () => { S.deleteLog(DAY); } },
      { name: 'ตื่นสาย มื้อ unknown เลยเวลา', now: '12:00', day: DAY, prep: () => { S.deleteLog(DAY); S.upsertLog(DAY, { woke_at: at('10:30').toISOString() }); S.upsertLog(T.addDays(DAY, -1), { bedtime_at: at('03:30').toISOString() }); } },
      { name: 'ไม่กินมื้อนี้ + ช่วงเย็น', now: '20:30', day: DAY, prep: () => { S.deleteLog(DAY); S.upsertLog(DAY, { woke_at: at('09:00').toISOString(), meal_status: 'skipped' }); } },
      { name: 'โหมดขอเบา ๆ', now: '15:00', day: DAY, prep: () => { S.upsertLog(DAY, { woke_at: at('09:00').toISOString(), day_mode: 'light' }); } },
      { name: 'ดึก 01:30 (ยังเป็นวันเดิม)', now: '01:30', day: '2026-10-02', prep: () => { S.upsertLog(DAY, { day_mode: 'normal', woke_at: at('11:00').toISOString(), bedtime_at: null }); } },
      { name: 'พลังงาน ดี + ทุกอย่างเสร็จ', now: '18:00', day: DAY, prep: () => { S.deleteLog(DAY); S.upsertLog(DAY, { woke_at: at('08:00').toISOString(), energy_override: 'good', meal_status: 'logged', first_meal_at: at('08:40').toISOString(), bedtime_at: at('23:30').toISOString() }); } },
    ];
    const pagesAuthed = ['today', 'plan', 'room', 'summary', 'history', 'me'];
    for (const sc of scenes) {
      test(`หน้าที่ล็อกอินทั้งหมด: ${sc.name}`, () => {
        sc.prep();
        setNow(sc.now, sc.day);
        for (const name of pagesAuthed) {
          const r = renderPage(name);
          for (const re of BANNED) notOk(re.test(r.text), `${name}: พบ ${re}`);
          notOk(r.root.querySelector('input[type=time]'), `${name}: พบ input[type=time]`);
          ok(r.text.trim().length > 20, `${name}: หน้าว่าง`);
        }
      });
    }
    test('หน้าสาธารณะและ onboarding: ไม่มีคำต้องห้าม และมีข้อความข้อมูลไม่ใช่คำแนะนำทางการแพทย์', () => {
      for (const name of ['landing', 'auth', 'forgot', 'privacy', 'terms', 'help', 'onboarding']) {
        const r = renderPage(name);
        for (const re of BANNED) notOk(re.test(r.text), `${name}: พบ ${re}`);
        notOk(r.root.querySelector('input[type=time]'));
      }
      ok(renderPage('landing').text.includes('ข้อมูลในแอปไม่ใช่คำแนะนำทางการแพทย์'));
      const help = renderPage('help').text;
      ok(help.includes('1323') && help.includes('ข้อมูลในแอปไม่ใช่คำแนะนำทางการแพทย์'));
      const landing = renderPage('landing').text;
      for (const s of ['วันนี้ไม่ต้องเริ่มใหม่ทั้งชีวิต แค่รีเซ็ตวันนี้', 'เริ่มรีเซ็ตวันนี้', 'สี่เสาของวัน', 'ใช้เวลาตั้งค่าไม่ถึง 2 นาที']) ok(landing.includes(s), s);
    });
    test('แผ่น/เมนู/ไทม์พิกเกอร์ที่เปิดจากหน้าต่าง ๆ ไม่มีคำต้องห้ามและไม่มี AM/PM', () => {
      setNow('12:00');
      S.deleteLog(DAY);
      S.upsertLog(DAY, { woke_at: at('10:30').toISOString() });
      const plan = S.plan();
      const texts = [];
      const grab = () => { texts.push(visibleText(overlay)); closeSheets(); };
      A.taskSheet(null); grab();
      A.taskSheet(S.listTasks()[0]); grab();
      A.choreSheet(null); grab();
      A.editEnergy(plan); grab();
      A.resetNow(plan, () => {}); grab();
      A.winddownSheet(plan); grab();
      A.taskMenu(plan); grab();
      A.choreMenu(plan); grab();
      A.mealMenu(plan); grab();
      A.sleepMenu(plan); grab();
      RD.ui.pickTime({ title: 'ทดสอบ' }); grab();
      ok(texts.length === 11 && texts.every((t) => t.trim().length > 5));
      for (const t of texts) for (const re of BANNED) notOk(re.test(t), `แผ่น: พบ ${re} ใน ${t.slice(0, 60)}`);
    });
    test('เวลาที่แสดงทั้งหมดอยู่ในรูป HH:mm น. (ไม่มีเวลารูป 1:05 หรือมี AM/PM) ในหน้า วันนี้ และ แผน', () => {
      setNow('12:00');
      S.deleteLog(DAY);
      S.upsertLog(DAY, { woke_at: at('09:05').toISOString(), meal_status: 'logged', first_meal_at: at('09:40').toISOString() });
      for (const name of ['today', 'plan']) {
        const text = renderPage(name).text;
        const times = text.match(/\d{1,2}:\d{2}/g) || [];
        ok(times.length > 3, `${name} ควรมีเวลาหลายค่า`);
        for (const tm of times) ok(/^\d{2}:\d{2}$/.test(tm), `${name}: เวลารูปผิด ${tm}`);
        notOk(/\d{1,2}:\d{2}\s*(น\.)?\s*[AP]M/i.test(text));
      }
    });

    // ------------------------------------------------------------------
    suite('บั๊กจาก QA รอบ 2: ปุ่มและแผ่นต่าง ๆ');

    const clickText = (root, text) => [...root.querySelectorAll('button, a')].find((b) => b.textContent.trim().includes(text));
    const typeInto = (input, value) => {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const submit = (form) => form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

    test('กดบันทึกงานซ้ำ/ดับเบิลคลิก ไม่สร้างงานซ้ำ และข้อความเตือน "ใส่ชื่องาน" หายเมื่อเริ่มพิมพ์', () => {
      setNow('12:00');
      const before = S.listTasks().length;
      A.taskSheet(null);
      const sheet = overlay.querySelector('.sheet');
      const input = sheet.querySelector('input[type=text]');
      const form = sheet.querySelector('form');
      submit(form);
      ok(sheet.querySelector('.field-error').textContent.includes('ใส่ชื่องาน'));
      typeInto(input, 'งานดับเบิลคลิก');
      eq(sheet.querySelector('.field-error').textContent, '');
      submit(form);
      submit(form);
      eq(S.listTasks().length, before + 1);
      eq(S.listTasks().filter((t) => t.title === 'งานดับเบิลคลิก').length, 1);
      closeSheets();
    });
    test('ส่งความเห็นซ้ำ (ดับเบิลคลิก) ได้ความเห็นเดียว', () => {
      const before = S.exportData().feedback.length;
      const r = renderPage('me');
      clickText(r.root, 'ส่งความเห็น').click();
      const sheet = overlay.querySelector('.sheet');
      typeInto(sheet.querySelector('textarea'), 'ทดสอบดับเบิลคลิก');
      submit(sheet.querySelector('form'));
      submit(sheet.querySelector('form'));
      eq(S.exportData().feedback.length, before + 1);
      closeSheets();
    });
    test('ไม่มีคำว่า null/undefined/NaN: โหมดขอเบา ๆ, ซ่อนเสา กิน และแผ่นแก้ข้อมูลย้อนหลัง', () => {
      const bad = /\b(null|undefined|NaN)\b/;
      S.deleteLog(DAY);
      setNow('13:00');
      S.upsertLog(DAY, { woke_at: at('09:00').toISOString(), day_mode: 'light' });
      for (const name of pagesAuthed) notOk(bad.test(renderPage(name).text), `${name} (โหมดเบา ๆ)`);
      S.upsertLog(DAY, { day_mode: 'normal' });
      S.updateProfile({ track_meals: false });
      for (const name of pagesAuthed) notOk(bad.test(renderPage(name).text), `${name} (ซ่อนเสา กิน)`);
      renderPage('history').root.querySelector('.hist-day').click();
      const sheetText = visibleText(overlay);
      notOk(bad.test(sheetText), 'แผ่นแก้ย้อนหลัง: ' + sheetText.slice(0, 80));
      closeSheets();
      S.updateProfile({ track_meals: true });
    });
    test('วงแหวนไทเมอร์ใช้สีตามเสา: งานห้อง = amber, งาน = sage', () => {
      S.deleteLog(DAY);
      setNow('12:00');
      S.upsertLog(DAY, { woke_at: at('09:00').toISOString(), meal_status: 'logged', first_meal_at: at('09:30').toISOString() });
      const p = S.plan();
      S.startChore(p.chore.chore.id, p.logDate, 10);
      eq(renderPage('room').root.querySelector('.ring').style.getPropertyValue('--p'), 'var(--amber)');
      S.cancelChore(p.chore.chore.id, p.logDate);
      const t = S.plan().taskCard.task;
      S.startTask(t.id, { micro: false });
      eq(A.timerPanel({}).el.querySelector('.ring').style.getPropertyValue('--p'), 'var(--sage)');
      S.cancelTask(t.id);
    });
    test('ไทเมอร์เดินได้ครั้งละอัน: เริ่มงานขณะไทเมอร์ห้องเดินอยู่ ต้องไม่เริ่มและเปิดไทเมอร์เดิมให้', () => {
      const p = S.plan();
      S.startChore(p.chore.chore.id, p.logDate, 10);
      const t = S.listTasks().find((x) => x.status === 'todo');
      eq(A.startTask(t.id, false), false);
      eq(S.getTask(t.id).status, 'todo');
      ok(overlay.querySelector('.sheet .timer-card'), 'ควรเปิดแผ่นไทเมอร์ที่เดินอยู่');
      closeSheets();
      S.cancelChore(p.chore.chore.id, p.logDate);
      eq(A.startTask(t.id, false), true); // ไม่มีไทเมอร์เดินแล้ว เริ่มได้
      S.cancelTask(t.id);
    });
    test('TimePicker: พิมพ์ค่าเกิน/พิมพ์ไม่ครบแล้วกดบันทึก ต้องไม่บันทึกเงียบ ๆ ด้วยค่าเดิม และบอกเบา ๆ', async () => {
      setNow('13:07');
      let resolved = false;
      let value;
      const p = RD.ui.pickTime({ title: 'ทดสอบ' }).then((r) => { resolved = true; value = r; return r; });
      const input = overlay.querySelector('.tp-input');
      const typeDigits = (v) => { input.value = ''; for (const ch of v) { input.value += ch; input.dispatchEvent(new Event('input', { bubbles: true })); } };
      const save = () => overlay.querySelector('.sheet .btn.primary').click();
      eq(overlay.querySelectorAll('.sheet').length, 1, 'ควรมีแผ่นเดียวก่อนเริ่ม');
      typeDigits('2575');
      save();
      await sleep(30);
      notOk(resolved, `ค่าเกินช่วงต้องไม่ถูกบันทึก (แผ่นที่เหลือ ${overlay.querySelectorAll('.sheet').length}, ช่องพิมพ์ "${input.value}", ค่าที่ได้ ${JSON.stringify(value)})`);
      ok(overlay.querySelector('.tp-hint').textContent.includes('ชั่วโมงมี 00–23'));
      typeDigits('08');
      save();
      await sleep(30);
      notOk(resolved, 'ค่าที่พิมพ์ค้างต้องไม่ถูกบันทึก');
      ok(overlay.querySelector('.tp-hint').textContent.includes('ให้ครบ'));
      typeDigits('0830');
      save();
      const r = await p;
      eq(r.minutes, 8 * 60 + 30);
      closeSheets();
      setNow('12:00');
    });
    await TK.results[TK.results.length - 1].pending; // ทดสอบแบบ async ต้องจบก่อนข้อถัดไป (ใช้ overlay/นาฬิการ่วมกัน)
    test('onboarding ขั้น 3: ช่องงาน 3 ช่อง และงานห้อง 3 ช่อง (ตามสเปก ไม่ใช่ 5)', () => {
      const r = renderPage('onboarding');
      clickText(r.root, 'ต่อไป').click();
      clickText(r.root, 'ต่อไป').click();
      eq(r.root.querySelectorAll('input[type=text]').length, 6);
      clickText(r.root, 'ย้อนกลับ').click();
      clickText(r.root, 'ย้อนกลับ').click();
    });
    test('รหัสกู้คืน: สร้างแบบร่างแล้วยังไม่แทนรหัสเดิมจนกว่าจะกดบันทึกรหัสนี้ (ปิดแผ่นโดยไม่จดไม่ทำให้รหัสหาย)', async () => {
      const email = 'tester@example.test';
      const old = await S.newRecoveryCode();
      const draft = S.draftRecoveryCode();
      eq(await S.verifyRecovery(email, old), true);
      eq(await S.verifyRecovery(email, draft), false);
      ok(await S.commitRecoveryCode(draft));
      eq(await S.verifyRecovery(email, draft), true);
      eq(await S.verifyRecovery(email, old), false);
    });
    await TK.results[TK.results.length - 1].pending;

    // ------------------------------------------------------------------
    suite('รอบ 3: ความปลอดภัยบัญชี, ความยินยอม, onboarding');

    test('เปลี่ยนรหัสผ่านต้องยืนยันรหัสเดิม: รหัสเดิมผิด/รหัสใหม่สั้น ถูกปฏิเสธ แล้วเปลี่ยนได้เมื่อถูกต้อง', async () => {
      eq((await S.changePassword({ current: 'wrong-current', next: 'another-pass-1' })).error, 'wrong_current');
      eq((await S.changePassword({ current: '', next: 'another-pass-1' })).error, 'wrong_current');
      eq((await S.changePassword({ current: 'new-pass-9', next: '123' })).error, 'short_password');
      ok((await S.changePassword({ current: 'new-pass-9', next: 'changed-pass-2' })).ok);
      S.logout();
      eq((await S.login({ email: 'tester@example.test', password: 'new-pass-9' })).ok, false);
      ok((await S.login({ email: 'tester@example.test', password: 'changed-pass-2' })).ok);
      // คืนรหัสเดิมให้ชุดทดสอบข้อหลัง ๆ
      ok((await S.changePassword({ current: 'changed-pass-2', next: 'new-pass-9' })).ok);
    });
    await TK.results[TK.results.length - 1].pending;

    test('ฟอร์มเปลี่ยนรหัสผ่านใน "ฉัน": มีช่องรหัสเดิม แสดงข้อความไทยเบา ๆ และกดซ้ำไม่ทำซ้ำ', async () => {
      const r = renderPage('me');
      clickText(r.root, 'เปลี่ยนรหัสผ่าน').click();
      const sheet = overlay.querySelector('.sheet');
      const [cur, next] = sheet.querySelectorAll('input[type=password]');
      ok(cur && next, 'ต้องมี 2 ช่อง');
      typeInto(cur, 'ผิดแน่นอน');
      typeInto(next, 'brand-new-pass');
      submit(sheet.querySelector('form'));
      await sleep(900);
      eq(sheet.querySelector('.field-error').textContent, 'รหัสผ่านที่ใช้อยู่ไม่ถูกต้อง');
      typeInto(cur, 'new-pass-9');
      eq(sheet.querySelector('.field-error').textContent, ''); // เริ่มพิมพ์ใหม่ ข้อความหาย
      closeSheets();
    });
    await TK.results[TK.results.length - 1].pending;

    test('ความยินยอม: เวอร์ชันเปลี่ยนต้องขอใหม่ ยอมรับแล้วเก็บแถวใหม่ใน consents (เวอร์ชัน + เวลา) และของเดิมไม่ถูกลบ', () => {
      notOk(S.needsConsent());
      S.updateProfile({ consent_version: '2000-01-01-old' });
      ok(S.needsConsent());
      const before = S.exportData().consents.length;
      S.acceptConsent();
      notOk(S.needsConsent());
      const ex = S.exportData();
      eq(ex.consents.length, before + 1);
      eq(ex.consents[ex.consents.length - 1].version, RD.config.consentVersion);
      ok(ex.consents[ex.consents.length - 1].accepted_at);
      eq(ex.profile.consent_version, RD.config.consentVersion);
    });

    test('onboarding: มีปุ่ม ออกจากระบบ ในหัวหน้า (ไม่ติดอยู่ในขั้นตอนตั้งค่า)', () => {
      const acts = P.onboarding.actions({ go() {} });
      eq(acts.length, 1);
      eq(acts[0].textContent, 'ออกจากระบบ');
      S.completeOnboarding({ usual_bedtime: '01:00', target_bedtime: '23:30', target_wake: '08:00', meal_delay_minutes: 30, track_meals: true, tasks: [], chores: [] });
    });

    test('onboarding: ความคืบหน้าอยู่รอดเมื่อรีโหลดหน้า (กู้ขั้นและข้อความที่พิมพ์ ไม่มีรหัสผ่าน/ข้อมูลลับใน storage)', () => {
      const r1 = renderPage('onboarding');
      clickText(r1.root, 'ต่อไป').click();
      clickText(r1.root, 'ต่อไป').click();
      const ins = r1.root.querySelectorAll('input[type=text]');
      typeInto(ins[0], 'งานที่พิมพ์ค้างไว้');
      typeInto(ins[3], 'งานห้องที่พิมพ์ค้างไว้');
      // "รีโหลด" = render ใหม่ (state ในหน่วยความจำของ onboarding ถูกอ่านจากฉบับร่างใน sessionStorage)
      const r2 = renderPage('onboarding');
      const ins2 = r2.root.querySelectorAll('input[type=text]');
      eq(ins2.length, 6);
      eq([ins2[0].value, ins2[3].value], ['งานที่พิมพ์ค้างไว้', 'งานห้องที่พิมพ์ค้างไว้']);
      const draftKeys = Object.keys(sessionStorage).filter((k) => k.startsWith('reday2test.onb.'));
      eq(draftKeys.length, 1);
      notOk(/pass|code|รหัส/i.test(sessionStorage.getItem(draftKeys[0])));
      clickText(r2.root, 'ย้อนกลับ').click();
      clickText(r2.root, 'ย้อนกลับ').click();
      draftKeys.forEach((k) => sessionStorage.removeItem(k));
      renderPage('onboarding'); // กลับค่าเริ่มต้น
    });

    test('CTA จาก Landing เปิดหน้า สมัคร เสมอ ไม่ค้างโหมด เข้าสู่ระบบ จากครั้งก่อน', () => {
      const a1 = renderPage('auth');
      clickText(a1.root, 'มีบัญชีอยู่แล้ว').click();
      ok(a1.root.querySelector('h1').textContent.includes('ยินดีต้อนรับกลับมา'));
      const land = renderPage('landing');
      land.root.querySelector('a.btn.primary.big').click(); // เป็นลิงก์ #/auth (หน้าทดสอบไม่มี router จึงแค่เปลี่ยน hash)
      ok(renderPage('auth').root.querySelector('h1').textContent.includes('สมัครใช้ ReDay'));
    });
    test('onboarding หน้าสุดท้ายเมื่อไม่มีรหัสกู้คืนให้แสดง (หลังรีโหลด) ต้องบอกทางสร้างใหม่ ไม่เงียบ', () => {
      S.clearPendingRecovery();
      const r = renderPage('onboarding');
      clickText(r.root, 'ต่อไป').click();
      clickText(r.root, 'ต่อไป').click();
      clickText(r.root, 'เสร็จสิ้น').click();
      ok(r.root.textContent.includes('พร้อมรีเซ็ตวันนี้แล้ว'));
      ok(r.root.textContent.includes('ยังไม่ได้จดรหัสกู้คืน'), 'ควรมีข้อความแนะนำ');
      notOk(r.root.querySelector('.recovery'));
      clickText(r.root, 'ไปหน้าวันนี้').click();
    });

    // ------------------------------------------------------------------
    suite('เลย์เอาต์ 390×844 (บั๊ก v1 #8): toast ไม่ทับชื่อหน้า, แท็บ สรุป/ฉัน กดได้');

    const clearNs = (storage, prefix) => Object.keys(storage).filter((k) => k.startsWith(prefix)).forEach((k) => storage.removeItem(k));
    /**
     * เปิดแอปจริงใน iframe 390×844 ด้วย namespace แยก (reday2iframe) — ต้องแยก เพราะแท็บ/เฟรมที่ใช้ namespace เดียวกัน
     * จะซิงก์ข้อมูลหากัน (ฟีเจอร์หลายแท็บ) และจะสลับ session ของหน้าทดสอบหลักไปด้วย
     */
    async function openApp(nowIso, user) {
      clearNs(localStorage, 'reday2iframe');
      const fr = document.createElement('iframe');
      fr.style.cssText = 'position:absolute;left:-9999px;top:0;width:390px;height:844px;border:0';
      fr.src = `../index.html?nosw=1&ns=reday2iframe&now=${encodeURIComponent(nowIso)}`;
      document.body.appendChild(fr);
      await new Promise((r) => (fr.onload = r));
      const w = fr.contentWindow;
      await w.RD.store.signup({ name: user.name || 'ทดสอบ', email: user.email, password: 'iframe-pass-1', consent: true });
      w.RD.store.completeOnboarding(Object.assign({ usual_bedtime: '01:00', target_bedtime: '23:30', target_wake: '08:00', meal_delay_minutes: 30, track_meals: true, tasks: [], chores: [] }, user.onboarding || {}));
      return { w, d: fr.contentDocument, close() { clearNs(w.localStorage, 'reday2iframe'); fr.remove(); } };
    }

    test('#8 เปิดแอปจริงใน iframe 390×844: toast อยู่ใต้ header, แท็บทุกอันกดได้ (ไม่มี badge/ชั้นอื่นทับ), เนื้อหาท้ายหน้าไม่ถูกแท็บทับ, ไม่ล้นแนวนอน', async () => {
      const app = await openApp('2026-10-01T09:30:00+07:00', { name: 'เลย์เอาต์', email: 'layout@example.test' });
      const { w, d } = app;
      try {
        w.location.hash = '#/today';
        await sleep(400);
        w.RD.ui.toast('บันทึกเวลาตื่นแล้ว');
        const bar = d.querySelector('#appbar').getBoundingClientRect();
        const title = d.querySelector('#appbar .title').getBoundingClientRect();
        const toast = d.querySelector('.toast').getBoundingClientRect();
        ok(toast.top >= bar.bottom - 1, `toast (${Math.round(toast.top)}) ทับ header (${Math.round(bar.bottom)})`);
        ok(toast.top >= title.bottom, 'toast ทับชื่อหน้า');
        ok(d.querySelector('.toast').getAttribute('role') === 'status');
        for (const tab of ['today', 'plan', 'room', 'summary', 'me']) {
          w.location.hash = '#/' + tab;
          await sleep(300);
          const tabs = [...d.querySelectorAll('#tabbar a.tab')];
          eq(tabs.length, 5);
          for (const a of tabs) {
            const r = a.getBoundingClientRect();
            ok(r.height >= 44 && r.width >= 44, `${a.textContent} เล็กกว่า 44px`);
            const hit = d.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            ok(hit && hit.closest('a.tab') === a, `แท็บ ${a.textContent} ถูกชั้นอื่นทับ (${hit && hit.className})`);
          }
          const view = d.querySelector('#view');
          view.scrollTop = view.scrollHeight;
          const tabTop = d.querySelector('#tabbar').getBoundingClientRect().top;
          const lastBottom = view.lastElementChild.getBoundingClientRect().bottom;
          ok(lastBottom <= tabTop - 8, `${tab}: เนื้อหาท้ายหน้าถูกแถบแท็บทับ (${Math.round(lastBottom)} > ${Math.round(tabTop)})`);
          ok(view.scrollWidth <= view.clientWidth + 1 && d.documentElement.scrollWidth <= d.documentElement.clientWidth + 1, `${tab}: ล้นแนวนอน`);
        }
      } finally {
        app.close(); // ลบเฉพาะ namespace ของชุดทดสอบ ห้ามแตะข้อมูลจริงของ origin เดียวกัน
      }
    });
    await TK.results[TK.results.length - 1].pending;

    test('ข้อความยาวไม่มีช่องว่าง (ชื่อละติน 40 ตัว, ชื่องานยาว) ไม่ทำให้หน้าล้นแนวนอนที่ 390px', async () => {
      const longTitle = 'A'.repeat(70) + 'https://example.test/' + 'b'.repeat(60);
      const app = await openApp('2026-10-01T10:00:00+07:00', {
        name: 'N'.repeat(40),
        email: 'long@example.test',
        onboarding: { tasks: [longTitle], chores: ['C'.repeat(80)] },
      });
      const { w, d } = app;
      try {
        w.RD.store.upsertLog('2026-10-01', { woke_at: new Date('2026-10-01T02:00:00Z').toISOString() });
        for (const tab of ['today', 'plan', 'room', 'summary', 'me']) {
          w.location.hash = '#/' + tab;
          await sleep(300);
          const view = d.querySelector('#view');
          ok(view.scrollWidth <= view.clientWidth + 1 && d.documentElement.scrollWidth <= d.documentElement.clientWidth + 1, `${tab}: ล้นแนวนอน (${view.scrollWidth} > ${view.clientWidth})`);
        }
      } finally {
        app.close();
      }
    });
    await TK.results[TK.results.length - 1].pending;

    test('แถบเตือนที่ขึ้นอยู่หายทันทีเมื่อปิดสวิตช์ชนิดนั้น หรือเข้าช่วง Quiet hours (R10)', async () => {
      const app = await openApp('2026-10-01T09:55:00+07:00', { email: 'nudge@example.test' });
      const { w, d } = app;
      try {
        w.RD.store.upsertLog('2026-10-01', { woke_at: new Date('2026-10-01T02:00:00Z').toISOString() }); // ตื่น 09:00 มื้อแนะนำ 09:30
        w.location.hash = '#/today';
        await sleep(500);
        ok(d.querySelector('#banner-slot .banner'), 'ควรมีแถบเตือนมื้อแรก');
        w.RD.store.updateProfile({ notify_meal: false });
        await sleep(300);
        notOk(d.querySelector('#banner-slot .banner'), 'ปิดสวิตช์แล้วแถบต้องหาย');
        // quiet hours ครอบเวลา 09:55: ต้องหายเช่นกัน (ใช้ชนิดงานห้อง/ผ่อนจังหวะไม่ได้ จึงทดสอบกับมื้อ)
        w.RD.store.updateProfile({ notify_meal: true });
        w.RD.store.deleteLog('2026-10-01');
        w.RD.store.upsertLog('2026-10-01', { woke_at: new Date('2026-10-01T02:00:00Z').toISOString() });
        w.location.hash = '#/plan';
        await sleep(300);
        w.location.hash = '#/today';
        await sleep(400);
        ok(d.querySelector('#banner-slot .banner'), 'หลังล้างสถานะ ควรมีแถบเตือนมื้ออีกครั้ง');
        w.RD.store.updateProfile({ quiet_start: '09:00', quiet_end: '10:30' });
        await sleep(300);
        notOk(d.querySelector('#banner-slot .banner'), 'เข้า quiet hours แล้วแถบต้องหาย');
      } finally {
        app.close();
      }
    });
    await TK.results[TK.results.length - 1].pending;

    test('โฟกัสไม่หลุดไป <body> หลังบันทึก/ปิดแผ่น และ Tab วนอยู่ในแผ่น (focus trap)', async () => {
      const app = await openApp('2026-10-01T10:00:00+07:00', { email: 'focus@example.test', onboarding: { tasks: ['งานโฟกัส'], chores: ['ล้างแก้ว'] } });
      const { w, d } = app;
      try {
        w.location.hash = '#/plan';
        await sleep(400);
        w.RD.actions.taskSheet(null);
        await sleep(300);
        const sheet = d.querySelector('.sheet');
        ok(sheet.contains(d.activeElement), 'โฟกัสควรย้ายเข้าแผ่นที่เปิด');
        // Tab จากปุ่มสุดท้ายต้องวนกลับต้นแผ่น ไม่หลุดไปหน้าเบื้องหลัง
        const items = [...sheet.querySelectorAll('button, input, select, textarea')].filter((x) => x.offsetParent !== null && !x.disabled);
        items[items.length - 1].focus();
        d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        ok(sheet.contains(d.activeElement), 'Tab ต้องวนอยู่ในแผ่น');
        // บันทึกแล้วหน้ารีเรนเดอร์ทับ → โฟกัสไม่ควรอยู่ที่ body
        sheet.querySelector('input[type=text]').value = 'งานใหม่โฟกัส';
        sheet.querySelector('form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
        await sleep(500);
        notOk(d.activeElement === d.body, 'โฟกัสหลุดไป body หลังปิดแผ่น');
      } finally {
        app.close();
      }
    });
    await TK.results[TK.results.length - 1].pending;

    test('ขอความยินยอมใหม่ในแอปจริง: แผ่น modal ปิดด้วย Esc/ฉากหลังไม่ได้ ยอมรับแล้วใช้งานต่อ และเปิดหน้านโยบายอ่านได้', async () => {
      const app = await openApp('2026-10-01T10:00:00+07:00', { email: 'consent@example.test' });
      const { w, d } = app;
      try {
        w.location.hash = '#/today';
        await sleep(400);
        notOk(d.querySelector('.sheet'), 'ยังไม่ต้องขอใหม่ เมื่อเวอร์ชันตรงกัน');
        w.RD.store.updateProfile({ consent_version: '2000-01-01-old' });
        await sleep(400);
        const sheet = d.querySelector('.sheet');
        ok(sheet && sheet.textContent.includes('ขอความยินยอมอีกครั้ง'), 'ควรขึ้นแผ่นขอความยินยอมใหม่');
        d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        d.querySelector('.backdrop').click();
        await sleep(300);
        ok(d.querySelector('.sheet'), 'modal ต้องไม่ปิดด้วย Esc/ฉากหลัง');
        notOk(d.querySelector('.sheet-close:not([hidden])'), 'modal ไม่ควรมีปุ่มปิด x');
        // อ่านนโยบายได้: แผ่นปิดชั่วคราว แล้วกลับมาถามอีกเมื่อกลับเข้าหน้าแอป
        [...sheet.querySelectorAll('button')].find((b) => b.textContent.includes('นโยบายความเป็นส่วนตัว')).click();
        await sleep(500);
        eq(w.location.hash, '#/privacy');
        notOk(d.querySelector('.sheet'), 'หน้านโยบายต้องอ่านได้ ไม่มีแผ่นบัง');
        w.location.hash = '#/today';
        await sleep(500);
        const again = d.querySelector('.sheet');
        ok(again && again.textContent.includes('ขอความยินยอมอีกครั้ง'), 'กลับเข้าหน้าแอปแล้วยังไม่ยอมรับ ต้องถามอีก');
        [...again.querySelectorAll('button')].find((b) => b.textContent.includes('ยอมรับและใช้งานต่อ')).click();
        await sleep(500);
        notOk(d.querySelector('.sheet'));
        eq(w.RD.store.needsConsent(), false);
        eq(w.RD.store.exportData().consents.length, 2);
      } finally {
        app.close();
      }
    });
    await TK.results[TK.results.length - 1].pending;

    test('ไม่ยอมรับความยินยอมใหม่ → ออกจากระบบ ข้อมูลยังอยู่; หรือเลือกลบบัญชี (ถามยืนยัน) → ข้อมูลหาย', async () => {
      const app = await openApp('2026-10-01T10:00:00+07:00', { email: 'refuse@example.test' });
      const { w, d } = app;
      try {
        w.RD.store.updateProfile({ consent_version: '2000-01-01-old' });
        w.location.hash = '#/plan';
        await sleep(500);
        [...d.querySelectorAll('.sheet button')].find((b) => b.textContent.includes('ยังไม่ยอมรับ')).click();
        await sleep(500);
        eq(w.RD.store.isLoggedIn(), false);
        notOk(d.querySelector('.sheet'), 'ออกจากระบบแล้วไม่ควรมีแผ่นค้าง');
        // เข้าใหม่แล้วเลือกลบบัญชี
        const r = await w.RD.store.login({ email: 'refuse@example.test', password: 'iframe-pass-1' });
        ok(r.ok);
        w.location.hash = '#/today';
        await sleep(500);
        [...d.querySelectorAll('.sheet button')].find((b) => b.textContent.includes('ไม่ยินยอม ลบบัญชี')).click();
        await sleep(400);
        [...d.querySelectorAll('.sheet button')].find((b) => b.textContent.trim() === 'ลบบัญชี').click();
        await sleep(600);
        eq(w.RD.store.isLoggedIn(), false);
        eq((await w.RD.store.login({ email: 'refuse@example.test', password: 'iframe-pass-1' })).ok, false);
      } finally {
        app.close();
      }
    });
    await TK.results[TK.results.length - 1].pending;

    // ------------------------------------------------------------------
    suite('คู่มือการใช้งาน (/guide)');

    const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
    /** เก็บข้อความของทุก element (เต็ม และเฉพาะข้อความที่เป็นลูกตรง ๆ) เป็นชุดคำที่ "เห็นบนหน้าจอ" */
    const harvest = (root, into) => {
      for (const el of root.querySelectorAll('*')) {
        into.add(squash(el.textContent));
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
        if (squash(own)) into.add(squash(own).replace(/^✓\s*/, '')); // ตัวเลือกที่เลือกอยู่แสดงเป็น "✓ ชื่อ"
      }
    };

    test('คู่มือ: มี h1 เดียว ส่วนหลักครบ ทุกฟีเจอร์มี "คืออะไร" ไม่มีคำต้องห้าม ไม่มี AM/PM และเวลาเป็น HH:mm', () => {
      const r = renderPage('guide');
      eq(r.root.querySelectorAll('h1').length, 1);
      for (const s of ['เริ่มใช้ใน 5 ขั้น', '5 หน้าหลัก', 'วิธีใช้แต่ละฟีเจอร์', 'คำศัพท์', 'แก้ปัญหาเบื้องต้น', 'ReDay คืออะไร', 'ข้อมูลในแอปไม่ใช่คำแนะนำทางการแพทย์']) ok(r.text.includes(s), `ไม่พบหัวข้อ ${s}`);
      for (const re of BANNED) notOk(re.test(r.text), `guide: พบ ${re}`);
      notOk(r.root.querySelector('input[type=time]'));
      const times = r.text.match(/\d{1,2}:\d{2}/g) || [];
      ok(times.length > 3);
      for (const tm of times) ok(/^\d{2}:\d{2}$/.test(tm), `เวลารูปผิด ${tm}`);
      eq(r.root.querySelectorAll('.g-nav button').length, 5);
      const features = [...r.root.querySelectorAll('.g-item:not([data-kind])')];
      ok(features.length >= 15, `ฟีเจอร์น้อยไป ${features.length}`);
      for (const f of features) ok(f.textContent.includes('คืออะไร'), `${f.querySelector('summary').textContent}: ไม่มีคำอธิบายว่าคืออะไร`);
      eq(r.root.querySelectorAll('.g-steps.big > li').length, 5);
    });
    test('คู่มือ: ครอบคลุมทุกฟีเจอร์หลักของแอป (หัวข้ออ้างอิงฟีเจอร์ในสเปก)', () => {
      const titles = [...renderPage('guide').root.querySelectorAll('.g-item summary')].map((s) => s.textContent).join('|');
      for (const k of ['บันทึกเวลา', 'ถัดไป', 'พลังงาน', 'เวลานอนแนะนำ', 'มื้อแรก', 'งานหลัก', 'ไทเมอร์', 'เก็บห้อง', 'รีเซ็ตตอนนี้', 'ขอเบา ๆ', 'การเตือน', 'ช่วงเวลาเงียบ', 'สรุป', 'ย้อนหลัง', 'การ์ดชวนคุย', 'ตั้งค่า', 'ส่งออก', 'รหัสกู้คืน']) ok(titles.includes(k), `คู่มือไม่มีหัวข้อเรื่อง ${k}`);
    });
    test('คู่มือ: ค้นหากรองหัวข้อ เปิดอัตโนมัติเมื่อเจอไม่เกิน 3 หัวข้อ แจ้งเมื่อไม่พบ และล้างคำค้นแล้วกลับเป็นปกติ', () => {
      const r = renderPage('guide');
      const guide = r.root.querySelector('.guide');
      const search = r.root.querySelector('input[type=search]');
      const items = [...r.root.querySelectorAll('.g-item')];
      const visible = () => items.filter((e) => !e.hidden);
      typeInto(search, 'ไทเมอร์');
      ok(visible().length > 0 && visible().length < items.length, 'ควรเหลือเฉพาะหัวข้อที่เกี่ยวกับไทเมอร์');
      ok(visible().every((e) => e.textContent.replace(/\s+/g, '').includes('ไทเมอร์')));
      ok(guide.classList.contains('searching'), 'ระหว่างค้นต้องซ่อนส่วนที่ไม่ใช่ผลค้นหา');
      ok(r.root.querySelector('.g-result').textContent.includes('พบ'));
      typeInto(search, 'ล้างข้อมูลเว็บไซต์');
      ok(visible().length >= 1 && visible().length <= 3 && visible().every((e) => e.open), 'เจอน้อยหัวข้อ ควรเปิดให้อ่านเลย');
      typeInto(search, 'ไท เมอ ร์'); // เว้นวรรคกลางคำไม่ทำให้หาไม่เจอ
      ok(visible().length > 0);
      typeInto(search, 'zzzไม่มีคำนี้ในคู่มือ');
      eq(visible().length, 0);
      const empty = guide.querySelector(':scope > .note');
      ok(empty && !empty.hidden && empty.textContent.includes('ไม่พบ'), 'ค้นไม่เจอต้องบอก');
      typeInto(search, '');
      eq(visible().length, items.length);
      notOk(guide.classList.contains('searching'));
      ok(empty.hidden);
      ok(items.every((e) => !e.open), 'ล้างคำค้นแล้วหัวข้อต้องกลับเป็นปิด');
    });
    test('คู่มือ: ลิงก์ลัดล้างคำค้นแล้วพาไปหัวข้อและย้ายโฟกัสไปที่หัวข้อนั้น', () => {
      const r = renderPage('guide');
      const search = r.root.querySelector('input[type=search]');
      typeInto(search, 'ไทเมอร์');
      clickText(r.root.querySelector('.g-nav'), 'แก้ปัญหา').click();
      eq(search.value, '');
      notOk(r.root.querySelector('.guide').classList.contains('searching'));
      eq(document.activeElement.textContent, 'แก้ปัญหาเบื้องต้น');
      for (const label of ['เริ่มใช้', 'หน้าหลัก', 'ฟีเจอร์', 'คำศัพท์']) {
        clickText(r.root.querySelector('.g-nav'), label).click();
        ok(/^H2$/.test(document.activeElement.tagName), `${label}: โฟกัสควรอยู่ที่หัวข้อ`);
      }
    });
    test('คู่มือ: ป้ายชื่อปุ่มทุกป้าย ([[...]]) ตรงกับปุ่ม/เมนู/หัวข้อที่เห็นจริงบนหน้าจอของแอป (แก้ชื่อปุ่มแล้วคู่มือต้องตามด้วย)', () => {
      const labels = [...new Set([...renderPage('guide').root.querySelectorAll('.g-btn')].map((e) => squash(e.textContent)))];
      ok(labels.length > 60, `ป้ายชื่อปุ่มน้อยผิดปกติ (${labels.length})`);

      const corpus = new Set();
      const grabPage = (name) => harvest(renderPage(name).root, corpus);
      const grabSheet = () => { harvest(overlay, corpus); closeSheets(); };
      const prevDay = (n) => T.addDays(DAY, -n);
      const keep = { chores: S.listChores().length, tasks: S.listTasks().length };
      if (!keep.chores) S.addChore({ title: 'เก็บโต๊ะ (ทดสอบคู่มือ)', minutes: 10 });
      if (!keep.tasks) S.addTask({ title: 'งานทดสอบคู่มือ', minutes: 30 });

      // ฉาก 1: ยังไม่ได้บันทึกอะไรเลย (ปุ่มใหญ่ = บันทึกเวลาตื่น) พร้อมหน้าสาธารณะ
      setNow('12:00');
      for (let i = 0; i <= 4; i++) S.deleteLog(prevDay(i));
      ['landing', 'help', 'today', 'plan', 'room', 'summary', 'history', 'me'].forEach(grabPage);

      // ฉาก 2: ตื่นแล้ว มื้อแรกยังไม่บันทึกและเลยเวลามื้อแล้ว (ปุ่มใหญ่ = บันทึกมื้อแรก)
      S.upsertLog(DAY, { woke_at: at('09:00').toISOString() });
      S.upsertLog(prevDay(1), { bedtime_at: at('03:30').toISOString() });
      ['today', 'plan', 'room', 'summary', 'history', 'me'].forEach(grabPage);
      let plan = S.plan();
      A.editEnergy(plan); grabSheet();
      A.resetNow(plan, () => {}); grabSheet();
      A.winddownSheet(plan); grabSheet();
      A.taskMenu(plan); grabSheet();
      A.choreMenu(plan); grabSheet();
      A.mealMenu(plan); grabSheet();
      A.sleepMenu(plan); grabSheet();
      A.taskSheet(null); grabSheet();
      A.taskSheet(S.listTasks()[0]); grabSheet();
      A.choreSheet(null); grabSheet();
      A.logWake(plan); grabSheet();
      A.logLastNight(plan); grabSheet();
      A.logBedtimeNow(plan); grabSheet();
      P.today.actions(Object.assign(ctxFor('today'), { plan }))[1].click(); grabSheet(); // เมนู … มุมขวาบนของหน้า วันนี้

      // ป้ายเหตุผลบนหน้า สรุป (นอนดึกเมื่อคืน = มีป้ายให้แตะ) → เมนูของป้าย และเมนู เหตุผลอื่น
      let sum = renderPage('summary');
      clickText(sum.root.querySelector('.chips'), 'นอนดึก').click(); grabSheet();
      clickText(sum.root.querySelector('.chips'), 'เหตุผลอื่น').click(); grabSheet();
      S.upsertLog(DAY, { slipped_reasons: ['sick'], reasons_edited: true });
      grabPage('summary'); // มีปุ่ม ให้ระบบเดาใหม่
      S.upsertLog(DAY, { slipped_reasons: [], reasons_edited: false });

      // ประวัติ: แผ่นแก้วันนี้ และวันย้อนหลัง (ปุ่มลบบอกวัน)
      const days = [...renderPage('history').root.querySelectorAll('.hist-day')];
      days[0].click(); grabSheet();
      days[1].click(); grabSheet();

      // หน้า ฉัน: รหัสกู้คืนและสร้างรหัสใหม่
      const meR = renderPage('me');
      clickText(meR.root, 'รหัสกู้คืนบัญชี').click();
      harvest(overlay, corpus);
      clickText(overlay, 'สร้างรหัสกู้คืนใหม่').click();
      harvest(overlay, corpus);
      closeSheets();

      // ฉาก 3: บันทึกมื้อแรกแล้ว (เมนู มื้อแรก และตัวเลือกในหน้าต่างเลือกเวลามี ยังไม่บันทึก) + ไทเมอร์เดิน (ปุ่มใหญ่ = กลับไปที่ไทเมอร์)
      S.setMeal(DAY, 'logged', at('09:40'));
      plan = S.plan();
      A.mealMenu(plan); grabSheet();
      A.logMeal(plan); grabSheet();
      const t0 = S.plan().taskCard.task;
      S.startTask(t0.id, { micro: false });
      grabPage('today');
      harvest(A.timerPanel({}).el, corpus);
      S.cancelTask(t0.id);
      const c0 = S.plan().chore.chore;
      S.skipChore(c0.id, DAY);
      grabPage('room'); // เอากลับมา
      S.unskipChore(c0.id, DAY);

      // ฉาก 4: โหมดขอเบา ๆ (แถบ กลับโหมดปกติ)
      S.upsertLog(DAY, { day_mode: 'light' });
      grabPage('today');
      grabPage('room');
      S.upsertLog(DAY, { day_mode: 'normal' });

      // ฉาก 5: การ์ดชวนคุย (ไม่กินมื้อแรก 4 วันติด)
      for (let i = 1; i <= 4; i++) S.setMeal(prevDay(i), 'skipped');
      ok(S.plan().care.show, 'ฉากการ์ดชวนคุยตั้งไม่สำเร็จ');
      grabPage('today');

      // เก็บกวาด คืนสถานะให้ชุดทดสอบถัดไป
      for (let i = 0; i <= 4; i++) S.deleteLog(prevDay(i));
      S.updateProfile({ care_card_shown_on: null, care_card_dismissed_on: null });
      closeSheets();

      const missing = labels.filter((l) => !corpus.has(l));
      eq(missing, [], `ป้ายชื่อในคู่มือที่ไม่พบบนหน้าจอแอป: ${missing.join(' | ')}`);
    });
    test('แผ่นแก้ย้อนหลัง: ปุ่มลบบอกชัดว่าลบวันไหน (วันนี้ หรือวันนั้น) ไม่ใช่ "ลบวันนี้" ทุกวัน', () => {
      setNow('12:00');
      S.upsertLog(DAY, { woke_at: at('09:00').toISOString() });
      S.upsertLog(T.addDays(DAY, -1), { woke_at: at('09:00', T.addDays(DAY, -1)).toISOString() });
      const days = [...renderPage('history').root.querySelectorAll('.hist-day')];
      days[0].click();
      ok([...overlay.querySelectorAll('button')].some((b) => b.textContent.trim() === 'ลบบันทึกวันนี้'));
      closeSheets();
      days[1].click();
      ok([...overlay.querySelectorAll('button')].some((b) => b.textContent.trim() === 'ลบบันทึกวันนั้น'));
      closeSheets();
      notOk([...overlay.querySelectorAll('button')].some((b) => b.textContent.trim() === 'ลบวันนี้'));
      S.deleteLog(T.addDays(DAY, -1));
      S.deleteLog(DAY);
    });
    test('คู่มือ: มีทางเข้าจากหน้าแรก (ลิงก์ท้ายหน้าและใต้ปุ่มเริ่ม) ช่วยเหลือ วันนี้ และฉัน', () => {
      const guideLinks = (name) => [...renderPage(name).root.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '#/guide').length;
      eq(guideLinks('landing'), 2);
      for (const name of ['help', 'today', 'me']) eq(guideLinks(name), 1, `${name}: ควรมีลิงก์ไปคู่มือ 1 จุด`);
    });
    test('คู่มือในแอปจริง 390×844: เปิดได้ทั้งตอนล็อกอินและก่อนล็อกอิน ไม่มีแท็บล่าง มี h1 เดียว ไม่ล้นแนวนอน แถบลิงก์ลัดติดขอบบนพอดี และปุ่มย้อนกลับพากลับหน้าเดิม', async () => {
      const app = await openApp('2026-10-01T10:00:00+07:00', { email: 'guide@example.test' });
      const { w, d } = app;
      try {
        w.location.hash = '#/me';
        await sleep(400);
        d.querySelector('a[href="#/guide"]').click();
        await sleep(400);
        eq(w.location.hash, '#/guide');
        ok(d.querySelector('.guide'), 'ต้องเห็นหน้าคู่มือ');
        eq(d.querySelector('#appbar .title').textContent, 'คู่มือการใช้งาน');
        eq(d.title, 'คู่มือการใช้งาน · ReDay');
        ok(d.querySelector('#tabbar').hidden, 'หน้าคู่มือไม่มีแถบแท็บล่าง');
        eq(d.querySelectorAll('h1').length, 1);
        const view = d.querySelector('#view');
        ok(view.scrollWidth <= view.clientWidth + 1 && d.documentElement.scrollWidth <= d.documentElement.clientWidth + 1, `ล้นแนวนอน (${view.scrollWidth} > ${view.clientWidth})`);
        // เปิดหัวข้อทั้งหมด ก็ยังต้องไม่ล้น
        d.querySelectorAll('.g-item').forEach((el) => { el.open = true; });
        ok(view.scrollWidth <= view.clientWidth + 1, `เปิดทุกหัวข้อแล้วล้นแนวนอน (${view.scrollWidth} > ${view.clientWidth})`);
        // แถบลิงก์ลัดต้องติดขอบบนของพื้นที่เลื่อนพอดี (ไม่มีช่องให้เห็นเนื้อหาลอด)
        view.scrollTop = 600;
        await sleep(100);
        const navTop = d.querySelector('.g-nav').getBoundingClientRect().top;
        const viewTop = view.getBoundingClientRect().top;
        ok(Math.abs(navTop - viewTop) <= 1, `แถบลิงก์ลัดไม่ติดขอบบน (${navTop} vs ${viewTop})`);
        // กดลิงก์ลัดแล้ว หัวข้อที่เลื่อนมาต้องอยู่ใต้แถบลิงก์ลัด ไม่ถูกทับ (เคยทับ 4px จนวรรณยุกต์ที่ขอบบนหาย)
        d.querySelectorAll('.g-item').forEach((el) => { el.open = false; });
        for (const label of ['เริ่มใช้', 'หน้าหลัก', 'ฟีเจอร์', 'คำศัพท์', 'แก้ปัญหา']) {
          [...d.querySelectorAll('.g-nav button')].find((b) => b.textContent === label).click();
          await sleep(60);
          const nb = d.querySelector('.g-nav').getBoundingClientRect().bottom;
          const ht = d.activeElement.getBoundingClientRect().top;
          ok(d.activeElement.classList.contains('g-h'), `${label}: โฟกัสควรอยู่ที่หัวข้อ`);
          ok(ht >= nb + 4, `${label}: แถบลิงก์ลัดทับหัวข้อ (หัวข้อ ${Math.round(ht)} < แถบ ${Math.round(nb)})`);
        }
        // ปุ่มกลับพากลับหน้าเดิม
        d.querySelector('#appbar .icon-btn').click();
        await sleep(400);
        eq(w.location.hash, '#/me');
        // ก่อนล็อกอินก็เปิดได้ ไม่ถูกส่งไปหน้าสมัคร
        w.RD.store.logout();
        w.location.hash = '#/guide';
        await sleep(400);
        eq(w.location.hash, '#/guide');
        ok(d.querySelector('.guide'));
        ok([...d.querySelectorAll('.g-end a')].some((a) => a.getAttribute('href') === '#/auth'), 'ผู้ที่ยังไม่ล็อกอินควรเห็นปุ่มเริ่มใช้งาน');
      } finally {
        app.close();
      }
    });
    await TK.results[TK.results.length - 1].pending;

    // ------------------------------------------------------------------
    suite('ลบข้อมูล / ลบบัญชี');
    test('ลบข้อมูลทั้งหมด: คงบัญชีและความยินยอม ล้างแถวอื่น แล้วกลับไปตั้งค่าใหม่', () => {
      S.wipeData();
      ok(S.isLoggedIn());
      eq(S.listTasks().length + S.listChores().length + S.listLogs().length, 0);
      eq(S.profile().onboarding_complete, false);
      eq(S.profile().display_name, 'ทดสอบ');
      // ประวัติความยินยอมยังอยู่ครบ (รวมแถวที่ขอใหม่ในรอบก่อนหน้า) และแถวล่าสุดเป็นเวอร์ชันปัจจุบัน
      const cs = S.exportData().consents;
      ok(cs.length >= 1);
      eq(cs[cs.length - 1].version, RD.config.consentVersion);
    });
    test('ลบบัญชี: บัญชีและข้อมูลทุกตารางหายทันที เข้าสู่ระบบอีกไม่ได้', async () => {
      const id = S.userId();
      S.deleteAccount();
      notOk(S.isLoggedIn());
      eq(localStorage.getItem('reday2test.u.' + id), null);
      eq((await S.login({ email: 'tester@example.test', password: 'new-pass-9' })).ok, false);
    });
    await TK.results[TK.results.length - 1].pending;

    // ------------------------------------------------------------------
    suite('ข้อมูลเสียหายและหลายแท็บ (QA รอบ 2)');

    const created = await S.signup({ name: 'พัง', email: 'broken@example.test', password: 'broken-pass-1', consent: true });
    const uid2 = S.userId();
    const key2 = 'reday2test.u.' + uid2;
    test('สมัครบัญชีทดสอบข้อมูลเสียหาย', () => ok(created.ok && S.isLoggedIn()));
    S.completeOnboarding({ usual_bedtime: '01:00', target_bedtime: '23:30', target_wake: '08:00', meal_delay_minutes: 30, track_meals: true, tasks: ['งานเดิม'], chores: ['งานห้องเดิม'] });

    test('JSON เสีย: แอปเปิดต่อได้ด้วยชุดว่าง เก็บสำเนาที่เสียไว้ และแจ้งผู้ใช้ครั้งเดียว (ไม่ใช่จอขาว/ล็อกอินไม่ติด)', () => {
      localStorage.setItem(key2, '{bad json');
      S.reloadFromStorage();
      ok(S.isLoggedIn());
      eq(S.listTasks().length, 0);
      eq(localStorage.getItem(key2 + '.corrupt') !== null, true);
      ok(S.takeRecoveredNotice());
      notOk(S.takeRecoveredNotice());
      ok(S.addTask({ title: 'ใช้งานต่อได้' }).ok);
      eq(JSON.parse(localStorage.getItem(key2)).tasks.length, 1);
    });
    test('โครงสร้างผิด ({} หรือโปรไฟล์ที่ขาดตาราง): ไม่ throw และทุกหน้า render ได้', () => {
      localStorage.setItem(key2, '{}');
      S.reloadFromStorage();
      ok(S.isLoggedIn());
      localStorage.setItem(key2, JSON.stringify({ profile: { id: uid2, onboarding_complete: true } }));
      S.reloadFromStorage();
      eq([S.listTasks().length, S.listChores().length, S.listLogs().length], [0, 0, 0]);
      for (const name of ['today', 'plan', 'room', 'summary', 'history', 'me']) {
        ok(renderPage(name).text.trim().length > 10, `${name} ว่าง`);
      }
      localStorage.setItem(key2, JSON.stringify({ profile: { id: uid2, onboarding_complete: true }, tasks: [null, 5, { id: 'a', title: 'ใช้ได้', status: 'todo', minutes: 30, energy_needed: 'med' }] }));
      S.reloadFromStorage();
      eq(S.listTasks().map((t) => t.id), ['a']);
    });
    test('ล็อกอินได้แม้ข้อมูลของผู้ใช้หายไปจาก storage (ไม่ใช่ล็อกอินไม่ติดแบบเงียบ ๆ)', async () => {
      S.logout();
      localStorage.removeItem(key2);
      const r = await S.login({ email: 'broken@example.test', password: 'broken-pass-1' });
      ok(r.ok);
      ok(S.isLoggedIn());
      ok(S.profile().id === uid2);
    });
    await TK.results[TK.results.length - 1].pending;

    test('หลายแท็บ: แท็บอื่นเขียนข้อมูล → แท็บนี้โหลดตามและเขียนต่อไม่ทับของแท็บอื่น', () => {
      const other = JSON.parse(localStorage.getItem(key2));
      other.tasks.push({ id: 'from-other-tab', title: 'จากแท็บอื่น', status: 'todo', minutes: 30, energy_needed: 'med' });
      localStorage.setItem(key2, JSON.stringify(other));
      window.dispatchEvent(new StorageEvent('storage', { key: key2, storageArea: localStorage, newValue: localStorage.getItem(key2) }));
      ok(S.listTasks().some((t) => t.id === 'from-other-tab'), 'แท็บนี้ไม่เห็นข้อมูลของแท็บอื่น');
      S.addTask({ title: 'จากแท็บนี้' });
      const saved = JSON.parse(localStorage.getItem(key2));
      ok(saved.tasks.some((t) => t.id === 'from-other-tab'), 'ข้อมูลของแท็บอื่นถูกเขียนทับ');
      ok(saved.tasks.some((t) => t.title === 'จากแท็บนี้'));
    });
    test('หลายแท็บ: ออกจากระบบจากแท็บอื่น → แท็บนี้ออกด้วย', () => {
      localStorage.removeItem('reday2test.session');
      window.dispatchEvent(new StorageEvent('storage', { key: 'reday2test.session', storageArea: localStorage }));
      notOk(S.isLoggedIn());
    });

    // ------------------------------------------------------------------
    suite('ลืมรหัสผ่านครบวงจร (รหัสกู้คืนใช้ครั้งเดียว ไม่เก็บข้อมูลลับใน storage)');

    const rs = await S.signup({ name: 'รีเซ็ต', email: 'reset@example.test', password: 'reset-pass-1', consent: true });
    const firstCode = S.takePendingRecovery();
    S.clearPendingRecovery();
    S.logout();
    test('สมัครบัญชีทดสอบการรีเซ็ต', () => ok(rs.ok && /^[A-Z2-9]{4}-/.test(firstCode)));

    test('หน้า ลืมรหัสผ่าน → ตั้งรหัสใหม่ → เข้าสู่ระบบ + ได้รหัสกู้คืนใหม่; storage ไม่มีอีเมล/รหัสกู้คืนของขั้นตอนนี้', async () => {
      let r = renderPage('forgot');
      typeInto(r.root.querySelector('input[type=email]'), 'reset@example.test');
      typeInto(r.root.querySelector('input[autocapitalize]'), 'AAAA-BBBB-CCCC');
      submit(r.root.querySelector('form'));
      await sleep(900);
      ok(r.root.querySelector('.form-error') && !r.root.querySelector('.form-error').hidden);
      typeInto(r.root.querySelector('input[autocapitalize]'), firstCode.toLowerCase());
      submit(r.root.querySelector('form'));
      await sleep(900);
      eq(sessionStorage.getItem('reday2.reset'), '1');
      const allStore = JSON.stringify({ ...sessionStorage }) + JSON.stringify({ ...localStorage });
      notOk(allStore.includes(firstCode), 'รหัสกู้คืนห้ามค้างใน storage');
      r = renderPage('reset');
      typeInto(r.root.querySelector('input[type=password]'), 'after-reset-pass');
      submit(r.root.querySelector('form'));
      await sleep(1800);
      ok(S.isLoggedIn(), 'ตั้งรหัสใหม่แล้วต้องเข้าสู่ระบบ');
      const shown = overlay.querySelector('.recovery');
      ok(shown, 'ต้องแสดงรหัสกู้คืนใหม่');
      const newCode = shown.textContent;
      ok(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(newCode) && newCode !== firstCode);
      eq(await S.verifyRecovery('reset@example.test', firstCode), false);
      eq(await S.verifyRecovery('reset@example.test', newCode), true);
      eq(sessionStorage.getItem('reday2.reset'), null);
      notOk(JSON.stringify({ ...sessionStorage }).includes(newCode));
      closeSheets();
    });
    await TK.results[TK.results.length - 1].pending;

    test('เข้าหน้า ตั้งรหัสใหม่ โดยไม่ผ่านขั้นตอนยืนยัน (หรือรีโหลดแล้วข้อมูลในหน่วยความจำหาย) ต้องถูกส่งกลับ', () => {
      S.logout();
      sessionStorage.removeItem('reday2.reset');
      let went = null;
      const ctx = Object.assign(ctxFor('reset'), { go: (p) => { went = p; } });
      P.reset.render(ctx);
      // ผ่านเมื่อมีธง แต่ไม่มีข้อมูลในหน่วยความจำ → ก็ต้องถูกส่งกลับเช่นกัน
      return sleep(50).then(() => eq(went, '/auth/forgot'));
    });
    await TK.results[TK.results.length - 1].pending;

    // เก็บกวาด
    Object.keys(localStorage).filter((k) => k.startsWith('reday2test') || k.startsWith('reday2iframe')).forEach((k) => localStorage.removeItem(k));
    Object.keys(sessionStorage).filter((k) => k.startsWith('reday2test')).forEach((k) => sessionStorage.removeItem(k));
    stage.innerHTML = '';
    T.clock.offsetMs = 0;
  })();
})(typeof globalThis !== 'undefined' ? globalThis : this);
