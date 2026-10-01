/* ReDay v2 — การกระทำที่หลายหน้าใช้ร่วมกัน
 * บันทึกเวลา (เปิด TimePicker ก่อนเสมอ ห้ามบันทึกเวลาให้เอง), พลังงาน, ไทเมอร์, เพิ่ม/แก้/ลบงานและงานห้อง,
 * เมนู "…" ของการ์ด, รีเซ็ตตอนนี้, ผ่อนจังหวะ
 * ทุกข้อเสนอมีทาง เปลี่ยน เลื่อน หรือข้าม โดยไม่ขึ้นสีแดงและไม่นับเป็นความล้มเหลว
 */
(function (g) {
  const RD = (g.RD = g.RD || {});
  const { h, toast, openSheet, openMenu, confirmDialog, pickTime, segmented } = RD.ui;
  const S = RD.store;
  const T = RD.time;
  const E = RD.engine;
  const C = RD.config;

  const A = {};
  const co = () => S.cutoff();

  /** ถามเบา ๆ เมื่อค่าขัดกัน (ไม่ใช่ error) → 'yes' | 'edit' | null */
  function askSoft(title, text, yesLabel, editLabel) {
    return new Promise((resolve) => {
      let answered = false;
      openSheet({
        title,
        onClose: () => {
          if (!answered) resolve(null);
        },
        body: (ctl) =>
          h(
            'div',
            { class: 'stack' },
            h('p', null, text),
            h(
              'div',
              { class: 'btn-row' },
              h('button', { class: 'btn ghost', type: 'button', onClick: () => { answered = true; resolve('edit'); ctl.close(); } }, editLabel || 'แก้เวลา'),
              h('button', { class: 'btn primary', type: 'button', 'data-autofocus': '1', onClick: () => { answered = true; resolve('yes'); ctl.close(); } }, yesLabel || 'ใช่')
            )
          ),
      });
    });
  }

  // ---------------------------------------------------------------- เวลา
  A.logWake = async function (plan) {
    const date = plan.logDate;
    const log = S.getLog(date);
    let initial = log && log.woke_at ? T.minuteOfDay(log.woke_at) : undefined;
    for (;;) {
      const r = await pickTime({
        title: 'ตื่นกี่โมง',
        initial,
        extra: log && log.woke_at ? [{ label: 'ล้างเวลาตื่น (กลับเป็นยังไม่บันทึก)', value: 'clear' }] : null,
      });
      if (!r) return false;
      if (r.extra === 'clear') {
        S.upsertLog(date, { woke_at: null });
        toast('ล้างเวลาตื่นแล้ว');
        return true;
      }
      const at = T.resolveInLogDay(date, r.minutes, co());
      const prev = S.getLog(T.addDays(date, -1));
      if (prev && prev.bedtime_at && E.sleepConflict(prev.bedtime_at, at)) {
        const a = await askSoft(
          'นอนข้ามคืนใช่ไหม',
          `เวลาตื่น ${T.formatTime(at)} กับเวลานอนเมื่อคืน ${T.formatTime(prev.bedtime_at)} ดูห่างหรือขัดกันนิดหน่อย นอนข้ามคืนใช่ไหม`
        );
        if (a === 'edit') {
          initial = r.minutes;
          continue;
        }
        if (a === null) return false;
      }
      S.upsertLog(date, { woke_at: at.toISOString() });
      S.track('time_logged', { kind: 'wake', edited: !!r.edited });
      toast(`บันทึกเวลาตื่น ${T.formatTime(at)} แล้ว`);
      return true;
    }
  };

  A.logLastNight = async function (plan) {
    const date = plan.logDate;
    const prevDate = T.addDays(date, -1);
    const log = S.getLog(date);
    const prev = S.getLog(prevDate);
    const ref = log && log.woke_at ? new Date(log.woke_at) : S.now();
    let initial = prev && prev.bedtime_at ? T.minuteOfDay(prev.bedtime_at) : undefined;
    for (;;) {
      const r = await pickTime({
        title: 'เมื่อคืนหลับกี่โมง',
        initial,
        extra: prev && prev.bedtime_at ? [{ label: 'ล้างเวลานอน (กลับเป็นยังไม่บันทึก)', value: 'clear' }] : null,
      });
      if (!r) return false;
      if (r.extra === 'clear') {
        S.upsertLog(prevDate, { bedtime_at: null });
        toast('ล้างเวลานอนแล้ว');
        return true;
      }
      const bed = T.latestAtOrBefore(r.minutes, ref);
      if (E.sleepConflict(bed, ref)) {
        const a = await askSoft('นอนข้ามคืนใช่ไหม', `เวลานอน ${T.formatTime(bed)} กับเวลาตื่นดูห่างหรือขัดกันนิดหน่อย นอนข้ามคืนใช่ไหม`);
        if (a === 'edit') {
          initial = r.minutes;
          continue;
        }
        if (a === null) return false;
      }
      S.upsertLog(prevDate, { bedtime_at: bed.toISOString() });
      S.track('time_logged', { kind: 'bedtime_prev', edited: !!r.edited });
      toast(`บันทึกเวลานอนเมื่อคืน ${T.formatTime(bed)} แล้ว`);
      return true;
    }
  };

  /** ปุ่ม เข้านอนตอนนี้ — เขียน bedtime_at ของ log วันนี้ */
  A.logBedtimeNow = async function (plan) {
    const date = plan.logDate;
    const log = S.getLog(date);
    let initial = log && log.bedtime_at ? T.minuteOfDay(log.bedtime_at) : undefined;
    for (;;) {
      const r = await pickTime({
        title: 'เข้านอนกี่โมง',
        initial,
        extra: log && log.bedtime_at ? [{ label: 'ล้างเวลานอน (กลับเป็นยังไม่บันทึก)', value: 'clear' }] : null,
      });
      if (!r) return false;
      if (r.extra === 'clear') {
        S.upsertLog(date, { bedtime_at: null });
        toast('ล้างเวลานอนแล้ว');
        return true;
      }
      const bed = T.nearest(r.minutes, S.now());
      if (log && log.woke_at && bed.getTime() <= new Date(log.woke_at).getTime()) {
        const a = await askSoft('ใช้เวลานี้เลยไหม', `เวลานอน ${T.formatTime(bed)} อยู่ก่อนเวลาตื่นของวันนี้ ใช้ค่านี้เลยไหม`, 'ใช้เลย', 'แก้เวลา');
        if (a === 'edit') {
          initial = r.minutes;
          continue;
        }
        if (a === null) return false;
      }
      S.upsertLog(date, { bedtime_at: bed.toISOString() });
      S.track('time_logged', { kind: 'bedtime', edited: !!r.edited });
      toast(`บันทึกเวลานอน ${T.formatTime(bed)} แล้ว ราตรีสวัสดิ์`);
      return true;
    }
  };

  A.logMeal = async function (plan) {
    const date = plan.logDate;
    const log = S.getLog(date);
    const status = log ? log.meal_status : 'unknown';
    const extra = [{ label: 'ไม่กินมื้อนี้', value: 'skipped' }];
    if (status !== 'unknown') extra.push({ label: 'ยังไม่บันทึก', value: 'unknown' });
    const r = await pickTime({
      title: 'กินมื้อแรกกี่โมง',
      initial: log && log.first_meal_at ? T.minuteOfDay(log.first_meal_at) : undefined,
      extra,
    });
    if (!r) return false;
    if (r.extra === 'skipped') {
      S.setMeal(date, 'skipped');
      toast('ได้เลย บันทึกว่าไม่กินมื้อนี้ เปลี่ยนใจเมื่อไรก็แก้ได้');
      return true;
    }
    if (r.extra === 'unknown') {
      S.setMeal(date, 'unknown');
      toast('กลับเป็นยังไม่บันทึกแล้ว');
      return true;
    }
    const at = T.resolveInLogDay(date, r.minutes, co());
    S.setMeal(date, 'logged', at);
    S.track('time_logged', { kind: 'meal', edited: !!r.edited });
    toast(`บันทึกมื้อแรก ${T.formatTime(at)} แล้ว`);
    return true;
  };

  // ---------------------------------------------------------------- พลังงาน / โหมดเบา ๆ
  A.editEnergy = function (plan) {
    const date = plan.logDate;
    const log = S.getLog(date);
    const current = log && log.energy_override;
    const opts = [
      { v: 'low', label: 'ต่ำ', sub: 'วันนี้เบา ๆ ทำแค่งานย่อยก็พอ' },
      { v: 'normal', label: 'ปกติ', sub: 'มีงานหลักได้หนึ่งอย่าง' },
      { v: 'good', label: 'ดี', sub: 'มีแรงเต็มที่' },
      { v: null, label: 'ให้ระบบเดา', sub: 'ระบบเดาจากเวลาตื่น' + (plan.trackMeals ? 'และมื้อแรก' : '') },
    ];
    openSheet({
      title: 'วันนี้พลังงานเป็นยังไง',
      body: (ctl) =>
        h(
          'div',
          { class: 'menu-list' },
          h('p', { class: 'muted small', style: { marginBottom: '6px' } }, `ตอนนี้: ${plan.energy.text}`),
          opts.map((o) =>
            h(
              'button',
              {
                class: 'menu-item',
                type: 'button',
                onClick: () => {
                  S.upsertLog(date, { energy_override: o.v });
                  ctl.close();
                  toast(o.v ? `ตั้งพลังงาน${RD.msg.ENERGY_LABEL[o.v]}แล้ว (คุณเลือก)` : 'ให้ระบบเดาแล้ว');
                },
              },
              (o.v === current ? '✓ ' : '') + o.label,
              h('span', { class: 'menu-sub' }, o.sub)
            )
          )
        ),
    });
  };

  A.toggleLight = function (plan) {
    const light = plan.mode === 'light';
    S.upsertLog(plan.logDate, { day_mode: light ? 'normal' : 'light' });
    if (!light) {
      S.track('light_day_on');
      toast('วันนี้ขอเบา ๆ นะ เหลือแค่สิ่งจำเป็น');
    } else toast('กลับโหมดปกติแล้ว');
  };

  // ---------------------------------------------------------------- ไทเมอร์
  function activeSession(only) {
    const p = S.plan();
    if (p.chore && p.chore.state === 'running' && p.chore.completion && only !== 'task') {
      const c = p.chore;
      return {
        type: 'chore',
        id: c.chore.id,
        title: c.chore.title,
        start: new Date(c.completion.started_at),
        planned: c.completion.planned_minutes || c.minutes,
        // ไทเมอร์ที่เริ่มก่อนเวลาตัดวันมี log_date ของวันก่อน ต้องปิดด้วยแถวเดิม
        logDate: c.completion.log_date,
        plan: p,
      };
    }
    const tc = p.taskCard;
    if (tc && tc.state === 'doing' && tc.task && only !== 'chore') {
      return {
        type: 'task',
        id: tc.task.id,
        title: tc.title,
        start: new Date(tc.task.started_at),
        planned: tc.proposed ? C.microDefaultMin : tc.task.minutes,
        micro: !!tc.proposed,
        plan: p,
      };
    }
    return null;
  }
  A.activeSession = activeSession;

  /** แผงไทเมอร์ชุดเดียวกัน ใช้ทั้งหน้า ห้อง (inline) และแผ่นจากหน้าอื่น เก็บ started_at ไว้ในข้อมูล จึงรีโหลดแล้วนับต่อได้ */
  A.timerPanel = function (opts) {
    const root = h('div', { class: 'timer-card card' });
    const R = 96;
    const CIRC = 2 * Math.PI * R;
    let sess = null;
    let parts = null;

    function build() {
      sess = activeSession(opts && opts.only);
      root.innerHTML = '';
      parts = null;
      if (!sess) {
        if (opts && opts.onEmpty) opts.onEmpty();
        return;
      }
      const color = sess.type === 'chore' ? 'var(--amber)' : 'var(--sage)';
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 220 220');
      svg.setAttribute('width', '220');
      svg.setAttribute('height', '220');
      svg.setAttribute('aria-hidden', 'true');
      const mk = (cls) => {
        const c = document.createElementNS(svgNS, 'circle');
        c.setAttribute('cx', '110');
        c.setAttribute('cy', '110');
        c.setAttribute('r', String(R));
        c.setAttribute('fill', 'none');
        c.setAttribute('stroke-width', '12');
        c.setAttribute('stroke-linecap', 'round');
        c.setAttribute('class', cls);
        return c;
      };
      const track = mk('track');
      const prog = mk('bar');
      prog.setAttribute('stroke-dasharray', String(CIRC));
      prog.setAttribute('stroke-dashoffset', '0');
      svg.append(track, prog);
      const clock = h('b', { class: 'num' }, '00:00');
      const label = h('span', null, '');
      const ringWrap = h('div', { class: 'ring', style: { '--p': color } }, svg, h('div', { class: 'clock' }, clock, label));
      const doneMsg = h('div', { class: 'done-msg', hidden: true, role: 'status' }, 'ครบเวลาแล้ว เสร็จหรือยัง?');
      parts = { prog, clock, label, doneMsg };
      root.append(
        h('div', { class: 'muted small' }, sess.type === 'chore' ? 'งานห้องที่กำลังทำ' : sess.micro ? 'งานย่อยที่กำลังทำ' : 'งานที่กำลังทำ'),
        h('div', { class: 'next-title', style: { fontFamily: 'var(--font-head)', fontSize: '20px', margin: '2px 0 6px' } }, sess.title),
        ringWrap,
        doneMsg,
        h(
          'div',
          { class: 'btn-row', style: { marginTop: '8px' } },
          h('button', { class: 'btn ghost', type: 'button', onClick: cancel }, 'ยกเลิก'),
          h('button', { class: 'btn primary big', type: 'button', onClick: finish }, 'เสร็จ')
        ),
        h('p', { class: 'muted small', style: { marginTop: '8px' } }, 'กด เสร็จ เมื่อทำเสร็จเท่านั้น ระบบจะไม่ทำเครื่องหมายให้เอง ปิดหน้านี้แล้วเวลายังเดินต่อ')
      );
      tick();
    }

    function tick() {
      if (!sess || !parts) return;
      const total = sess.planned * 60;
      const elapsed = (S.now() - sess.start) / 1000;
      const remain = total - elapsed;
      const ref = Math.max(0, remain);
      parts.clock.textContent = RD.ui.mmss(ref);
      parts.label.textContent = remain > 0 ? 'เหลือเวลา' : 'ครบเวลาแล้ว';
      parts.prog.setAttribute('stroke-dashoffset', String(CIRC * Math.min(1, Math.max(0, elapsed / total))));
      const over = remain <= 0;
      if (parts.doneMsg.hidden === over) parts.doneMsg.hidden = !over;
    }

    async function finish() {
      if (!sess) return;
      const s = sess;
      if (s.type === 'chore') {
        S.completeChore(s.id, s.logDate);
        toast('เสร็จแล้ว ขอบคุณที่ดูแลห้องนะ');
      } else if (s.micro) {
        const t = S.getTask(s.id);
        const a = await askSoft(
          'ทำเสร็จทั้งงานเลยไหม',
          `เสร็จช่วง ${s.planned} นาทีแล้ว งาน "${t ? t.title : s.title}" ยังเหลือทำต่อพรุ่งนี้ได้ ไม่ต้องรีบ`,
          'งานนี้เสร็จทั้งงาน',
          'แค่ส่วนนี้ก่อน'
        );
        if (a === null) return;
        if (a === 'yes') S.completeTask(s.id);
        else S.completeMicroSession(s.id, s.plan.logDate);
        toast('เริ่มแล้วก็นับว่าสำเร็จหนึ่งก้าวแล้ว');
      } else {
        S.completeTask(s.id);
        toast('งานเสร็จแล้ว เก่งมาก');
      }
      build();
    }
    function cancel() {
      if (!sess) return;
      if (sess.type === 'chore') S.cancelChore(sess.id, sess.logDate);
      else S.cancelTask(sess.id);
      toast('ยกเลิกไทเมอร์แล้ว ไม่เป็นไรนะ เริ่มใหม่เมื่อพร้อม');
      build();
    }

    build();
    return { el: root, tick, refresh: build, hasSession: () => !!sess };
  };

  A.openTimerSheet = function () {
    let iv = null;
    openSheet({
      title: 'ไทเมอร์',
      onClose: () => clearInterval(iv),
      body: (ctl) => {
        const panel = A.timerPanel({ onEmpty: () => setTimeout(() => ctl.close(), 0) });
        iv = setInterval(() => panel.tick(), 1000);
        return panel.el;
      },
    });
  };

  /** ไทเมอร์เดินได้ครั้งละอันเดียว (ปุ่มหลักปุ่มเดียว ไม่ทำให้ตัดสินใจเยอะ) ถ้ามีอันที่เดินอยู่ ให้เปิดอันนั้นแทน */
  function busyTimer() {
    if (!activeSession()) return false;
    toast('มีไทเมอร์ที่กำลังเดินอยู่ เสร็จหรือยกเลิกอันนี้ก่อนนะ');
    A.openTimerSheet();
    return true;
  }
  /** คืน true ถ้าเริ่มไทเมอร์ได้ */
  A.startChore = function (plan, minutes) {
    const c = plan.chore;
    if (!c || !c.chore || busyTimer()) return false;
    S.startChore(c.chore.id, plan.logDate, minutes || c.minutes);
    return true;
  };
  A.startTask = function (taskId, micro) {
    if (busyTimer()) return false;
    S.startTask(taskId, { micro: !!micro });
    return true;
  };

  // ---------------------------------------------------------------- งาน
  const ENERGY_OPTS = [
    { value: 'low', label: 'ต่ำ' },
    { value: 'med', label: 'กลาง' },
    { value: 'high', label: 'สูง' },
  ];

  A.taskSheet = function (task, opts) {
    const isNew = !task;
    const st = {
      title: task ? task.title : '',
      minutes: task ? task.minutes : 45,
      energy: task ? task.energy_needed : 'med',
      due: task ? task.due_date : null,
      micro: task ? !!task.is_micro : false,
    };
    openSheet({
      title: isNew ? 'เพิ่มงาน' : 'แก้ไขงาน',
      tall: true,
      focus: false,
      body: (ctl) => {
        const titleIn = h('input', { class: 'input', type: 'text', maxlength: '80', value: st.title, placeholder: 'เช่น อ่านสรุปบทที่ 4', 'aria-label': 'ชื่องาน' });
        const err = h('span', { class: 'field-error', role: 'alert' });
        const minIn = h('input', { class: 'input', type: 'text', inputmode: 'numeric', value: String(st.minutes), 'aria-label': 'จำนวนนาที' });
        const minChips = h('div', { class: 'chip-select' });
        const dueLabel = h('div', { class: 'field-hint' });
        const dueIn = h('input', { class: 'input', type: 'date', value: st.due || '', 'aria-label': 'วันกำหนดส่ง' });
        const dueChips = h('div', { class: 'chip-select' });

        const drawMin = () => {
          minChips.innerHTML = '';
          [15, 25, 45, 60, 90].forEach((m) =>
            minChips.appendChild(
              h('button', { class: 'opt' + (Number(minIn.value) === m ? ' on' : ''), type: 'button', onClick: () => { minIn.value = String(m); drawMin(); } }, `${m}`)
            )
          );
        };
        const drawDue = () => {
          const today = S.todayLogDate();
          dueChips.innerHTML = '';
          [
            { label: 'ไม่กำหนด', v: null },
            { label: 'วันนี้', v: today },
            { label: 'พรุ่งนี้', v: T.addDays(today, 1) },
          ].forEach((o) =>
            dueChips.appendChild(
              h('button', { class: 'opt' + (st.due === o.v ? ' on' : ''), type: 'button', onClick: () => { st.due = o.v; dueIn.value = o.v || ''; drawDue(); } }, o.label)
            )
          );
          dueLabel.textContent = st.due ? `ส่ง ${T.formatDate(st.due)}` : 'ไม่ได้กำหนดวันส่ง';
        };
        dueIn.addEventListener('change', () => { st.due = dueIn.value || null; drawDue(); });
        minIn.addEventListener('input', drawMin);
        drawMin();
        drawDue();

        const microCb = h('input', { type: 'checkbox', checked: st.micro });
        titleIn.addEventListener('input', () => { err.textContent = ''; });
        let saved = false; // กดบันทึกซ้ำ/ดับเบิลคลิกต้องไม่สร้างงานซ้ำ
        const save = () => {
          if (saved) return;
          const title = titleIn.value.trim();
          if (!title) {
            err.textContent = 'ใส่ชื่องานสักหน่อยนะ';
            titleIn.focus();
            return;
          }
          const f = {
            title,
            minutes: Number(minIn.value) || 25,
            energy_needed: st.energy,
            due_date: st.due,
            is_micro: microCb.checked,
          };
          const r = isNew ? S.addTask(f) : S.updateTask(task.id, f);
          if (!r.ok) {
            err.textContent = 'บันทึกไม่สำเร็จ ลองอีกครั้งนะ';
            return;
          }
          saved = true;
          ctl.close();
          toast(isNew ? 'เพิ่มงานแล้ว' : 'บันทึกงานแล้ว');
          if (opts && opts.onSaved) opts.onSaved(r.task);
        };
        return h(
          'form',
          { class: 'stack', onSubmit: (e) => { e.preventDefault(); save(); } },
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'ชื่องาน'), titleIn, err),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'ใช้เวลากี่นาที'), minIn, minChips),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'พลังงานที่ต้องใช้'), segmented(ENERGY_OPTS, st.energy, (v) => (st.energy = v), 'พลังงานที่ต้องใช้')),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'วันกำหนดส่ง (เว้นว่างได้)'), dueChips, dueIn, dueLabel),
          h('label', { class: 'check' }, microCb, h('span', null, 'เป็นงานย่อย (ทำจบได้ในไม่เกิน 25 นาที)')),
          h(
            'div',
            { class: 'btn-row sticky' },
            !isNew
              ? h('button', { class: 'btn ghost', type: 'button', onClick: async () => { if (await confirmDialog({ title: 'ลบงานนี้ใช่ไหม', message: `"${task.title}" จะหายไปจากรายการ`, confirmText: 'ลบงาน', danger: true })) { S.removeTask(task.id); ctl.close(); toast('ลบงานแล้ว'); if (opts && opts.onDeleted) opts.onDeleted(); } } }, 'ลบ')
              : h('button', { class: 'btn ghost', type: 'button', onClick: () => ctl.close() }, 'ยกเลิก'),
            h('button', { class: 'btn primary', type: 'submit' }, 'บันทึก')
          )
        );
      },
    });
    setTimeout(() => {
      const el = document.querySelector('.sheet input[type=text]');
      if (el && isNew) el.focus();
    }, 220);
  };

  A.choreSheet = function (chore, opts) {
    const isNew = !chore;
    const st = { minutes: chore ? chore.minutes : 10 };
    openSheet({
      title: isNew ? 'เพิ่มงานห้อง' : 'แก้ไขงานห้อง',
      focus: false,
      body: (ctl) => {
        const titleIn = h('input', { class: 'input', type: 'text', maxlength: '60', value: chore ? chore.title : '', placeholder: 'เช่น เช็ดโต๊ะ', 'aria-label': 'ชื่องานห้อง' });
        const err = h('span', { class: 'field-error', role: 'alert' });
        titleIn.addEventListener('input', () => { err.textContent = ''; });
        let saved = false;
        const save = () => {
          if (saved) return;
          const title = titleIn.value.trim();
          if (!title) {
            err.textContent = 'ใส่ชื่องานห้องสักหน่อยนะ';
            return;
          }
          const r = isNew ? S.addChore({ title, minutes: st.minutes }) : S.updateChore(chore.id, { title, minutes: st.minutes });
          if (!r.ok) {
            err.textContent = r.error === 'duplicate' ? 'มีงานนี้อยู่แล้ว' : 'บันทึกไม่สำเร็จ ลองอีกครั้งนะ';
            return;
          }
          saved = true;
          ctl.close();
          toast(isNew ? 'เพิ่มงานห้องแล้ว' : 'บันทึกงานห้องแล้ว');
          if (opts && opts.onSaved) opts.onSaved(r.chore);
        };
        return h(
          'form',
          { class: 'stack', onSubmit: (e) => { e.preventDefault(); save(); } },
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'ชื่องานห้อง'), titleIn, err),
          h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'ใช้เวลากี่นาที'), segmented([{ value: 5, label: '5 นาที' }, { value: 10, label: '10 นาที' }, { value: 15, label: '15 นาที' }], st.minutes, (v) => (st.minutes = v), 'ใช้เวลากี่นาที'), h('span', { class: 'field-hint' }, 'ช่องสั้น ๆ เสมอ ไม่ใช่บล็อกหลายชั่วโมง')),
          h(
            'div',
            { class: 'btn-row sticky' },
            !isNew
              ? h('button', { class: 'btn ghost', type: 'button', onClick: async () => { if (await confirmDialog({ title: 'ลบงานห้องนี้ใช่ไหม', message: `"${chore.title}" จะถูกเก็บออกจากรายการ ประวัติที่เคยทำยังอยู่`, confirmText: 'ลบงานห้อง', danger: true })) { S.archiveChore(chore.id); ctl.close(); toast('ลบงานห้องแล้ว'); if (opts && opts.onDeleted) opts.onDeleted(); } } }, 'ลบ')
              : h('button', { class: 'btn ghost', type: 'button', onClick: () => ctl.close() }, 'ยกเลิก'),
            h('button', { class: 'btn primary', type: 'submit' }, 'บันทึก')
          )
        );
      },
    });
    setTimeout(() => {
      const el = document.querySelector('.sheet input[type=text]');
      if (el && isNew) el.focus();
    }, 220);
  };

  // ---------------------------------------------------------------- เมนู "…" ของการ์ด
  function swapTask(plan) {
    const tc = plan.taskCard;
    if (!tc || !tc.task) return;
    S.swapItem(plan.logDate, 'task', tc.task.id);
    const np = S.plan();
    if (!np.taskCard || np.taskCard.state === 'skipped' || (np.taskCard.task && np.taskCard.task.id === tc.task.id)) {
      S.unswapItem(plan.logDate, 'task', tc.task.id);
      toast('ตอนนี้ยังไม่มีงานอื่นให้เปลี่ยน เพิ่มงานได้ในหน้า แผน');
    } else toast('เปลี่ยนให้แล้ว');
  }
  function swapChore(plan) {
    const c = plan.chore;
    if (!c || !c.chore) return;
    S.swapItem(plan.logDate, 'chore', c.chore.id);
    const np = S.plan();
    if (!np.chore || np.chore.chore.id === c.chore.id) {
      S.unswapItem(plan.logDate, 'chore', c.chore.id);
      toast('ตอนนี้ยังไม่มีงานห้องอื่นให้เปลี่ยน เพิ่มได้ในหน้า ห้อง');
    } else toast('เปลี่ยนให้แล้ว');
  }

  A.taskMenu = function (plan) {
    const tc = plan.taskCard;
    if (!tc) return;
    const items = [];
    if (tc.state === 'skipped') {
      items.push({ label: 'เอากลับมา', onClick: () => { S.upsertLog(plan.logDate, { skipped_task: false }); toast('เอางานกลับมาแล้ว'); } });
    } else if (tc.task) {
      if (tc.state === 'doing') {
        items.push({ label: 'เปิดไทเมอร์', onClick: () => A.openTimerSheet() });
        items.push({ label: 'ยกเลิกการเริ่ม', onClick: () => { S.cancelTask(tc.task.id); toast('ยกเลิกแล้ว ไม่เป็นไร'); } });
      } else if (tc.state === 'done') {
        items.push({ label: 'ทำเครื่องหมายว่ายังไม่เสร็จ', onClick: () => { S.reopenTask(tc.task.id); S.upsertLog(plan.logDate, {}); toast('เปลี่ยนเป็นยังไม่เสร็จแล้ว'); } });
      } else {
        items.push({ label: 'เปลี่ยนอันอื่น', onClick: () => swapTask(plan) });
        items.push({ label: 'เลื่อนไปพรุ่งนี้', onClick: () => { S.postponeTask(tc.task.id, plan.logDate); toast('เลื่อนไปพรุ่งนี้แล้ว ไม่เป็นไร'); } });
        items.push({ label: 'ข้ามวันนี้', onClick: () => { S.upsertLog(plan.logDate, { skipped_task: true }); toast('ข้ามงานวันนี้แล้ว ไม่เป็นไรเลย'); } });
      }
      items.push({ label: 'แก้ไข', onClick: () => A.taskSheet(tc.task) });
    }
    openMenu('งานของวันนี้', items);
  };

  A.choreMenu = function (plan) {
    const c = plan.chore;
    if (!c || !c.chore) return;
    const items = [];
    if (c.state === 'skipped') {
      items.push({ label: 'เอากลับมา', onClick: () => { S.unskipChore(c.chore.id, plan.logDate); toast('เอางานห้องกลับมาแล้ว'); } });
    } else if (c.state === 'done') {
      items.push({ label: 'ทำเครื่องหมายว่ายังไม่เสร็จ', onClick: () => { S.reopenChore(c.chore.id, plan.logDate); toast('เปลี่ยนเป็นยังไม่เสร็จแล้ว'); } });
    } else if (c.state === 'running') {
      items.push({ label: 'เปิดไทเมอร์', onClick: () => A.openTimerSheet() });
    } else {
      items.push({ label: 'เปลี่ยนอันอื่น', onClick: () => swapChore(plan) });
      items.push({ label: 'ข้ามวันนี้', onClick: () => { S.skipChore(c.chore.id, plan.logDate); toast('ข้ามงานห้องวันนี้แล้ว ไม่เป็นไรเลย'); } });
    }
    items.push({ label: 'แก้ไข', onClick: () => A.choreSheet(c.chore) });
    openMenu('งานห้องของวันนี้', items);
  };

  A.mealMenu = function (plan) {
    openMenu('มื้อแรก', [
      { label: plan.nextMeal && plan.nextMeal.status === 'logged' ? 'แก้เวลามื้อแรก' : 'บันทึกเวลามื้อแรก', onClick: () => A.logMeal(plan) },
      plan.nextMeal && plan.nextMeal.status !== 'skipped' ? { label: 'ไม่กินมื้อนี้', onClick: () => { S.setMeal(plan.logDate, 'skipped'); toast('ได้เลย บันทึกว่าไม่กินมื้อนี้'); } } : null,
      plan.nextMeal && plan.nextMeal.status !== 'unknown' ? { label: 'ยังไม่บันทึก', onClick: () => { S.setMeal(plan.logDate, 'unknown'); toast('กลับเป็นยังไม่บันทึกแล้ว'); } } : null,
    ]);
  };

  A.sleepMenu = function (plan) {
    openMenu('การนอน', [
      { label: 'เข้านอนตอนนี้', onClick: () => A.logBedtimeNow(plan) },
      { label: 'แก้เวลานอนเมื่อคืน', onClick: () => A.logLastNight(plan) },
    ]);
  };

  // ---------------------------------------------------------------- ผ่อนจังหวะ / รีเซ็ตตอนนี้
  A.winddownSheet = function (plan) {
    openSheet({
      title: 'ผ่อนจังหวะก่อนนอน',
      body: (ctl) =>
        h(
          'div',
          { class: 'stack' },
          h('p', null, `เวลานอนที่แนะนำ ${T.formatTime(plan.sleep.suggestedBedtime)} ลองค่อย ๆ ลดจังหวะลงทีละอย่าง`),
          h('ul', { class: 'muted', style: { margin: 0, paddingLeft: '20px', lineHeight: 1.9 } }, h('li', null, 'หรี่ไฟหรือปิดไฟที่ไม่จำเป็น'), h('li', null, 'วางมือถือไว้ไกลตัวสักพัก'), h('li', null, 'เตรียมของที่ต้องใช้พรุ่งนี้ชิ้นเล็ก ๆ')),
          h(
            'div',
            { class: 'btn-row' },
            h('button', { class: 'btn ghost', type: 'button', onClick: () => ctl.close() }, 'ยังก่อน'),
            h('button', { class: 'btn primary', type: 'button', onClick: () => { ctl.close(); setTimeout(() => A.logBedtimeNow(plan), 0); } }, 'เข้านอนตอนนี้')
          )
        ),
    });
  };

  /** ทำรายการของ "ปุ่มหลัก" และของ "รีเซ็ตตอนนี้" */
  A.run = function (action, plan, navigate) {
    switch (action) {
      case 'log_wake': return A.logWake(plan);
      case 'log_meal': return A.logMeal(plan);
      case 'start_task': {
        const tc = plan.taskCard;
        if (!tc || !tc.task) return;
        return A.startTask(tc.task.id, tc.proposed) && A.openTimerSheet();
      }
      case 'start_micro': {
        const tc = plan.taskCard;
        if (!tc || !tc.task) return;
        return A.startTask(tc.task.id, tc.proposed || tc.kind === 'main') && A.openTimerSheet();
      }
      case 'open_timer_task':
      case 'open_timer_chore':
        return A.openTimerSheet();
      case 'start_chore':
        return A.startChore(plan) && A.openTimerSheet();
      case 'winddown': return A.winddownSheet(plan);
      default: return undefined;
    }
  };

  A.resetNow = function (plan, navigate) {
    const now = S.now();
    const r = E.resetFrom(now, plan);
    S.track('reset_now_used');
    openSheet({
      title: 'รีเซ็ตตอนนี้',
      body: (ctl) =>
        h(
          'div',
          { class: 'stack' },
          h('p', null, r.items.length ? `เริ่มใหม่จาก ${T.formatTime(now)} เหลือแค่ ${r.items.length} อย่างก็พอ` : `เริ่มใหม่จาก ${T.formatTime(now)}`),
          r.items.length
            ? h(
                'div',
                { class: 'stack-sm' },
                r.items.map((it, i) =>
                  h(
                    'div',
                    { class: 'card row', style: { padding: '12px 14px' } },
                    h('span', { class: 'chip tint' }, String(i + 1)),
                    h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600, lineHeight: 1.5 } }, it.title), h('div', { class: 'muted small' }, it.sub)),
                    it.action
                      ? h('button', { class: 'btn soft small', type: 'button', onClick: () => { ctl.close(); setTimeout(() => A.run(it.action, S.plan(), navigate), 160); } }, 'เริ่ม')
                      : null
                  )
                )
              )
            : h('p', { class: 'muted' }, 'ตอนนี้ไม่มีอะไรค้างให้ทำ พักได้เลย'),
          h('p', { class: 'muted small' }, r.note + ' (ข้อมูลที่บันทึกไว้ไม่ถูกแก้ นี่เป็นแค่มุมมองของวันนี้)'),
          h('button', { class: 'btn ghost block', type: 'button', onClick: () => ctl.close() }, 'ปิด')
        ),
    });
  };

  RD.actions = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);
