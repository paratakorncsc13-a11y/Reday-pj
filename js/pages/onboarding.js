/* ReDay v2 — /onboarding ตั้งค่า 3 ขั้น (จังหวะนอน → มื้อแรก → งานและงานห้อง) */
(function (g) {
  const RD = g.RD;
  const { h, icon, pickTime, toast } = RD.ui;
  const S = RD.store;
  const T = RD.time;
  const C = RD.config;
  const P = (RD.pages = RD.pages || {});

  const st = {
    step: 1,
    usual: '01:00',
    target: '23:30',
    wake: '08:00',
    delay: 30,
    trackMeals: true,
    tasks: ['', '', ''],
    chores: ['', '', ''],
  };

  /** คำแนะนำนอนจาก rule engine ตัวเดียวกับทุกหน้า (หน้าจอไม่คำนวณกฎเอง) */
  function sleepHint() {
    const now = S.now();
    const p = RD.engine.buildDay({
      now,
      profile: Object.assign({}, S.profile(), { usual_bedtime: st.usual, target_bedtime: st.target, target_wake: st.wake }),
      log: null, prevLog: null, recentLogs: [], tasks: [], chores: [], completions: [], reminderState: [],
    });
    return p.sleep;
  }

  const DEFAULTS = { step: 1, usual: '01:00', target: '23:30', wake: '08:00', delay: 30, trackMeals: true, tasks: ['', '', ''], chores: ['', '', ''] };
  const draftKey = () => `${C.storagePrefix}.onb.${S.userId()}`;
  /** ความคืบหน้าของการตั้งค่าเก็บใน sessionStorage (เฉพาะแท็บนี้ ไม่มีข้อมูลลับ) รีโหลดแล้วไม่ต้องเริ่มใหม่ */
  function saveDraft() {
    try {
      if (st.step >= 1 && st.step <= 3) sessionStorage.setItem(draftKey(), JSON.stringify(st));
    } catch (e) { /* ignore */ }
  }
  function loadDraft() {
    Object.assign(st, JSON.parse(JSON.stringify(DEFAULTS)));
    try {
      const raw = sessionStorage.getItem(draftKey());
      const d = raw ? JSON.parse(raw) : null;
      if (d && d.step >= 1 && d.step <= 3 && Array.isArray(d.tasks) && Array.isArray(d.chores)) {
        Object.assign(st, d, { tasks: [0, 1, 2].map((i) => String(d.tasks[i] || '')), chores: [0, 1, 2].map((i) => String(d.chores[i] || '')) });
      }
    } catch (e) { /* ignore */ }
  }
  function clearDraft() {
    try {
      sessionStorage.removeItem(draftKey());
    } catch (e) { /* ignore */ }
  }

  P.onboarding = {
    live: false,
    actions(ctx) {
      // ออกจากระบบได้ระหว่างตั้งค่า (guards ไม่ให้ไปหน้าอื่นจนกว่าจะตั้งค่าเสร็จ จึงต้องมีทางออกอยู่ตรงนี้)
      return [h('button', { class: 'btn ghost small', type: 'button', onClick: () => { S.logout(); ctx.go('/'); } }, 'ออกจากระบบ')];
    },
    render(ctx) {
      loadDraft();
      const box = h('div', { class: 'onb stack' });
      const draw = () => {
        saveDraft();
        box.innerHTML = '';
        box.appendChild(st.step === 4 ? finish(ctx) : stepView(ctx, draw));
      };
      draw();
      return box;
    },
  };

  const progress = (n) => h('div', { class: 'progress', role: 'img', 'aria-label': `ขั้นที่ ${n} จาก 3` }, [1, 2, 3].map((i) => h('i', { class: i <= n ? 'on' : '' })));

  function timeField(label, key, redraw) {
    return h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      h(
        'button',
        {
          class: 'time-field',
          type: 'button',
          'aria-label': `${label} ตอนนี้ ${T.formatTime(st[key])} แตะเพื่อเปลี่ยน`,
          onClick: async () => {
            const r = await pickTime({ title: label, initial: T.parseHM(st[key]) });
            if (r && r.minutes != null) {
              st[key] = T.hmStr(r.minutes);
              redraw();
            }
          },
        },
        h('span', { class: 'v' }, T.formatTime(st[key])),
        icon('clock', 20)
      )
    );
  }

  function stepView(ctx, redraw) {
    const s = st.step;
    const nav = (canBack, nextLabel, onNext) =>
      h(
        'div',
        { class: 'btn-row', style: { marginTop: '8px' } },
        canBack ? h('button', { class: 'btn ghost', type: 'button', onClick: () => { st.step--; redraw(); } }, 'ย้อนกลับ') : null,
        h('button', { class: 'btn primary big', type: 'button', onClick: onNext }, nextLabel)
      );

    if (s === 1) {
      const sl = sleepHint();
      const late = T.sleepMinute(T.parseHM(st.usual)) - T.sleepMinute(T.parseHM(st.target)) > C.lateBedtimeMin;
      return h(
        'div',
        { class: 'stack' },
        progress(1),
        h('h1', null, 'จังหวะนอนของคุณ'),
        h('p', { class: 'muted' }, 'บอกเวลาคร่าว ๆ ก็พอ แก้ได้ทุกเมื่อในหน้า ฉัน'),
        timeField('ปกติหลับกี่โมง', 'usual', redraw),
        timeField('อยากหลับกี่โมง', 'target', redraw),
        timeField('อยากตื่นกี่โมง', 'wake', redraw),
        h(
          'div',
          { class: 'note' },
          late
            ? `ตอนนี้หลับดึกกว่าเป้าพอสมควร เราจะชวนขยับแค่ ${C.bedtimeShiftMin} นาทีก่อน คืนแรกลองเข้านอนราว ${T.formatTime(sl.suggestedBedtime)}`
            : `คืนแรกลองเข้านอนตามเป้า ${T.formatTime(sl.suggestedBedtime)}`
        ),
        nav(false, 'ต่อไป', () => { st.step = 2; redraw(); })
      );
    }

    if (s === 2) {
      return h(
        'div',
        { class: 'stack' },
        progress(2),
        h('h1', null, 'มื้อแรกหลังตื่น'),
        h('p', { class: 'muted' }, 'อยากให้เตือนมื้อแรกหลังตื่นกี่นาที เราจะนับจากเวลาตื่นจริงของแต่ละวัน ไม่ใช่เวลาตายตัว'),
        h(
          'div',
          { class: 'chip-select', role: 'radiogroup', 'aria-label': 'มื้อแรกหลังตื่นกี่นาที' },
          C.mealDelayOptions.map((m) =>
            h('button', { class: 'opt' + (st.delay === m ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': st.delay === m ? 'true' : 'false', onClick: () => { st.delay = m; redraw(); } }, `${m} นาที`)
          )
        ),
        h('p', { class: 'muted small' }, 'ค่าเริ่มต้น 30 นาที'),
        h(
          'label',
          { class: 'check' },
          h('input', { type: 'checkbox', checked: !st.trackMeals, onChange: (e) => { st.trackMeals = !e.target.checked; saveDraft(); } }),
          h('span', null, 'ไม่ต้องติดตามเรื่องมื้ออาหาร (ซ่อนส่วนกินทั้งหมด ไม่ต้องบอกเหตุผล เปลี่ยนใจได้ในหน้า ฉัน)')
        ),
        nav(true, 'ต่อไป', () => { st.step = 3; redraw(); })
      );
    }

    const inputs = (key, placeholders, label) =>
      placeholders.map((ph, i) =>
        h('input', {
          class: 'input',
          type: 'text',
          maxlength: '80',
          value: st[key][i],
          placeholder: ph,
          'aria-label': `${label} ข้อ ${i + 1}`,
          onInput: (e) => { st[key][i] = e.target.value; saveDraft(); },
        })
      );
    return h(
      'div',
      { class: 'stack' },
      progress(3),
      h('h1', null, 'งานและงานห้อง'),
      h('p', { class: 'muted' }, 'ข้ามได้ ถ้าไม่พิมพ์อะไรเลย เราใส่ตัวอย่างให้ ซึ่งแก้หรือลบได้ทุกเมื่อ ถ้าพิมพ์เองแล้ว จะใช้ของคุณทั้งหมด'),
      h('h2', { style: { fontSize: '17px' } }, 'งานหลักสัปดาห์นี้ (สูงสุด 3 อย่าง)'),
      h('div', { class: 'stack-sm' }, inputs('tasks', C.sampleTasks.map((t) => t.title), 'งานหลัก')),
      h('h2', { style: { fontSize: '17px', marginTop: '6px' } }, 'งานห้องที่เลื่อนมาตลอด (สูงสุด 3 อย่าง)'),
      h('div', { class: 'stack-sm' }, inputs('chores', C.sampleChores.slice(0, 3).map((t) => t.title), 'งานห้อง')),
      nav(true, 'เสร็จสิ้น', () => {
        S.completeOnboarding({
          usual_bedtime: st.usual,
          target_bedtime: st.target,
          target_wake: st.wake,
          meal_delay_minutes: st.delay,
          track_meals: st.trackMeals,
          tasks: st.tasks,
          chores: st.chores,
        });
        clearDraft();
        st.step = 4;
        redraw();
      })
    );
  }

  function finish(ctx) {
    const code = S.takePendingRecovery();
    const recovery = S.cloud
      ? null // โหมดออนไลน์ใช้อีเมลรีเซ็ตรหัสผ่าน ไม่มีรหัสกู้คืน
      : code
      ? h(
          'div',
          { class: 'card stack-sm' },
          h('b', null, 'รหัสกู้คืนบัญชี'),
          h('div', { class: 'recovery', 'aria-label': 'รหัสกู้คืน ' + code }, code),
          h('p', { class: 'muted small' }, 'จดหรือแคปหน้าจอเก็บไว้ ใช้ตั้งรหัสผ่านใหม่ถ้าลืม (เวอร์ชันนี้ไม่ส่งอีเมล) ไม่แสดงซ้ำอีก แต่สร้างใหม่ได้ในหน้า ฉัน'),
          h('button', { class: 'btn secondary small', type: 'button', onClick: async () => {
            try { await navigator.clipboard.writeText(code); toast('คัดลอกรหัสแล้ว'); } catch (e) { toast('คัดลอกไม่ได้ ลองจดไว้แทนนะ'); }
          } }, 'คัดลอกรหัส')
        )
      : h(
          // รหัสที่แสดงหลังสมัครอยู่ในหน่วยความจำเท่านั้น ถ้ารีโหลดระหว่างตั้งค่าจะหายไป บอกทางสร้างใหม่แทนที่จะเงียบ
          'p',
          { class: 'muted small', role: 'note' },
          'ยังไม่ได้จดรหัสกู้คืนบัญชีใช่ไหม สร้างรหัสใหม่ได้ที่ ฉัน › รหัสกู้คืนบัญชี ใช้ตั้งรหัสผ่านใหม่ถ้าลืม'
        );
    return h(
      'div',
      { class: 'stack', style: { textAlign: 'center', paddingTop: '24px' } },
      h('div', { style: { color: 'var(--olive)' } }, icon('check', 56)),
      h('h1', null, 'พร้อมรีเซ็ตวันนี้แล้ว'),
      h('p', { class: 'muted' }, 'เริ่มจากเวลาตื่นจริงของวันนี้ ที่เหลือเราช่วยจัดจังหวะให้ทีละก้าว'),
      recovery,
      h('p', { class: 'muted small' }, 'มีอะไรไม่แน่ใจ เปิดคู่มือได้ที่หน้า ฉัน › คู่มือการใช้งาน'),
      h('button', { class: 'btn primary big block', type: 'button', onClick: () => {
        S.clearPendingRecovery();
        clearDraft();
        Object.assign(st, JSON.parse(JSON.stringify(DEFAULTS)));
        ctx.go('/today');
      } }, 'ไปหน้าวันนี้')
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
