/* ReDay v2 — /me ตั้งค่า บัญชี ความเป็นส่วนตัว (ส่งออก ลบข้อมูล ลบบัญชี ถอนความยินยอม ส่งความเห็น) */
(function (g) {
  const RD = g.RD;
  const { h, icon, toggle, openSheet, confirmDialog, pickTime, toast, field } = RD.ui;
  const S = RD.store;
  const T = RD.time;
  const C = RD.config;
  const P = (RD.pages = RD.pages || {});

  function timeSetting(label, key, ctx, opts) {
    const p = S.profile();
    const val = p[key];
    return h(
      'button',
      {
        class: 'trow',
        type: 'button',
        'aria-label': `${label} ${val ? T.formatTime(val) : 'ยังไม่ตั้ง'} แตะเพื่อแก้`,
        onClick: async () => {
          const r = await pickTime({ title: label, initial: val ? T.parseHM(val) : undefined });
          if (r && r.minutes != null) {
            S.updateProfile({ [key]: T.hmStr(r.minutes) });
            toast(opts && opts.toast ? opts.toast : 'บันทึกแล้ว แผนวันนี้อัปเดตทันที');
            ctx.rerender();
          }
        },
      },
      h('span', { class: 'lbl' }, label),
      h('span', { class: 'val' }, val ? T.formatTime(val) : 'ยังไม่ตั้ง', icon('chevron', 18))
    );
  }

  function switchRow(label, sub, checked, onChange) {
    return h('div', { class: 'switch-row' }, h('div', { class: 'sr-text' }, h('b', null, label), sub ? h('span', { class: 'muted small' }, sub) : null), toggle({ checked, label, onChange }));
  }

  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function typeToConfirm(opts) {
    openSheet({
      title: opts.title,
      body: (ctl) => {
        const input = h('input', { class: 'input', type: 'text', autocomplete: 'off', 'aria-label': `พิมพ์ ${opts.word} เพื่อยืนยัน`, placeholder: opts.word });
        const btn = h('button', { class: 'btn danger', type: 'button', disabled: true, onClick: () => { ctl.close(); opts.onConfirm(); } }, opts.confirmText);
        input.addEventListener('input', () => { btn.disabled = input.value.trim() !== opts.word; });
        return h(
          'div',
          { class: 'stack' },
          h('p', null, opts.message),
          field(`พิมพ์ "${opts.word}" เพื่อยืนยัน`, input),
          h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => ctl.close() }, 'ยกเลิก'), btn)
        );
      },
    });
  }

  P.me = {
    live: false,
    render(ctx) {
      const p = S.profile();
      const acc = S.accountInfo();
      const root = h('div', { class: 'stack' });
      const save = (patch, msg) => {
        S.updateProfile(patch);
        toast(msg || 'บันทึกแล้ว แผนวันนี้อัปเดตทันที');
      };

      // ชื่อ
      const nameIn = h('input', { class: 'input', type: 'text', maxlength: '40', value: p.display_name || '', 'aria-label': 'ชื่อที่อยากให้เรียก' });
      nameIn.addEventListener('change', () => save({ display_name: nameIn.value.trim() }));
      root.append(h('section', { class: 'me-group' }, h('h2', null, 'โปรไฟล์'), h('div', { class: 'card' }, field('ชื่อที่อยากให้เรียก', nameIn))));

      // จังหวะนอน
      root.append(
        h(
          'section',
          { class: 'me-group' },
          h('h2', null, 'จังหวะนอนและตื่น'),
          h('div', { class: 'card me-card' }, timeSetting('ปกติหลับกี่โมง', 'usual_bedtime', ctx), timeSetting('เวลานอนเป้าหมาย', 'target_bedtime', ctx), timeSetting('เวลาตื่นเป้าหมาย', 'target_wake', ctx))
        )
      );

      // มื้อแรก
      const delayChips = h('div', { class: 'chip-select', role: 'radiogroup', 'aria-label': 'มื้อแรกหลังตื่นกี่นาที' });
      const drawDelay = () => {
        delayChips.innerHTML = '';
        C.mealDelayOptions.forEach((m) =>
          delayChips.appendChild(
            h('button', { class: 'opt' + (S.profile().meal_delay_minutes === m ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': S.profile().meal_delay_minutes === m ? 'true' : 'false', onClick: () => { save({ meal_delay_minutes: m }); drawDelay(); } }, `${m} นาที`)
          )
        );
      };
      drawDelay();
      root.append(
        h(
          'section',
          { class: 'me-group' },
          h('h2', null, 'เรื่องกิน'),
          h(
            'div',
            { class: 'card me-card' },
            switchRow('ติดตามเรื่องมื้ออาหาร', 'ปิดได้โดยไม่ต้องบอกเหตุผล เมื่อปิด ระบบจะไม่คำนวณมื้อ ไม่เตือน และไม่ใส่ในสรุป', p.track_meals !== false, (on) => {
              save({ track_meals: on }, on ? 'เปิดการติดตามมื้ออาหารแล้ว' : 'ซ่อนเรื่องกินแล้ว');
              ctx.rerender(); // ซ่อน/แสดงตัวเลือกมื้อแรกตามสวิตช์
            }),
            // เมื่อซ่อนเสา กิน ไม่แสดงตัวเลือกเกี่ยวกับมื้ออีกในหน้านี้
            p.track_meals !== false ? h('div', { style: { padding: '8px 0 12px' } }, h('div', { class: 'field-label', style: { marginBottom: '8px' } }, 'มื้อแรกหลังตื่นกี่นาที'), delayChips) : null
          )
        )
      );

      // การเตือน
      const quietOn = !!(p.quiet_start && p.quiet_end);
      root.append(
        h(
          'section',
          { class: 'me-group' },
          h('h2', null, 'การเตือน'),
          h(
            'div',
            { class: 'card me-card' },
            p.track_meals !== false ? switchRow('เตือนมื้อแรก', null, p.notify_meal !== false, (on) => save({ notify_meal: on })) : null,
            switchRow('เตือนผ่อนจังหวะก่อนนอน', null, p.notify_winddown !== false, (on) => save({ notify_winddown: on })),
            switchRow('เตือนเก็บห้องสั้น ๆ', null, p.notify_room !== false, (on) => save({ notify_room: on })),
            switchRow('ช่วงเวลาเงียบ (Quiet hours)', 'ปิดการเตือนทุกชนิดในช่วงนี้', quietOn, (on) => {
              if (on) S.updateProfile({ quiet_start: '23:00', quiet_end: '07:00' });
              else S.updateProfile({ quiet_start: null, quiet_end: null });
              toast(on ? 'ตั้งช่วงเงียบ 23:00 – 07:00 น. ปรับเวลาได้ด้านล่าง' : 'ปิดช่วงเวลาเงียบแล้ว');
              ctx.rerender();
            }),
            quietOn ? timeSetting('เริ่มเงียบ', 'quiet_start', ctx) : null,
            quietOn ? timeSetting('เงียบถึง', 'quiet_end', ctx) : null
          ),
          h('p', { class: 'hero-note' }, 'ตอนนี้การเตือนจะขึ้นระหว่างที่เปิดแอปอยู่ ยังไม่ส่งแจ้งเตือนออกนอกแอป')
        )
      );

      // บัญชีและข้อมูล
      const rowBtn = (label, sub, onClick, danger) =>
        h('button', { class: 'trow', type: 'button', onClick }, h('span', { class: 'lbl', style: danger ? { fontWeight: 700 } : null }, label, sub ? h('div', { class: 'muted small' }, sub) : null), icon('chevron', 18));
      root.append(
        h(
          'section',
          { class: 'me-group' },
          h('h2', null, 'บัญชีและข้อมูลของฉัน'),
          h(
            'div',
            { class: 'card me-card' },
            h('div', { class: 'trow', style: { cursor: 'default' } }, h('span', { class: 'lbl' }, 'อีเมล'), h('span', { class: 'val', style: { fontWeight: 500, wordBreak: 'break-all' } }, acc ? acc.email : '')),
            rowBtn('เปลี่ยนรหัสผ่าน', null, () => changePasswordSheet()),
            rowBtn('รหัสกู้คืนบัญชี', 'ใช้ตั้งรหัสผ่านใหม่ถ้าลืม สร้างรหัสใหม่ได้ที่นี่', () => recoverySheet()),
            rowBtn('ส่งออกข้อมูล', 'ได้ไฟล์ JSON ของข้อมูลทั้งหมดของคุณ', () => {
              const d = S.exportData();
              download(`reday-export-${T.ymd(S.now())}.json`, JSON.stringify(d, null, 2));
              toast('ส่งออกข้อมูลแล้ว');
            }),
            rowBtn('ลบข้อมูลทั้งหมด', 'ล้างข้อมูลทั้งหมดแต่คงบัญชีไว้', async () => {
              if (await confirmDialog({ title: 'ลบข้อมูลทั้งหมดใช่ไหม', message: 'งาน งานห้อง และบันทึกทุกวันจะหายไป บัญชียังอยู่ แล้วจะกลับไปตั้งค่าใหม่ ย้อนกลับไม่ได้ ลองส่งออกข้อมูลสำรองก่อนก็ได้', confirmText: 'ลบข้อมูลทั้งหมด', danger: true })) {
                S.wipeData();
                toast('ลบข้อมูลทั้งหมดแล้ว');
                ctx.go('/onboarding');
              }
            }, true),
            rowBtn('ลบบัญชี', 'ข้อมูลทุกตารางหายทันที', () =>
              typeToConfirm({ title: 'ลบบัญชี', word: 'ลบบัญชี', message: 'บัญชีและข้อมูลทั้งหมดของคุณจะถูกลบทันที ย้อนกลับไม่ได้', confirmText: 'ลบบัญชีถาวร', onConfirm: () => { S.deleteAccount(); ctx.go('/'); toast('ลบบัญชีแล้ว'); } }), true),
            rowBtn('ถอนความยินยอม', 'มีผลเท่ากับลบบัญชี', () =>
              typeToConfirm({ title: 'ถอนความยินยอม', word: 'ลบบัญชี', message: 'ข้อมูลที่เก็บมีเหตุผลเดียวคือการให้บริการ เมื่อถอนความยินยอม บัญชีและข้อมูลทั้งหมดจะถูกลบทันที', confirmText: 'ถอนและลบบัญชี', onConfirm: () => { S.deleteAccount(); ctx.go('/'); toast('ถอนความยินยอมและลบบัญชีแล้ว'); } }), true)
          ),
          h('p', { class: 'hero-note' }, 'ข้อมูลทั้งหมดอยู่ในเบราว์เซอร์ของเครื่องนี้เท่านั้น ถ้าล้างข้อมูลเว็บไซต์ ข้อมูลจะหาย แนะนำให้ส่งออกข้อมูลสำรองเป็นระยะ')
        )
      );

      root.append(
        h(
          'section',
          { class: 'me-group' },
          h('h2', null, 'อื่น ๆ'),
          h(
            'div',
            { class: 'card me-card' },
            rowBtn('ส่งความเห็น', 'บอกเราว่าอะไรใช้ได้หรือไม่ได้', () => feedbackSheet()),
            h('a', { class: 'trow', href: '#/guide', style: { textDecoration: 'none', color: 'inherit' } }, h('span', { class: 'lbl' }, 'คู่มือการใช้งาน', h('div', { class: 'muted small' }, 'วิธีใช้แต่ละฟีเจอร์ และคำตอบเมื่อติดขัด')), icon('chevron', 18)),
            h('a', { class: 'trow', href: '#/help', style: { textDecoration: 'none', color: 'inherit' } }, h('span', { class: 'lbl' }, 'ช่วยเหลือ'), icon('chevron', 18)),
            h('a', { class: 'trow', href: '#/privacy', style: { textDecoration: 'none', color: 'inherit' } }, h('span', { class: 'lbl' }, 'นโยบายความเป็นส่วนตัว'), icon('chevron', 18)),
            h('a', { class: 'trow', href: '#/terms', style: { textDecoration: 'none', color: 'inherit' } }, h('span', { class: 'lbl' }, 'ข้อกำหนดการใช้งาน'), icon('chevron', 18))
          ),
          h('button', { class: 'btn secondary block', style: { marginTop: '14px' }, type: 'button', onClick: () => { S.logout(); ctx.go('/'); } }, 'ออกจากระบบ'),
          h('p', { class: 'hero-note', style: { textAlign: 'center' } }, `ReDay v${C.version} · ข้อมูลในแอปไม่ใช่คำแนะนำทางการแพทย์`)
        )
      );
      return root;
    },
  };

  function changePasswordSheet() {
    openSheet({
      title: 'เปลี่ยนรหัสผ่าน',
      body: (ctl) => {
        const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', placeholder: 'รหัสผ่านที่ใช้อยู่' });
        const pw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'อย่างน้อย 6 ตัว' });
        const errCur = h('span', { class: 'field-error', role: 'alert' });
        const err = h('span', { class: 'field-error', role: 'alert' });
        let busy = false;
        cur.addEventListener('input', () => { errCur.textContent = ''; });
        pw.addEventListener('input', () => { err.textContent = ''; });
        return h(
          'form',
          {
            class: 'stack',
            onSubmit: async (e) => {
              e.preventDefault();
              if (busy) return;
              busy = true;
              const r = await S.changePassword({ current: cur.value, next: pw.value });
              busy = false;
              if (!r.ok) {
                if (r.error === 'wrong_current') errCur.textContent = 'รหัสผ่านที่ใช้อยู่ไม่ถูกต้อง';
                else err.textContent = 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัว';
                return;
              }
              ctl.close();
              toast('เปลี่ยนรหัสผ่านแล้ว');
            },
          },
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'รหัสผ่านที่ใช้อยู่'), cur, errCur),
          h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'รหัสผ่านใหม่'), pw, err),
          h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => ctl.close() }, 'ยกเลิก'), h('button', { class: 'btn primary', type: 'submit' }, 'บันทึก'))
        );
      },
    });
  }

  function recoverySheet() {
    openSheet({
      title: 'รหัสกู้คืนบัญชี',
      body: (ctl) => {
        const area = h('div', { class: 'stack' });
        area.append(
          h('p', null, 'เราเก็บรหัสนี้ไว้ในรูปแบบที่อ่านย้อนกลับไม่ได้ จึงแสดงของเดิมซ้ำไม่ได้ ถ้าไม่แน่ใจว่าเก็บรหัสเดิมไว้ ให้สร้างรหัสใหม่ รหัสเดิมจะใช้ได้จนกว่าคุณจะกดบันทึกรหัสใหม่'),
          h('button', { class: 'btn primary block', type: 'button', onClick: () => {
            const code = S.draftRecoveryCode(); // ยังไม่แทนรหัสเดิม จนกว่าจะกด "จดแล้ว บันทึกรหัสนี้"
            let committed = false;
            area.innerHTML = '';
            area.append(
              h('div', { class: 'recovery', 'aria-label': 'รหัสกู้คืนใหม่ ' + code }, code),
              h('p', { class: 'muted small' }, 'จดหรือแคปหน้าจอเก็บไว้ก่อน แล้วกดบันทึกรหัสนี้ ถ้าปิดหน้านี้โดยไม่กด รหัสเดิมของคุณยังใช้ได้เหมือนเดิม'),
              h('button', { class: 'btn secondary block', type: 'button', onClick: async () => { try { await navigator.clipboard.writeText(code); toast('คัดลอกรหัสแล้ว'); } catch (e) { toast('คัดลอกไม่ได้ ลองจดไว้แทนนะ'); } } }, 'คัดลอกรหัส'),
              h('button', { class: 'btn primary block', type: 'button', onClick: async () => {
                if (committed) return;
                committed = true;
                const ok = await S.commitRecoveryCode(code);
                ctl.close();
                toast(ok ? 'บันทึกรหัสกู้คืนใหม่แล้ว รหัสเดิมใช้ไม่ได้อีก' : 'บันทึกรหัสไม่สำเร็จ ลองอีกครั้งนะ');
              } }, 'จดแล้ว บันทึกรหัสนี้')
            );
          } }, 'สร้างรหัสกู้คืนใหม่'),
          h('button', { class: 'btn ghost block', type: 'button', onClick: () => ctl.close() }, 'ปิด')
        );
        return area;
      },
    });
  }

  function feedbackSheet() {
    openSheet({
      title: 'ส่งความเห็น',
      body: (ctl) => {
        const ta = h('textarea', { class: 'input', maxlength: '500', placeholder: 'อะไรใช้ได้ดี อะไรสะดุด หรืออยากให้มีอะไร', 'aria-label': 'ความเห็น' });
        const err = h('span', { class: 'field-error', role: 'alert' });
        let sent = false; // ดับเบิลคลิกต้องไม่ส่งซ้ำ
        ta.addEventListener('input', () => { err.textContent = ''; });
        return h(
          'form',
          {
            class: 'stack',
            onSubmit: (e) => {
              e.preventDefault();
              if (sent) return;
              const r = S.addFeedback('me', ta.value);
              if (!r.ok) { err.textContent = 'พิมพ์อะไรสักหน่อยก่อนนะ'; return; }
              sent = true;
              ctl.close();
              toast('ขอบคุณสำหรับความเห็น บันทึกไว้แล้ว');
            },
          },
          h('p', { class: 'muted small' }, 'ความเห็นถูกบันทึกในเครื่องนี้ พร้อมกับข้อมูลอื่นของคุณ (ส่งออกได้ในหน้า ฉัน) ยังไม่ได้ส่งไปที่ไหน'),
          ta,
          err,
          h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => ctl.close() }, 'ยกเลิก'), h('button', { class: 'btn primary', type: 'submit' }, 'ส่งความเห็น'))
        );
      },
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
