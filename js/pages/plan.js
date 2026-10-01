/* ReDay v2 — /plan ไทม์ไลน์จากเวลาจริงของวันนี้ + รายการงานของผู้ใช้ (เพิ่ม แก้ ลบ เลื่อน เริ่ม) */
(function (g) {
  const RD = g.RD;
  const { h, icon, openMenu, confirmDialog, toast, emptyState } = RD.ui;
  const S = RD.store;
  const T = RD.time;
  const A = RD.actions;
  const P = (RD.pages = RD.pages || {});

  const ENERGY_TEXT = { low: 'พลังงานต่ำ', med: 'พลังงานกลาง', high: 'พลังงานสูง' };

  function taskSub(t) {
    const bits = [`${t.minutes} นาที`, ENERGY_TEXT[t.energy_needed]];
    if (t.due_date) bits.push(`ส่ง ${T.formatDateShort(t.due_date)}`);
    return bits.join(' · ');
  }

  function taskRow(t, logDate, ctx) {
    const doing = t.status === 'doing';
    return h(
      'button',
      { class: 'task-row', type: 'button', onClick: () => taskActions(t, logDate, ctx) },
      h('span', { class: `pillar-bar work`, style: { minHeight: '36px' } }),
      h(
        'span',
        { class: 't-main' },
        h('div', { class: 't-title' }, t.title, t.is_sample ? h('span', { class: 'chip sample', style: { marginLeft: '8px' } }, 'ตัวอย่าง') : null),
        h('div', { class: 't-sub' }, taskSub(t) + (doing ? ' · กำลังทำอยู่' : ''))
      ),
      icon('chevron', 18)
    );
  }

  function taskActions(t, logDate, ctx) {
    const items = [];
    if (t.status === 'done') {
      items.push({ label: 'ทำเครื่องหมายว่ายังไม่เสร็จ', onClick: () => { S.reopenTask(t.id); toast('เปลี่ยนเป็นยังไม่เสร็จแล้ว'); } });
    } else {
      items.push(
        t.status === 'doing'
          ? { label: 'เปิดไทเมอร์', onClick: () => A.openTimerSheet() }
          : { label: 'เริ่มงาน', sub: `ตั้งไทเมอร์ ${t.minutes} นาที`, onClick: () => { if (A.startTask(t.id, false)) A.openTimerSheet(); } }
      );
      if (t.postponed_until && t.postponed_until > logDate) items.push({ label: 'เอากลับมาวันนี้', onClick: () => { S.unpostponeTask(t.id); toast('เอางานกลับมาแล้ว'); } });
      else items.push({ label: 'เลื่อนไปพรุ่งนี้', onClick: () => { S.postponeTask(t.id, logDate); toast('เลื่อนไปพรุ่งนี้แล้ว ไม่เป็นไร'); } });
    }
    items.push({ label: 'แก้ไข', onClick: () => A.taskSheet(t) });
    items.push({
      label: 'ลบ',
      danger: true,
      onClick: async () => {
        if (await confirmDialog({ title: 'ลบงานนี้ใช่ไหม', message: `"${t.title}" จะหายไปจากรายการ`, confirmText: 'ลบงาน', danger: true })) {
          S.removeTask(t.id);
          toast('ลบงานแล้ว');
        }
      },
    });
    openMenu(t.title, items);
  }

  function fold(title, count, children) {
    return h('details', { class: 'fold', style: { marginTop: '10px' } }, h('summary', null, `${title} (${count})`), children);
  }

  P.plan = {
    render(ctx) {
      const plan = ctx.plan;
      const root = h('div', { class: 'stack' });
      const meal = plan.nextMeal;

      // ชิป: ตื่นแล้ว · กินแล้ว · พลังงาน
      root.append(
        h(
          'div',
          { class: 'chips', style: { marginTop: '4px' } },
          h('button', { class: 'chip', type: 'button', onClick: () => A.logWake(plan) }, icon('clock', 16), plan.wake.at ? plan.wake.chipText : 'ตื่นแล้ว'),
          plan.trackMeals
            ? h('button', { class: 'chip', type: 'button', onClick: () => A.logMeal(plan) }, icon('bowl', 16), meal.status === 'logged' ? `กินแล้ว ${T.formatTime(meal.at)}` : meal.status === 'skipped' ? 'ไม่กินมื้อนี้' : 'กินแล้ว')
            : null,
          h('button', { class: 'chip tint', type: 'button', onClick: () => A.editEnergy(plan) }, icon('feather', 16), plan.copy.energyChip)
        )
      );

      // ไทม์ไลน์
      const tlTap = {
        wake: () => A.logWake(plan),
        meal: () => A.logMeal(plan),
        task: () => A.taskMenu(plan),
        chore: () => ctx.go('/room'),
        winddown: () => A.winddownSheet(plan),
        sleep: () => A.logBedtimeNow(plan),
      };
      const tl = h('div', { class: 'tl' });
      plan.timeline.forEach((it) => {
        const isNext = it.status === 'next';
        tl.append(
          h(
            'div',
            { class: `tl-item ${it.pillar} ${it.status}` },
            h('div', { class: 'tl-time num' }, T.formatTime(it.at)),
            h('div', { class: 'tl-mid' }, h('span', { class: 'tl-dot' })),
            h(
              'button',
              { class: 'tl-body', type: 'button', style: { textAlign: 'left', background: 'none', border: 0, padding: '6px 0 10px', minHeight: '44px' }, onClick: tlTap[it.kind], 'aria-label': `${T.formatTime(it.at)} ${it.title}` },
              h('div', { class: 'tl-title' }, it.title, isNext ? h('span', { class: 'tl-tag' }, 'ถัดไป') : null),
              it.sub ? h('div', { class: 'tl-sub' }, it.sub) : null
            )
          )
        );
      });
      root.append(
        h(
          'section',
          { class: 'card', 'aria-label': 'ไทม์ไลน์ของวันนี้' },
          h('h2', { style: { fontSize: '18px' } }, 'แผนของวันนี้'),
          !plan.wake.at ? h('p', { class: 'muted small', style: { marginTop: '4px' } }, 'บันทึกเวลาตื่นแล้วแผนจะขยับตามเวลาจริงของวันนี้') : null,
          tl,
          plan.mode === 'light' ? h('p', { class: 'muted small' }, 'วันนี้ขอเบา ๆ — เหลือแค่สิ่งจำเป็น') : null
        )
      );

      // งานของฉัน
      const all = S.listTasks();
      const logDate = plan.logDate;
      const isPostponed = (t) => t.postponed_until && t.postponed_until > logDate;
      const active = all.filter((t) => (t.status === 'todo' || t.status === 'doing') && !isPostponed(t));
      active.sort((a, b) => (a.due_date && b.due_date ? (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0) : a.due_date ? -1 : b.due_date ? 1 : String(a.created_at).localeCompare(String(b.created_at))));
      const waiting = all.filter((t) => (t.status === 'todo' || t.status === 'doing') && isPostponed(t));
      const done = all.filter((t) => t.status === 'done').sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at))).slice(0, 15);

      root.append(
        h(
          'div',
          { class: 'row between', style: { marginTop: '8px' } },
          h('h2', { class: 'section-title', style: { margin: '10px 4px' } }, 'งานของฉัน'),
          h('button', { class: 'btn soft small', type: 'button', onClick: () => A.taskSheet(null) }, icon('plus', 18), 'เพิ่มงาน')
        )
      );
      root.append(
        active.length
          ? h('section', { class: 'card', style: { padding: '4px 12px' } }, active.map((t) => taskRow(t, logDate, ctx)))
          : h('section', { class: 'card' }, emptyState('ยังไม่มีงานค้าง', 'เพิ่มงานที่อยากทำสัปดาห์นี้ได้เลย ชิ้นเล็กก็ได้', h('button', { class: 'btn soft', type: 'button', onClick: () => A.taskSheet(null) }, 'เพิ่มงานแรก')))
      );
      if (waiting.length) root.append(fold('รอไว้', waiting.length, h('div', null, waiting.map((t) => taskRow(t, logDate, ctx)))));
      if (done.length) root.append(fold('เสร็จแล้ว', done.length, h('div', null, done.map((t) => taskRow(t, logDate, ctx)))));
      return root;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
