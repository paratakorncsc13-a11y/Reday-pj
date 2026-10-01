/* ReDay v2 — /room เก็บทีละ 10 นาที
 * สถานะเสร็จอ่านจาก chore_completions เท่านั้น (วันนี้ ห้อง แผน จึงตรงกัน) และเสร็จเมื่อกด "เสร็จ" เท่านั้น
 */
(function (g) {
  const RD = g.RD;
  const { h, icon, toast, emptyState, append } = RD.ui;
  /** เหมือน el.append แต่ข้าม null/false (el.append(null) จะพิมพ์คำว่า "null" ลงหน้า) */
  const add = (el, ...nodes) => append(el, nodes);
  const S = RD.store;
  const T = RD.time;
  const C = RD.config;
  const A = RD.actions;
  const P = (RD.pages = RD.pages || {});

  let panel = null;
  const chosen = {}; // chore id -> นาทีที่เลือกก่อนเริ่ม (5 / 10 / 15)

  P.room = {
    tick() {
      if (panel) panel.tick();
    },
    unmount() {
      panel = null;
    },
    render(ctx) {
      const plan = ctx.plan;
      const root = h('div', { class: 'stack room-hero' });
      const cc = plan.chore;
      root.append(h('h2', null, 'เก็บทีละ 10 นาที'));

      // ไทเมอร์กำลังเดิน (เปิดหน้านับถอยหลังบนหน้าเดียวกัน)
      panel = null;
      if (cc && cc.state === 'running') {
        panel = A.timerPanel({ only: 'chore' });
        root.append(panel.el);
      } else if (cc && cc.chore) {
        const minutes = chosen[cc.chore.id] || cc.minutes;
        const body = h('div', null);
        if (cc.state === 'done') {
          add(body,
            h('div', { class: 'row', style: { color: 'var(--olive)' } }, icon('check', 24), h('b', null, 'เสร็จแล้ว')),
            h('div', { class: 'next-title', style: { fontFamily: 'var(--font-head)', fontSize: '22px', margin: '4px 0' } }, cc.chore.title),
            h('p', { class: 'muted' }, 'วันนี้ห้องได้รับการดูแลแล้ว ขอบคุณนะ')
          );
        } else if (cc.state === 'skipped') {
          add(body,
            h('div', { class: 'next-title', style: { fontFamily: 'var(--font-head)', fontSize: '22px' } }, cc.chore.title),
            h('p', { class: 'muted' }, 'ข้ามวันนี้แล้ว ไม่เป็นไรเลย พรุ่งนี้ค่อยว่ากัน'),
            h('button', { class: 'btn soft', type: 'button', onClick: () => { S.unskipChore(cc.chore.id, plan.logDate); toast('เอางานห้องกลับมาแล้ว'); } }, 'เอากลับมา')
          );
        } else {
          const startBtn = h('button', { class: 'btn primary big block', type: 'button' }, `ทำเลย ${minutes} นาที`);
          const chips = h('div', { class: 'chip-select', role: 'radiogroup', 'aria-label': 'ปรับนาทีไทเมอร์' });
          const draw = () => {
            chips.innerHTML = '';
            [5, 10, 15].forEach((m) =>
              chips.appendChild(
                h('button', { class: 'opt' + ((chosen[cc.chore.id] || cc.minutes) === m ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': (chosen[cc.chore.id] || cc.minutes) === m ? 'true' : 'false', onClick: () => { chosen[cc.chore.id] = m; draw(); startBtn.textContent = `ทำเลย ${m} นาที`; } }, `${m} นาที`)
              )
            );
          };
          if (!cc.optional) draw();
          startBtn.addEventListener('click', () => {
            A.startChore(plan, cc.optional ? cc.minutes : chosen[cc.chore.id] || cc.minutes);
          });
          if (cc.optional) startBtn.textContent = `ทำเลย ${cc.minutes} นาที`;
          add(body,
            h('div', { class: 'muted small' }, cc.optional ? 'วันนี้ขอเบา ๆ · ไม่บังคับ' : 'แนะนำวันนี้'),
            h('div', { class: 'next-title', style: { fontFamily: 'var(--font-head)', fontSize: '22px', margin: '2px 0 4px' } }, cc.chore.title),
            h('p', { class: 'muted' }, plan.copy.chore.sub),
            !cc.optional ? h('div', { style: { margin: '10px 0' } }, chips) : null,
            startBtn
          );
        }
        root.append(
          h(
            'section',
            { class: 'card pcard room', style: { display: 'block', position: 'relative' } },
            h('div', { style: { position: 'absolute', top: '4px', right: '4px' } }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ตัวเลือกของงานห้องนี้', onClick: () => A.choreMenu(plan) }, icon('more', 22))),
            body
          )
        );
        if (plan.copy.lowEnergyNote) root.append(h('div', { class: 'note' }, plan.copy.lowEnergyNote));
      } else {
        root.append(h('section', { class: 'card' }, emptyState(plan.copy.chore.main, 'เพิ่มงานห้องสั้น ๆ ไว้ แล้วระบบจะเลือกให้ทีละอย่าง', h('button', { class: 'btn soft', type: 'button', onClick: () => A.choreSheet(null) }, 'เพิ่มงานห้อง'))));
      }

      // รายการงานห้อง
      const chores = S.listChores();
      const comps = S.listCompletions();
      const stateOf = (c) => {
        const row = comps.find((x) => x.chore_id === c.id && x.log_date === plan.logDate);
        if (!row) return null;
        if (row.completed_at) return 'เสร็จวันนี้';
        if (row.skipped) return 'ข้ามวันนี้';
        return 'กำลังทำ';
      };
      root.append(
        h(
          'div',
          { class: 'row between', style: { marginTop: '8px' } },
          h('h2', { class: 'section-title', style: { margin: '10px 4px' } }, 'งานห้องของฉัน'),
          h('button', { class: 'btn soft small', type: 'button', onClick: () => A.choreSheet(null) }, icon('plus', 18), 'เพิ่มงานห้อง')
        )
      );
      root.append(
        chores.length
          ? h(
              'section',
              { class: 'card', style: { padding: '4px 12px' } },
              chores.map((c) => {
                const st = stateOf(c);
                return h(
                  'div',
                  { class: 'chore-row' },
                  h('span', { class: 'pillar-bar room', style: { minHeight: '32px' } }),
                  h(
                    'button',
                    { class: 'c-main', type: 'button', onClick: () => A.choreSheet(c), 'aria-label': `แก้ไข ${c.title}` },
                    h('div', { class: 'c-title' }, c.title, c.is_sample ? h('span', { class: 'chip sample', style: { marginLeft: '8px' } }, 'ตัวอย่าง') : null),
                    h('div', { class: 'c-sub' }, `${c.minutes} นาที`)
                  ),
                  st ? h('span', { class: 'chip ' + (st === 'เสร็จวันนี้' ? 'sage' : 'amber') }, st === 'เสร็จวันนี้' ? icon('check', 14) : null, st) : null
                );
              })
            )
          : h('section', { class: 'card' }, emptyState('ยังไม่มีงานห้อง', 'เริ่มจากชิ้นเล็ก ๆ สัก 5–10 นาที'))
      );

      // เพิ่มจากชุดแนะนำ (ห้ามซ้ำ)
      const have = new Set(chores.map((c) => c.title.trim().toLowerCase()));
      const missing = C.sampleChores.filter((s) => !have.has(s.title.toLowerCase()));
      if (missing.length) {
        root.append(
          h(
            'div',
            { class: 'stack-sm' },
            h('div', { class: 'muted small', style: { padding: '0 4px' } }, 'เพิ่มจากชุดแนะนำ'),
            h('div', { class: 'chips' }, missing.map((s) => h('button', { class: 'chip', type: 'button', onClick: () => { const r = S.addChore({ title: s.title, minutes: s.minutes }); if (r.ok) toast(`เพิ่ม "${s.title}" แล้ว`); else toast('มีงานนี้อยู่แล้ว'); } }, icon('plus', 14), s.title)))
          )
        );
      }
      return root;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
