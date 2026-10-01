/* ReDay v2 — ตัวแอป: router (hash), guards, appbar, แถบแท็บล่าง, แถบเตือนในแอป
 *
 * Guards: ไม่มี session → /auth | มี session แต่ตั้งค่ายังไม่เสร็จ → /onboarding
 *         มี session และตั้งค่าเสร็จแล้วเปิด / หรือ /auth → /today
 */
(function (g) {
  const RD = (g.RD = g.RD || {});
  const { h, $, icon } = RD.ui;
  const S = RD.store;
  const T = RD.time;
  RD.pages = RD.pages || {};

  const ROUTES = {
    '/': { page: 'landing', bar: 'brand', access: 'public', docTitle: 'ReDay · รีเซ็ตวันนี้' },
    '/auth': { page: 'auth', bar: 'back', backTo: '/', title: 'สมัคร / เข้าสู่ระบบ', access: 'guest' },
    '/auth/forgot': { page: 'forgot', bar: 'back', backTo: '/auth', title: 'ลืมรหัสผ่าน', access: 'guest' },
    '/auth/reset': { page: 'reset', bar: 'back', backTo: '/auth', title: 'ตั้งรหัสผ่านใหม่', access: 'reset' },
    '/privacy': { page: 'privacy', bar: 'back', backTo: '/', title: 'ความเป็นส่วนตัว', access: 'public' },
    '/terms': { page: 'terms', bar: 'back', backTo: '/', title: 'ข้อกำหนดการใช้งาน', access: 'public' },
    '/help': { page: 'help', bar: 'back', backTo: '/', title: 'ช่วยเหลือ', access: 'public' },
    '/guide': { page: 'guide', bar: 'back', backTo: '/', title: 'คู่มือการใช้งาน', access: 'public' },
    '/onboarding': { page: 'onboarding', bar: 'brand', access: 'onboarding' },
    '/today': { page: 'today', bar: 'title', title: 'วันนี้', tab: 'today', access: 'app' },
    '/plan': { page: 'plan', bar: 'title', title: 'แผน', tab: 'plan', access: 'app' },
    '/room': { page: 'room', bar: 'title', title: 'ห้อง', tab: 'room', access: 'app' },
    '/summary': { page: 'summary', bar: 'title', title: 'สรุป', tab: 'summary', access: 'app' },
    '/summary/history': { page: 'history', bar: 'back', backTo: '/summary', title: 'ประวัติ', tab: 'summary', access: 'app' },
    '/me': { page: 'me', bar: 'title', title: 'ฉัน', tab: 'me', access: 'app' },
  };
  const TABS = [
    { path: '/today', label: 'วันนี้', ico: 'today' },
    { path: '/plan', label: 'แผน', ico: 'plan' },
    { path: '/room', label: 'ห้อง', ico: 'room' },
    { path: '/summary', label: 'สรุป', ico: 'summary' },
    { path: '/me', label: 'ฉัน', ico: 'me' },
  ];

  let current = null; // { def, page, path }
  let lastPath = null;
  let activeNudge = null;
  let lastFingerprint = null;
  let toldPersist = false;

  const currentPath = () => {
    const raw = (location.hash || '').replace(/^#/, '').split('?')[0];
    return raw || '/';
  };
  function go(path, opts) {
    if (opts && opts.replace) {
      location.replace('#' + path);
    } else if (currentPath() === path) {
      render('same');
    } else {
      location.hash = path;
    }
  }
  function back(fallback) {
    if (lastPath && lastPath !== currentPath()) go(lastPath);
    else go(fallback || '/');
  }

  /** guard → path ที่ต้องไปแทน หรือ null */
  function guard(path, def) {
    const logged = S.isLoggedIn();
    const done = logged && S.profile().onboarding_complete;
    if (path === '/' && logged) return done ? '/today' : '/onboarding';
    if (def.access === 'public') return null;
    if (def.access === 'guest') {
      if (logged) return done ? '/today' : '/onboarding';
      return null;
    }
    if (def.access === 'reset') {
      if (logged) return '/today';
      return sessionStorage.getItem('reday2.reset') ? null : '/auth/forgot';
    }
    if (!logged) return '/auth';
    if (def.access === 'onboarding') return done ? '/today' : null;
    if (def.access === 'app') return done ? null : '/onboarding';
    return null;
  }

  function renderAppbar(def, ctx, page) {
    const bar = $('#appbar');
    bar.innerHTML = '';
    if (def.bar === 'brand') {
      bar.append(h('a', { class: 'brand', href: S.isLoggedIn() ? '#/today' : '#/' }, h('span', { class: 'dot' }), 'ReDay'), h('span', { class: 'spacer' }));
    } else {
      // หน้าที่มีหัวข้อ h1 ของตัวเองในเนื้อหา ใช้ชื่อหน้าบน header เป็นข้อความธรรมดา เพื่อให้มี h1 เดียวต่อหน้า
      const ownH1 = ['auth', 'forgot', 'reset', 'privacy', 'terms', 'help', 'guide'].includes(def.page);
      const title = h(ownH1 ? 'div' : 'h1', { class: 'title' }, def.title || '');
      if (def.bar === 'back') {
        bar.append(h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'ย้อนกลับ', onClick: () => back(def.backTo) }, icon('back', 22)), title);
      } else bar.append(title);
    }
    if (page.actions) append(bar, page.actions(ctx));
    document.title = def.docTitle || (def.title ? def.title + ' · ' : '') + 'ReDay';
  }
  const append = (el, nodes) => (nodes || []).forEach((n) => n && el.appendChild(n));

  function renderTabs(def) {
    const nav = $('#tabbar');
    const frame = $('#frame');
    nav.innerHTML = '';
    const show = !!def.tab;
    frame.classList.toggle('has-tabs', show);
    nav.hidden = !show;
    if (!show) return;
    TABS.forEach((t) => {
      const on = def.tab === t.path.slice(1);
      nav.appendChild(
        h('a', { class: 'tab' + (on ? ' on' : ''), href: '#' + t.path, 'aria-current': on ? 'page' : null }, icon(t.ico, 24), h('span', null, t.label))
      );
    });
  }

  // ---------- ขอความยินยอมใหม่เมื่อเนื้อหา (consentVersion) เปลี่ยน ----------
  let consentCtl = null;
  function consentGate(def) {
    const need = S.isLoggedIn() && S.needsConsent() && (def.access === 'app' || def.access === 'onboarding');
    if (!need) {
      if (consentCtl) consentCtl.close(null);
      return;
    }
    if (consentCtl) return;
    const toDoc = (ctl, path) => {
      ctl.close(null);
      go(path);
    };
    consentCtl = RD.ui.openSheet({
      title: 'ขอความยินยอมอีกครั้ง',
      modal: true,
      onClose: () => { consentCtl = null; },
      body: (ctl) =>
        h(
          'div',
          { class: 'stack' },
          h('p', null, 'นโยบายความเป็นส่วนตัวและข้อกำหนดมีการปรับปรุง เพราะข้อมูลการนอน การกิน และพลังงานเป็นข้อมูลส่วนตัว เราจึงขอความยินยอมจากคุณอีกครั้งก่อนใช้งานต่อ'),
          h('p', { class: 'muted small' }, 'อ่านเนื้อหาได้ที่ ',
            h('button', { class: 'link-btn', type: 'button', onClick: () => toDoc(ctl, '/privacy') }, 'นโยบายความเป็นส่วนตัว'), ' และ ',
            h('button', { class: 'link-btn', type: 'button', onClick: () => toDoc(ctl, '/terms') }, 'ข้อกำหนดการใช้งาน')),
          h('button', { class: 'btn primary big block', type: 'button', 'data-autofocus': '1', onClick: () => { S.acceptConsent(); ctl.close(null); RD.ui.toast('บันทึกความยินยอมแล้ว'); } }, 'ยอมรับและใช้งานต่อ'),
          h('button', { class: 'btn secondary block', type: 'button', onClick: () => { ctl.close(null); S.logout(); go('/'); } }, 'ยังไม่ยอมรับ ออกจากระบบก่อน'),
          h('button', { class: 'link-btn', type: 'button', style: { alignSelf: 'center' }, onClick: async () => {
            if (await RD.ui.confirmDialog({ title: 'ลบบัญชีและข้อมูลทั้งหมดใช่ไหม', message: 'ถ้าไม่ยินยอม ข้อมูลที่เก็บไว้ไม่มีเหตุผลให้เก็บต่อ บัญชีและข้อมูลทั้งหมดจะถูกลบทันที ย้อนกลับไม่ได้', confirmText: 'ลบบัญชี', danger: true })) {
              ctl.close(null);
              S.deleteAccount();
              go('/');
            }
          } }, 'ไม่ยินยอม ลบบัญชีและข้อมูล')
        ),
    });
  }

  // ---------- แถบเตือนในแอป (เฟส A: เตือนได้เฉพาะตอนเปิดแอป) ----------
  function nudgeStillValid(n, plan) {
    if (n.logDate !== plan.logDate || plan.mode === 'light') return false;
    // ปิดสวิตช์ชนิดนั้น หรือเข้าช่วง Quiet hours → แถบที่ขึ้นอยู่ต้องหายทันที (R10)
    const prof = S.profile();
    if (RD.engine.inQuietHours(prof, plan.now)) return false;
    if (n.kind === 'meal') return prof.notify_meal !== false && plan.trackMeals && plan.nextMeal && plan.nextMeal.status === 'unknown';
    if (n.kind === 'room') return prof.notify_room !== false && !!plan.chore && plan.chore.state === 'todo';
    if (n.kind === 'winddown') {
      const d = (plan.now - plan.sleep.winddownAt) / 60000;
      return prof.notify_winddown !== false && !plan.sleep.tonightBedAt && d >= 0 && d < RD.config.winddownWindowMin;
    }
    return false;
  }
  function syncNudge(plan, def) {
    const slot = $('#banner-slot');
    slot.innerHTML = '';
    if (!plan || !def || !def.tab) return;
    if (activeNudge && !nudgeStillValid(activeNudge, plan)) activeNudge = null;
    if (!activeNudge && plan.nudges.length) {
      const n = plan.nudges[0];
      S.markReminder(plan.logDate, n.kind, 'fired_at');
      S.track('nudge_shown', { kind: n.kind });
      activeNudge = { kind: n.kind, text: n.text, logDate: plan.logDate };
    }
    if (!activeNudge) return;
    const n = activeNudge;
    slot.appendChild(
      h(
        'div',
        { class: 'banner', role: 'status' },
        icon('feather', 20),
        h('p', null, n.text),
        h('button', { class: 'banner-btn', type: 'button', 'aria-label': 'ปิดการเตือนนี้', onClick: () => {
          S.markReminder(n.logDate, n.kind, 'dismissed_at');
          S.track('nudge_dismissed', { kind: n.kind });
          activeNudge = null;
          slot.innerHTML = '';
        } }, 'ปิด')
      )
    );
  }

  function fingerprint(plan) {
    return JSON.stringify([
      plan.copy, plan.summary.text, plan.summary.chips, plan.flags.map((f) => f.key), plan.energy.text,
      plan.timeline.map((i) => [i.id, i.status, +i.at, i.title, i.sub]), plan.next.action, plan.next.label,
      plan.care.show, plan.nudges.map((n) => n.kind), plan.chore && plan.chore.state, plan.mode,
    ]);
  }

  // ---------- render ----------
  function render(reason) {
    const path = currentPath();
    const def = ROUTES[path];
    if (!def) {
      go(S.isLoggedIn() ? '/today' : '/', { replace: true });
      return;
    }
    const redirect = guard(path, def);
    if (redirect) {
      go(redirect, { replace: true });
      return;
    }
    const page = RD.pages[def.page];
    if (!page) return;

    const view = $('#view');
    const samePage = current && current.path === path;
    const keepScroll = samePage && (reason === 'data' || reason === 'tick' || reason === 'same');
    const prevScroll = view.scrollTop;
    if (current && current.page.unmount && !keepScroll) current.page.unmount();

    let plan = null;
    if (S.isLoggedIn() && S.profile().onboarding_complete) {
      S.rollover(S.todayLogDate());
      plan = S.plan();
    }
    const ctx = { plan, path, def, go, back, rerender: () => render('data'), params: {} };
    if (!def.tab) activeNudge = null;

    renderAppbar(def, ctx, page);
    renderTabs(def);
    syncNudge(plan, def);
    const node = page.render(ctx);
    view.replaceChildren(node);
    view.scrollTop = keepScroll ? prevScroll : 0;
    if (!keepScroll) view.focus({ preventScroll: true });
    current = { def, page, path, ctx };
    lastFingerprint = plan ? fingerprint(plan) : null;
    consentGate(def);

    if (S.takeRecoveredNotice()) {
      RD.ui.toast('ข้อมูลเดิมในเครื่องอ่านไม่ได้ จึงเริ่มชุดใหม่ให้ (เก็บสำเนาเดิมไว้ในเบราว์เซอร์แล้ว)', { kind: 'warn' });
    }
    if (S.isLoggedIn() && !S.persistOk() && !toldPersist) {
      toldPersist = true;
      RD.ui.toast('เบราว์เซอร์นี้ไม่ให้บันทึกข้อมูลลงเครื่อง ข้อมูลจะอยู่แค่ระหว่างเปิดหน้านี้', { kind: 'warn' });
    }
  }

  let renderPending = false;
  function scheduleRender(reason) {
    if (renderPending) return;
    renderPending = true;
    // microtask: รวมการเปลี่ยนแปลงหลายครั้งในการกระทำเดียวเป็นการ render ครั้งเดียว
    // และไม่ถูกหน่วงเมื่อแท็บอยู่เบื้องหลัง (rAF/setTimeout ถูกหน่วง ทำให้หน้าไม่รีเฟรชหลังบันทึก)
    queueMicrotask(() => {
      renderPending = false;
      if (!current) return;
      if (current.page.live === false) {
        // หน้าฟอร์ม (เช่น ฉัน) ไม่ render ซ้ำเพื่อไม่ให้ช่องกรอกหลุดโฟกัส แต่แถบเตือนต้องตามสวิตช์/quiet hours ทันที
        if (current.def.tab && S.isLoggedIn() && S.profile().onboarding_complete) syncNudge(S.plan(), current.def);
        return;
      }
      const a = document.activeElement;
      if (a && $('#view').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      render(reason);
    });
  }

  function onRouteChange() {
    const path = currentPath();
    if (current && current.path !== path) lastPath = current.path;
    render('route');
  }

  // ---------- เวลาเดิน: ไทเมอร์ทุกวินาที, แผนเปลี่ยนเมื่อถึงเวลา ----------
  function tick(n) {
    if (current && current.page.tick) current.page.tick(current.ctx);
    if (n % 15 === 0 && current && current.page.live !== false && S.isLoggedIn() && S.profile().onboarding_complete && current.def.access === 'app') {
      const fp = fingerprint(S.plan());
      if (fp !== lastFingerprint && !RD.ui.hasOpenSheet()) scheduleRender('tick');
    }
  }

  function boot() {
    const q = new URLSearchParams(location.search);
    if (q.get('now')) T.clock.setFrom(q.get('now'));

    S.subscribe((what) => {
      if (what === 'session') {
        activeNudge = null;
        return;
      }
      if (what === 'external') {
        // แท็บอื่นเขียนข้อมูล/เข้า-ออกระบบ → โหลดเข้ามาแล้ววาดใหม่ (guards จะพาไปหน้าที่ถูกต้อง)
        activeNudge = null;
        queueMicrotask(() => render('route'));
        return;
      }
      scheduleRender('data');
    });
    window.addEventListener('hashchange', onRouteChange);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) scheduleRender('data');
    });
    let n = 0;
    setInterval(() => tick(++n), 1000);

    if (!location.hash) location.replace('#/');
    onRouteChange();

    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !q.get('nosw')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  RD.app = { go, back, render, boot, ROUTES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
