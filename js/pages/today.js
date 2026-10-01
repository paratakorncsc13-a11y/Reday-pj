/* ReDay v2 — /today
 * ปุ่มหลักปุ่มเดียว (เริ่มสิ่งถัดไป) ตัวเลือกที่เหลืออยู่ในเมนู "…" ของแต่ละการ์ด
 * ข้อความทุกบรรทัดมาจาก plan (DayPlan) ของ rule engine เท่านั้น
 */
(function (g) {
  const RD = g.RD;
  const { h, icon, openMenu } = RD.ui;
  const S = RD.store;
  const T = RD.time;
  const A = RD.actions;
  const P = (RD.pages = RD.pages || {});

  function moreBtn(label, onClick) {
    return h('button', { class: 'icon-btn more', type: 'button', 'aria-label': label, onClick }, icon('more', 22));
  }

  function timeRow(label, valueText, pillText, onTap) {
    const has = !!valueText;
    return h(
      'button',
      { class: 'trow', type: 'button', 'aria-label': has ? `${label} ${valueText} แตะเพื่อแก้` : `${label} ยังไม่บันทึก แตะเพื่อบันทึก`, onClick: onTap },
      h('span', { class: 'lbl' }, label),
      has
        ? h('span', { class: 'val' }, valueText, icon('chevron', 18))
        : h('span', { class: 'val empty' }, h('span', { class: 'chip tint', style: { minHeight: '40px' } }, pillText))
    );
  }

  function pcard(cls, iconName, name, onMore, body) {
    return h(
      'section',
      { class: `card pcard ${cls}`, 'aria-label': name },
      h('span', { class: `pillar-bar ${cls}` }),
      h(
        'div',
        { class: 'body' },
        h('div', { class: 'head' }, icon(iconName, 18), h('span', { class: 'grow' }, name)),
        body
      ),
      onMore ? moreBtn(`ตัวเลือกของการ์ด ${name}`, onMore) : null
    );
  }

  P.today = {
    actions(ctx) {
      const plan = ctx.plan;
      if (!plan) return [];
      return [
        h('span', { class: 'spacer' }),
        moreBtn('เมนูหน้า วันนี้', () =>
          openMenu('วันนี้', [
            { label: plan.mode === 'light' ? 'กลับโหมดปกติ' : 'วันนี้ขอเบา ๆ', sub: plan.mode === 'light' ? null : 'เหลือแค่สิ่งจำเป็น ปิดเตือนทั้งหมด', onClick: () => A.toggleLight(plan) },
            { label: 'เปลี่ยนระดับพลังงาน', onClick: () => A.editEnergy(plan) },
            plan.mode !== 'light' ? { label: 'รีเซ็ตตอนนี้', sub: 'แผนเช้าพังแล้ว เริ่มใหม่จากตอนนี้', onClick: () => A.resetNow(plan, ctx.go) } : null,
          ])
        ),
      ];
    },

    render(ctx) {
      const plan = ctx.plan;
      const copy = plan.copy;
      const light = plan.mode === 'light';
      if (plan.taskCard && plan.taskCard.task) S.markTaskShown(plan.taskCard.task.id, plan.logDate);
      if (plan.care.show) S.markCareShown(plan.logDate);

      const root = h('div', { class: 'stack' });

      // หัว: วันที่ไทย (พ.ศ.) คำทัก ชิปพลังงาน ชิปเวลาตื่น
      root.append(
        h(
          'header',
          { class: 'today-head' },
          h('div', { class: 'date' }, T.formatDate(plan.logDate)),
          h('h2', { style: { fontSize: '26px', margin: '2px 0 10px' } }, copy.greeting),
          h(
            'div',
            { class: 'chips' },
            h('button', { class: 'chip tint', type: 'button', 'aria-label': `${copy.energyChip} แตะเพื่อเปลี่ยน`, onClick: () => A.editEnergy(plan) }, icon('feather', 16), copy.energyChip),
            h('button', { class: 'chip', type: 'button', 'aria-label': `${copy.wakeChip} แตะเพื่อแก้`, onClick: () => A.logWake(plan) }, icon('clock', 16), copy.wakeChip)
          )
        )
      );

      if (light) {
        root.append(
          h('div', { class: 'light-bar', role: 'status' }, h('b', null, copy.lightBanner), h('button', { class: 'btn small secondary', type: 'button', onClick: () => A.toggleLight(plan) }, 'กลับโหมดปกติ'))
        );
      }

      if (plan.care.show) {
        root.append(
          h(
            'section',
            { class: 'card care-card', 'aria-label': 'ชวนคุย' },
            h('div', { class: 'row' }, icon('heart', 22), h('p', { class: 'grow' }, plan.care.text)),
            h(
              'div',
              { class: 'row', style: { justifyContent: 'flex-end', marginTop: '6px' } },
              h('a', { class: 'link-btn', href: '#/help', style: { display: 'inline-flex', alignItems: 'center' } }, 'ดูช่องทางช่วยเหลือ'),
              h('button', { class: 'btn ghost small', type: 'button', onClick: () => S.dismissCare(plan.logDate) }, 'ปิด')
            )
          )
        );
      }

      // ปุ่มหลักปุ่มเดียว
      const nx = plan.next;
      const nextTime = nx.at && nx.kind !== 'wake' ? T.formatTime(nx.at) : null;
      root.append(
        h(
          'section',
          { class: 'card next-card', 'aria-label': 'สิ่งถัดไป' },
          h('div', { class: 'kicker' }, nx.kind === 'done' ? 'วันนี้' : 'ถัดไป'),
          h('div', { class: 'next-title' }, nx.kind === 'wake' ? 'เริ่มจากเวลาตื่นของวันนี้' : nx.kind === 'done' ? 'วันนี้พอแล้ว พักได้เลย' : nx.title),
          nextTime ? h('div', { class: 'muted' }, `ช่วง ${nextTime}`) : null,
          nx.action
            ? h('button', { class: 'btn primary big block', type: 'button', onClick: () => A.run(nx.action, plan, ctx.go) }, nx.label)
            : null,
          !light
            ? h(
                'div',
                { class: 'secondary-row' },
                h('span', { class: 'muted small' }, 'แผนเช้าพังแล้ว?'),
                h('button', { class: 'btn ghost small', type: 'button', onClick: () => A.resetNow(plan, ctx.go) }, icon('refresh', 18), 'รีเซ็ตตอนนี้')
              )
            : null
        )
      );
      if (copy.lowEnergyNote) root.append(h('div', { class: 'note', role: 'note' }, copy.lowEnergyNote));

      // แถวเวลา (แสดงตลอด) — ห้ามบันทึกเวลาให้เอง เปิด TimePicker ก่อนเสมอ
      const meal = plan.nextMeal;
      const mealVal = !plan.trackMeals
        ? null
        : meal.status === 'logged'
          ? T.formatTime(meal.at)
          : meal.status === 'skipped'
            ? 'ไม่กินมื้อนี้'
            : null;
      root.append(
        h(
          'section',
          { class: 'card time-block', 'aria-label': 'บันทึกเวลา' },
          timeRow('เมื่อคืนหลับกี่โมง', plan.sleep.lastNight ? T.formatTime(plan.sleep.lastNight.at) : null, 'บันทึก', () => A.logLastNight(plan)),
          timeRow('ตื่นกี่โมง', plan.wake.at ? T.formatTime(plan.wake.at) : null, 'ตื่นแล้ว', () => A.logWake(plan)),
          plan.trackMeals ? timeRow('กินมื้อแรกกี่โมง', mealVal, 'กินแล้ว', () => A.logMeal(plan)) : null
        )
      );

      // การ์ดสี่เสา
      const sl = copy.sleep;
      root.append(
        pcard(
          'sleep', 'moon', 'นอน', () => A.sleepMenu(plan),
          h(
            'div',
            { class: 'pcard-lines' },
            sl.tonight ? h('div', { class: 'main' }, sl.tonight) : null,
            h('div', { class: sl.tonight ? 'l' : 'main' }, sl.last),
            sl.lastSub ? h('div', { class: 'sub' }, sl.lastSub) : null,
            h('div', { class: 'l' }, sl.winddown),
            h('div', { class: 'l' }, sl.suggest),
            sl.note ? h('div', { class: 'sub' }, sl.note) : null
          )
        )
      );

      if (plan.trackMeals && copy.meal) {
        root.append(pcard('meal', 'bowl', 'กิน', () => A.mealMenu(plan), h('div', null, h('div', { class: 'main' }, copy.meal.main), copy.meal.sub ? h('div', { class: 'sub' }, copy.meal.sub) : null)));
      }

      if (!light && copy.task) {
        const tc = copy.task;
        const body = h(
          'div',
          null,
          h('div', { class: 'main' }, tc.main),
          tc.sub ? h('div', { class: 'sub' }, tc.sub) : null,
          tc.empty ? h('button', { class: 'link-btn', type: 'button', onClick: () => ctx.go('/plan') }, 'ไปหน้า แผน') : null
        );
        root.append(pcard('work', 'work', plan.taskCard && plan.taskCard.kind === 'main' ? 'งาน · งานหลัก' : 'งาน · งานย่อย', tc.empty ? null : () => A.taskMenu(plan), body));
      }

      const cc = copy.chore;
      root.append(
        pcard(
          'room', 'home', 'ห้อง', cc.empty ? null : () => A.choreMenu(plan),
          h(
            'div',
            null,
            h('div', { class: 'main' }, cc.main),
            cc.sub ? h('div', { class: 'sub' }, cc.sub) : null,
            cc.empty ? h('button', { class: 'link-btn', type: 'button', onClick: () => ctx.go('/room') }, 'ไปหน้า ห้อง') : null
          )
        )
      );

      root.append(h('p', { class: 'hero-note', style: { textAlign: 'center' } }, 'ไม่แน่ใจว่าต้องกดอะไร ', h('a', { href: '#/guide', style: { display: 'inline-flex', alignItems: 'center', minHeight: '44px' } }, 'ดูคู่มือการใช้งาน')));
      return root;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
