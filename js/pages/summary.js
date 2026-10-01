/* ReDay v2 — /summary (สรุป) และ /summary/history (ประวัติย้อนหลังและแก้ข้อมูล)
 * สรุปสร้างจาก flags เท่านั้น ไม่ใช่การวินิจฉัย ติดป้าย "ระบบช่วยคิด" และผู้ใช้แก้เหตุผลเองได้
 */
(function (g) {
  const RD = g.RD;
  const { h, icon, openMenu, openSheet, confirmDialog, pickTime, segmented, toast } = RD.ui;
  const S = RD.store;
  const T = RD.time;
  const A = RD.actions;
  const P = (RD.pages = RD.pages || {});

  const REASON_OPTIONS = [
    { key: 'sick', text: 'ป่วย' },
    { key: 'long_shift', text: 'เรียนหรือกะยาว' },
    { key: 'errand', text: 'มีธุระ' },
    { key: 'other', text: 'อื่น ๆ' },
  ];

  let lastViewed = 0;

  // ---------------------------------------------------------------- /summary
  P.summary = {
    render(ctx) {
      const plan = ctx.plan;
      const sum = plan.summary;
      const date = plan.logDate;
      if (Date.now() - lastViewed > 60000) {
        S.track('summary_viewed');
        lastViewed = Date.now();
      }
      const keys = sum.chips.map((c) => c.key);
      const saveReasons = (list) => S.upsertLog(date, { slipped_reasons: list, reasons_edited: true });

      const root = h('div', { class: 'stack' });
      const chips = h('div', { class: 'chips', style: { marginBottom: '8px' } });
      if (!sum.light) {
        sum.chips.forEach((c) =>
          chips.append(
            h(
              'button',
              {
                class: 'chip ' + (c.kind === 'user' ? 'sage' : 'amber'),
                type: 'button',
                'aria-label': `${c.text} แตะเพื่อแก้เหตุผล`,
                onClick: () =>
                  openMenu(c.text, [
                    { label: 'ไม่ใช่เหตุผลนี้', sub: 'เอาออกจากสรุปของวันนี้', onClick: () => saveReasons(keys.filter((k) => k !== c.key)) },
                  ]),
              },
              c.text
            )
          )
        );
        chips.append(
          h(
            'button',
            {
              class: 'chip',
              type: 'button',
              onClick: () =>
                openMenu(
                  'เหตุผลอื่น',
                  REASON_OPTIONS.filter((o) => !keys.includes(o.key)).map((o) => ({ label: o.text, onClick: () => saveReasons(keys.concat(o.key)) }))
                ),
            },
            icon('plus', 14),
            'เหตุผลอื่น'
          )
        );
      }

      root.append(
        h(
          'section',
          { class: 'card sum-card', 'aria-label': 'สรุป' },
          h('div', { class: 'row between', style: { flexWrap: 'wrap' } }, h('h2', null, sum.title), h('span', { class: 'badge' }, icon('info', 14), sum.badge)),
          h('p', { class: 'sum-text' }, sum.text),
          sum.light ? null : chips,
          sum.edited ? h('button', { class: 'link-btn', type: 'button', onClick: () => S.upsertLog(date, { slipped_reasons: [], reasons_edited: false }) }, 'ให้ระบบเดาใหม่') : null,
          h('p', { class: 'muted small' }, 'ระบบช่วยคิดจากสิ่งที่คุณบันทึกไว้ ไม่ใช่การวินิจฉัย และแก้เหตุผลได้เองทุกข้อ')
        )
      );

      root.append(
        h(
          'section',
          { class: 'card stack' },
          h('div', null, h('b', null, 'พร้อมนอนแล้ว?'), h('p', { class: 'muted small' }, plan.copy.sleep.tonight || plan.copy.sleep.suggest)),
          h('button', { class: 'btn secondary big block', type: 'button', onClick: () => A.logBedtimeNow(plan) }, icon('moon', 20), 'เข้านอนตอนนี้'),
          h('a', { class: 'link-btn', href: '#/summary/history', style: { alignSelf: 'center', display: 'inline-flex', alignItems: 'center' } }, 'ดูย้อนหลัง')
        )
      );
      return root;
    },
  };

  // ---------------------------------------------------------------- /summary/history
  const hist = { count: 0 };

  function dayDots(date, track) {
    const log = S.getLog(date);
    const cut = S.cutoff();
    const win = T.logDayWindow(date, cut);
    const inWin = (x) => x && new Date(x) >= win.start && new Date(x) < win.end;
    const tasks = S.listTasks();
    const work = tasks.some((t) => inWin(t.started_at) || inWin(t.completed_at) || t.micro_done_date === date);
    const room = S.listCompletions().some((c) => c.log_date === date && c.completed_at);
    return {
      sleep: !!(log && (log.woke_at || log.bedtime_at)),
      meal: !!(log && log.meal_status && log.meal_status !== 'unknown'),
      work,
      room,
      hasLog: !!log,
    };
  }

  P.history = {
    render(ctx) {
      const plan = ctx.plan;
      const track = plan.trackMeals;
      const today = plan.logDate;
      if (!hist.count) {
        const logs = S.listLogs().map((l) => l.log_date).sort();
        const first = logs.length ? logs[0] : today;
        hist.count = Math.max(7, Math.min(30, T.diffDays(today, first) + 4));
      }
      const root = h('div', { class: 'stack' });
      root.append(
        h(
          'div',
          { class: 'legend', style: { padding: '4px 4px 0' } },
          h('span', null, h('i', { class: 'dot sleep full' }), 'นอน'),
          track ? h('span', null, h('i', { class: 'dot meal full' }), 'กิน') : null,
          h('span', null, h('i', { class: 'dot work full' }), 'งาน'),
          h('span', null, h('i', { class: 'dot room full' }), 'ห้อง'),
          h('span', null, h('i', { class: 'dot sleep' }), 'โปร่ง = ยังไม่บันทึก')
        )
      );
      const list = h('section', { class: 'card', style: { padding: '4px 12px' } });
      for (let i = 0; i < hist.count; i++) {
        const date = T.addDays(today, -i);
        const d = dayDots(date, track);
        const day = d.hasLog ? S.planForDay(date) : null;
        const sub = day && !day.summary.light && day.summary.chips.length ? day.summary.chips.map((c) => c.text).join(' · ') : day && day.mode === 'light' ? 'วันนี้ขอเบา ๆ' : d.hasLog ? '' : 'ยังไม่บันทึก';
        list.append(
          h(
            'button',
            { class: 'hist-day', type: 'button', onClick: () => editDay(date, ctx), 'aria-label': `${T.formatDate(date)} แตะเพื่อดูหรือแก้` },
            h('div', null, h('div', { class: 'd-date' }, (i === 0 ? 'วันนี้ · ' : '') + T.formatDate(date)), sub ? h('div', { class: 'd-sub' }, sub) : null),
            h(
              'span',
              { class: 'dots', 'aria-hidden': 'true' },
              h('i', { class: 'dot sleep' + (d.sleep ? ' full' : '') }),
              track ? h('i', { class: 'dot meal' + (d.meal ? ' full' : '') }) : null,
              h('i', { class: 'dot work' + (d.work ? ' full' : '') }),
              h('i', { class: 'dot room' + (d.room ? ' full' : '') })
            )
          )
        );
      }
      root.append(list);
      root.append(h('button', { class: 'btn secondary block', type: 'button', onClick: () => { hist.count += 30; ctx.rerender(); } }, 'โหลดเพิ่ม 30 วัน'));
      return root;
    },
  };

  /** แผ่นแก้ข้อมูลย้อนหลัง — บันทึกแล้วคำนวณสรุปของวันนั้นใหม่ */
  function editDay(date, ctx) {
    const log = S.getLog(date) || {};
    const track = S.profile().track_meals !== false;
    const cut = S.cutoff();
    const mod = (x) => (x ? T.minuteOfDay(x) : null);
    const st = {
      bed: mod(log.bedtime_at),
      wake: mod(log.woke_at),
      mealStatus: log.meal_status || 'unknown',
      meal: mod(log.first_meal_at),
      mode: log.day_mode || 'normal',
      energy: log.energy_override || null,
      reasons: log.reasons_edited ? (log.slipped_reasons || []).slice() : [],
      edited: !!log.reasons_edited,
    };
    const before = S.planForDay(date);

    openSheet({
      title: T.formatDate(date),
      tall: true,
      focus: false,
      body: (ctl) => {
        const box = h('div', { class: 'stack' });
        const draw = () => {
          box.innerHTML = '';
          const tf = (label, key, title) =>
            h(
              'div',
              { class: 'field' },
              h('span', { class: 'field-label' }, label),
              h(
                'button',
                {
                  class: 'time-field',
                  type: 'button',
                  onClick: async () => {
                    const r = await pickTime({
                      title,
                      initial: st[key] == null ? undefined : st[key],
                      extra: st[key] != null ? [{ label: 'ล้างเวลา (ยังไม่บันทึก)', value: 'clear' }] : null,
                    });
                    if (!r) return;
                    st[key] = r.extra === 'clear' ? null : r.minutes;
                    draw();
                  },
                },
                h('span', { class: 'v' + (st[key] == null ? ' muted' : '') }, st[key] == null ? 'ยังไม่บันทึก' : T.formatTime(st[key])),
                icon('clock', 20)
              )
            );
          const allReasons = [
            { key: 'late_bedtime', text: RD.msg.FLAG_TEXT.late_bedtime },
            track ? { key: 'missing_meal', text: RD.msg.FLAG_TEXT.missing_meal } : null,
            { key: 'main_task_not_started', text: RD.msg.FLAG_TEXT.main_task_not_started },
            { key: 'chore_skipped', text: RD.msg.FLAG_TEXT.chore_skipped },
          ].filter(Boolean).concat(REASON_OPTIONS);

          RD.ui.append(box, [
            before.summary.text
              ? h('div', { class: 'note', style: { marginTop: 0 } }, h('b', null, 'สรุปของวันนั้น (ระบบช่วยคิด)'), h('div', null, before.summary.text))
              : null,
            tf('เวลาเข้านอนของคืนวันนั้น', 'bed', 'เข้านอนกี่โมง'),
            tf('ตื่นกี่โมง', 'wake', 'ตื่นกี่โมง'),
            track
              ? h(
                  'div',
                  { class: 'field' },
                  h('span', { class: 'field-label' }, 'มื้อแรก'),
                  segmented([{ value: 'logged', label: 'บันทึก' }, { value: 'skipped', label: 'ไม่กิน' }, { value: 'unknown', label: 'ยังไม่บันทึก' }], st.mealStatus, (v) => { st.mealStatus = v; draw(); }, 'มื้อแรก'),
                  st.mealStatus === 'logged' ? tf('เวลากินมื้อแรก', 'meal', 'กินมื้อแรกกี่โมง') : null
                )
              : null,
            h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'โหมดของวัน'), segmented([{ value: 'normal', label: 'ปกติ' }, { value: 'light', label: 'ขอเบา ๆ' }], st.mode, (v) => (st.mode = v), 'โหมดของวัน')),
            h(
              'div',
              { class: 'field' },
              h('span', { class: 'field-label' }, 'พลังงาน'),
              segmented([{ value: null, label: 'ระบบเดา' }, { value: 'low', label: 'ต่ำ' }, { value: 'normal', label: 'ปกติ' }, { value: 'good', label: 'ดี' }], st.energy, (v) => (st.energy = v), 'พลังงาน')
            ),
            h(
              'div',
              { class: 'field' },
              h('span', { class: 'field-label' }, 'เหตุผลของวันนั้น'),
              h('span', { class: 'field-hint' }, 'ไม่เลือกอะไร = ให้ระบบเดาจากข้อมูลที่บันทึก'),
              h(
                'div',
                { class: 'chips' },
                allReasons.map((r) =>
                  h(
                    'button',
                    {
                      class: 'chip' + (st.reasons.includes(r.key) ? ' tint' : ''),
                      type: 'button',
                      'aria-pressed': st.reasons.includes(r.key) ? 'true' : 'false',
                      onClick: () => {
                        st.reasons = st.reasons.includes(r.key) ? st.reasons.filter((k) => k !== r.key) : st.reasons.concat(r.key);
                        st.edited = st.reasons.length > 0;
                        draw();
                      },
                    },
                    st.reasons.includes(r.key) ? icon('check', 14) : null,
                    r.text
                  )
                )
              )
            ),
            h(
              'div',
              { class: 'btn-row sticky' },
              h('button', { class: 'btn ghost', type: 'button', disabled: !S.getLog(date), onClick: async () => {
                if (await confirmDialog({ title: 'ลบบันทึกของวันนี้ใช่ไหม', message: `บันทึกของ ${T.formatDate(date)} จะหายไป รวมถึงงานห้องที่ทำในวันนั้น`, confirmText: 'ลบบันทึก', danger: true })) {
                  S.deleteLog(date);
                  ctl.close();
                  toast('ลบบันทึกของวันนั้นแล้ว');
                }
              } }, date === S.todayLogDate() ? 'ลบบันทึกวันนี้' : 'ลบบันทึกวันนั้น'),
              h('button', { class: 'btn primary', type: 'button', onClick: () => save(ctl) }, 'บันทึก')
            )
          ]);
        };
        const save = (c) => {
          const patch = {
            day_mode: st.mode,
            energy_override: st.energy,
            slipped_reasons: st.reasons,
            reasons_edited: st.edited,
            woke_at: st.wake != null ? T.resolveInLogDay(date, st.wake, cut).toISOString() : null,
            bedtime_at: st.bed != null ? T.atBkk(date, 720 + ((st.bed - 720 + 1440) % 1440)).toISOString() : null,
          };
          S.upsertLog(date, patch);
          if (track) {
            if (st.mealStatus === 'logged' && st.meal != null) S.setMeal(date, 'logged', T.resolveInLogDay(date, st.meal, cut));
            else S.setMeal(date, st.mealStatus === 'logged' ? 'unknown' : st.mealStatus);
          }
          c.close();
          toast('บันทึกแล้ว คำนวณสรุปของวันนั้นใหม่ให้แล้ว');
        };
        draw();
        return box;
      },
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
