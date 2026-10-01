/* ReDay v2 — ui/ component กลาง
 * h() สร้าง DOM, ไอคอน, Toast, Sheet, เมนู "…", ยืนยัน, TimePicker (ไม่ใช้ <input type="time">)
 */
(function (g) {
  const RD = (g.RD = g.RD || {});
  const T = RD.time;

  // ---------- DOM helper ----------
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') {
          // custom property (--x) ต้องใช้ setProperty; Object.assign ตั้งไม่ได้
          for (const [sk, sv] of Object.entries(v)) {
            if (sk.startsWith('--')) el.style.setProperty(sk, sv);
            else el.style[sk] = sv;
          }
        }
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked' || k === 'disabled' || k === 'required' || k === 'selected' || k === 'readOnly') el[k] = !!v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const $ = (sel, root) => (root || document).querySelector(sel);

  // ---------- ไอคอน (inline SVG, ใช้ currentColor) ----------
  const ICONS = {
    today: '<path d="M3 17h18M6 17a6 6 0 0 1 12 0M12 5v3M4.9 8.9l1.8 1.8M19.1 8.9l-1.8 1.8"/>',
    plan: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
    room: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
    summary: '<path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z"/><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z"/>',
    me: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5"/>',
    more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    bowl: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M9 7c0-1 1-1.5 1-2.5M13 7c0-1 1-1.5 1-2.5"/>',
    work: '<rect x="4" y="7" width="16" height="12" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    feather: '<path d="M20 4c-8 0-13 4.5-13 11v4"/><path d="M7 19c3 0 6-1 8-3.5S18 9 20 4"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>',
  };
  function icon(name, size) {
    const s = size || 22;
    const span = document.createElement('span');
    span.className = 'ico';
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
    return span;
  }

  // ---------- Toast: อยู่ใต้ header ไม่ทับชื่อหน้า หายเองใน 4 วินาที ----------
  let toastTimer = null;
  function toast(message, opts) {
    const slot = $('#toast-slot');
    if (!slot) return;
    slot.innerHTML = '';
    const t = h('div', { class: 'toast' + (opts && opts.kind ? ' ' + opts.kind : ''), role: 'status' }, message);
    slot.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      slot.innerHTML = '';
    }, 4000);
  }

  // ---------- Sheet (bottom sheet) ----------
  const sheetStack = [];
  function openSheet(opts) {
    const overlay = $('#overlay');
    const prevFocus = document.activeElement;
    const backdrop = h('div', { class: 'backdrop' });
    const closeBtn = h('button', { class: 'icon-btn sheet-close', type: 'button', 'aria-label': 'ปิด' }, icon('close', 20));
    const body = h('div', { class: 'sheet-body' });
    const sheet = h(
      'div',
      { class: 'sheet' + (opts.tall ? ' tall' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'หน้าต่าง' },
      h('div', { class: 'sheet-grab', 'aria-hidden': 'true' }),
      h('div', { class: 'sheet-head' }, h('h2', { class: 'sheet-title' }, opts.title || ''), closeBtn),
      body
    );
    const wrap = h('div', { class: 'sheet-wrap' }, backdrop, sheet);
    let closed = false;
    const ctl = {
      el: sheet,
      body,
      modal: !!opts.modal, // modal = ต้องตอบก่อน (เช่น ขอความยินยอมใหม่) ปิดด้วยฉากหลัง/Esc/ปุ่ม x ไม่ได้
      close(result) {
        if (closed) return;
        closed = true;
        const i = sheetStack.indexOf(ctl);
        if (i >= 0) sheetStack.splice(i, 1);
        wrap.classList.add('leaving');
        wrap.inert = true; // ระหว่างแอนิเมชันปิด (140ms) ปุ่มในแผ่นต้องกดซ้ำไม่ได้
        setTimeout(() => wrap.remove(), 140);
        const stillThere = prevFocus && prevFocus !== document.body && prevFocus.focus && document.contains(prevFocus);
        if (!sheetStack.length) {
          // หน้าอาจถูกรีเรนเดอร์ทับตัวที่เคยโฟกัส (เช่น หลังบันทึก) → คืนโฟกัสให้พื้นที่เนื้อหาแทนที่จะหลุดไป body
          const target = stillThere ? prevFocus : document.getElementById('view');
          try { target && target.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        }
        if (opts.onClose) opts.onClose(result);
      },
    };
    if (ctl.modal) closeBtn.hidden = true;
    backdrop.addEventListener('click', () => !ctl.modal && ctl.close(null));
    closeBtn.addEventListener('click', () => ctl.close(null));
    const content = typeof opts.body === 'function' ? opts.body(ctl) : opts.body;
    append(body, [content]);
    overlay.appendChild(wrap);
    sheetStack.push(ctl);
    sheet.tabIndex = -1;
    setTimeout(() => {
      const f = sheet.querySelector('[data-autofocus]') || sheet.querySelector('button, input, select, textarea');
      // opts.focus === false = ไม่เด้งเข้าช่องแรกอัตโนมัติ (เช่น TimePicker) แต่ยังย้ายโฟกัสเข้ามาในแผ่นเพื่อให้ Tab เริ่มจากในแผ่น
      if (opts.focus !== false && f) f.focus({ preventScroll: true });
      else sheet.focus({ preventScroll: true });
    }, 30);
    return ctl;
  }
  document.addEventListener('keydown', (e) => {
    const top = sheetStack[sheetStack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') return top.modal ? undefined : top.close(null);
    if (e.key === 'Tab') {
      // focus trap: Tab วนอยู่ในแผ่นบนสุด ไม่หลุดไปหน้าเบื้องหลัง
      const items = [...top.el.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const a = document.activeElement;
      if (!top.el.contains(a)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (a === first || a === top.el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && a === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  const hasOpenSheet = () => sheetStack.length > 0;
  /** ปิดทุกแผ่นรวมแผ่น modal (ใช้ตอนออกจากระบบ/ในชุดทดสอบ) */
  function closeAllSheets() {
    [...sheetStack].reverse().forEach((c) => c.close(null));
  }

  /** เมนู "…" — รายการทางเลือกของการ์ด */
  function openMenu(title, items) {
    return openSheet({
      title,
      body: (ctl) =>
        h(
          'div',
          { class: 'menu-list' },
          items
            .filter(Boolean)
            .map((it) =>
              h(
                'button',
                {
                  class: 'menu-item' + (it.danger ? ' danger' : ''),
                  type: 'button',
                  onClick: () => {
                    ctl.close(null);
                    setTimeout(() => it.onClick && it.onClick(), 0);
                  },
                },
                it.label,
                it.sub ? h('span', { class: 'menu-sub' }, it.sub) : null
              )
            )
        ),
    });
  }

  /** ยืนยัน (ใช้กับการลบ) → Promise<boolean> */
  function confirmDialog(opts) {
    return new Promise((resolve) => {
      let answered = false;
      openSheet({
        title: opts.title,
        onClose: () => {
          if (!answered) resolve(false);
        },
        body: (ctl) =>
          h(
            'div',
            { class: 'stack' },
            opts.message ? h('p', { class: 'muted' }, opts.message) : null,
            h(
              'div',
              { class: 'btn-row' },
              h('button', { class: 'btn ghost', type: 'button', onClick: () => ctl.close(null) }, opts.cancelText || 'ยกเลิก'),
              h(
                'button',
                {
                  class: 'btn ' + (opts.danger ? 'danger' : 'primary'),
                  type: 'button',
                  'data-autofocus': '1',
                  onClick: () => {
                    answered = true;
                    resolve(true);
                    ctl.close(true);
                  },
                },
                opts.confirmText || 'ตกลง'
              )
            )
          ),
      });
    });
  }

  // ---------- TimePicker (โปรเจกต์เอง ไม่ใช้ <input type="time">) ----------
  /**
   * pickTime({ title, initial?, hint?, extra? }) → Promise<{ minutes, edited } | null>
   * - เปิดมาพร้อมเวลาปัจจุบัน (หรือ initial) แก้ได้ก่อนกดบันทึก
   * - ชั่วโมง 00–23, นาที 00–59 (ปุ่มลัดทีละ 5 พร้อมปรับ ±1), ช่องพิมพ์ HH:mm แบบมาสก์เป็นทางเลือก
   * extra: [{label, value}] ปุ่มทางเลือกเพิ่ม (เช่น "ไม่กินมื้อนี้") → resolve { extra: value }
   */
  function pickTime(opts) {
    return new Promise((resolve) => {
      const start = typeof opts.initial === 'number' ? opts.initial : T.minuteOfDay(RD.store ? RD.store.now() : new Date());
      let hh = Math.floor(start / 60);
      let mm = start % 60;
      let done = false;

      const bigH = h('span', { class: 'tp-h' });
      const bigM = h('span', { class: 'tp-m' });
      const display = h('div', { class: 'tp-display', 'aria-live': 'polite' }, bigH, ':', bigM, h('span', { class: 'tp-unit' }, ' น.'));
      const input = h('input', {
        class: 'input tp-input',
        type: 'text',
        inputmode: 'numeric',
        autocomplete: 'off',
        maxlength: '5',
        placeholder: 'HH:mm',
        'aria-label': 'พิมพ์เวลา แบบ ชั่วโมง:นาที',
      });
      const hint = h('div', { class: 'tp-hint', 'aria-live': 'polite' }, opts.hint || '');
      const hourBtns = [];
      const minBtns = [];
      const minVal = h('span', { class: 'tp-minval' });

      function sync(fromInput) {
        bigH.textContent = T.pad(hh);
        bigM.textContent = T.pad(mm);
        minVal.textContent = T.pad(mm);
        hourBtns.forEach((b, i) => b.classList.toggle('on', i === hh));
        minBtns.forEach((b, i) => b.classList.toggle('on', i * 5 === mm));
        if (!fromInput) input.value = `${T.pad(hh)}:${T.pad(mm)}`;
      }

      for (let i = 0; i < 24; i++) {
        hourBtns.push(
          h('button', { class: 'tp-cell', type: 'button', 'aria-label': `${T.pad(i)} นาฬิกา`, onClick: () => { hh = i; sync(); } }, T.pad(i))
        );
      }
      for (let i = 0; i < 12; i++) {
        minBtns.push(
          h('button', { class: 'tp-cell', type: 'button', 'aria-label': `${T.pad(i * 5)} นาที`, onClick: () => { mm = i * 5; sync(); } }, T.pad(i * 5))
        );
      }
      /** ค่าในช่องพิมพ์ใช้ได้ไหม: ว่าง/ตรงกับที่เลือกอยู่ = ใช้ได้ ถ้าพิมพ์ค้างหรือเกินช่วง = ยังบันทึกไม่ได้ */
      const typedProblem = () => {
        const v = input.value.trim();
        if (v === `${T.pad(hh)}:${T.pad(mm)}`) return null;
        const m = /^(\d{2}):(\d{2})$/.exec(v);
        if (!m) return 'พิมพ์เวลาให้ครบ 4 หลัก เช่น 08:30 หรือเลือกจากปุ่มด้านล่างแทนก็ได้';
        if (Number(m[1]) > 23 || Number(m[2]) > 59) return 'ชั่วโมงมี 00–23 และนาทีมี 00–59 ลองตรวจอีกครั้งนะ';
        return null;
      };
      input.addEventListener('input', () => {
        const d = input.value.replace(/\D/g, '').slice(0, 4);
        input.value = d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2) : d;
        hint.textContent = opts.hint || '';
        if (d.length === 4) {
          const H = Number(d.slice(0, 2));
          const Mi = Number(d.slice(2));
          if (H <= 23 && Mi <= 59) {
            hh = H;
            mm = Mi;
            sync(true);
          } else {
            hint.textContent = 'ชั่วโมงมี 00–23 และนาทีมี 00–59 ลองตรวจอีกครั้งนะ';
          }
        }
      });

      const content = (ctl) =>
        h(
          'div',
          { class: 'tp' },
          display,
          hint,
          h('label', { class: 'tp-typed' }, h('span', { class: 'muted small' }, 'หรือพิมพ์เวลา'), input),
          h('div', { class: 'tp-label' }, 'ชั่วโมง'),
          h('div', { class: 'tp-grid hours' }, hourBtns),
          h(
            'div',
            { class: 'tp-label tp-minrow' },
            h('span', null, 'นาที'),
            h(
              'span',
              { class: 'tp-step' },
              h('button', { class: 'tp-pm', type: 'button', 'aria-label': 'ลดหนึ่งนาที', onClick: () => { mm = (mm + 59) % 60; sync(); } }, '−1'),
              minVal,
              h('button', { class: 'tp-pm', type: 'button', 'aria-label': 'เพิ่มหนึ่งนาที', onClick: () => { mm = (mm + 1) % 60; sync(); } }, '+1')
            )
          ),
          h('div', { class: 'tp-grid mins' }, minBtns),
          opts.extra && opts.extra.length
            ? h(
                'div',
                { class: 'tp-extra' },
                opts.extra.map((x) =>
                  h(
                    'button',
                    {
                      class: 'btn ghost block',
                      type: 'button',
                      onClick: () => {
                        done = true;
                        resolve({ extra: x.value });
                        ctl.close(null);
                      },
                    },
                    x.label
                  )
                )
              )
            : null,
          h(
            'div',
            { class: 'btn-row sticky' },
            h('button', { class: 'btn ghost', type: 'button', onClick: () => ctl.close(null) }, 'ยกเลิก'),
            h(
              'button',
              {
                class: 'btn primary',
                type: 'button',
                'data-autofocus': '1',
                onClick: () => {
                  const problem = typedProblem();
                  if (problem) {
                    // ไม่บันทึกเงียบ ๆ ด้วยค่าเดิมที่ผู้ใช้ไม่ได้ตั้งใจ: บอกเบา ๆ แล้วให้แก้ต่อ
                    hint.textContent = problem;
                    input.focus();
                    return;
                  }
                  done = true;
                  resolve({ minutes: hh * 60 + mm, edited: hh * 60 + mm !== start });
                  ctl.close(null);
                },
              },
              opts.saveText || 'บันทึก'
            )
          )
        );

      openSheet({
        title: opts.title || 'เลือกเวลา',
        tall: true,
        onClose: () => {
          if (!done) resolve(null);
        },
        body: content,
        focus: false,
      });
      sync();
    });
  }

  // ---------- ส่วนประกอบเล็ก ----------
  function toggle(opts) {
    const btn = h('button', {
      class: 'switch' + (opts.checked ? ' on' : ''),
      type: 'button',
      role: 'switch',
      'aria-checked': opts.checked ? 'true' : 'false',
      'aria-label': opts.label,
      onClick: () => {
        const on = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        btn.classList.toggle('on', on);
        opts.onChange && opts.onChange(on);
      },
    }, h('span', { class: 'knob' }));
    return btn;
  }

  function segmented(options, value, onChange, label) {
    const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label || '' });
    options.forEach((o) => {
      const b = h(
        'button',
        {
          class: 'seg-btn' + (o.value === value ? ' on' : ''),
          type: 'button',
          role: 'radio',
          'aria-checked': o.value === value ? 'true' : 'false',
          onClick: () => {
            wrap.querySelectorAll('.seg-btn').forEach((x) => {
              x.classList.remove('on');
              x.setAttribute('aria-checked', 'false');
            });
            b.classList.add('on');
            b.setAttribute('aria-checked', 'true');
            onChange(o.value);
          },
        },
        o.label
      );
      wrap.appendChild(b);
    });
    return wrap;
  }

  function field(label, control, extra) {
    return h(
      'label',
      { class: 'field' },
      h('span', { class: 'field-label' }, label),
      control,
      extra && extra.hint ? h('span', { class: 'field-hint' }, extra.hint) : null,
      h('span', { class: 'field-error', role: 'alert' }, extra && extra.error ? extra.error : '')
    );
  }

  function pillar(name) {
    return h('span', { class: `pillar-bar ${name}`, 'aria-hidden': 'true' });
  }

  function emptyState(title, text, action) {
    return h('div', { class: 'empty' }, h('div', { class: 'empty-title' }, title), text ? h('p', { class: 'muted' }, text) : null, action || null);
  }

  function loadingState(text) {
    return h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), text || 'กำลังโหลด… รอสักครู่นะ');
  }

  /** นาฬิกาจับเวลาแบบ mm:ss */
  const mmss = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    return `${T.pad(Math.floor(s / 60))}:${T.pad(s % 60)}`;
  };

  RD.ui = {
    h, append, $, icon, toast, openSheet, openMenu, confirmDialog, pickTime, toggle, segmented, field, pillar,
    emptyState, loadingState, mmss, hasOpenSheet, closeAllSheets,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
