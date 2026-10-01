/* ReDay v2 — หน้าสาธารณะ: Landing, สมัคร/เข้าสู่ระบบ, ลืมรหัสผ่าน, ตั้งรหัสผ่านใหม่, นโยบาย, ข้อกำหนด, ช่วยเหลือ */
(function (g) {
  const RD = g.RD;
  const { h, icon, field, toast } = RD.ui;
  const S = RD.store;
  const C = RD.config;
  const P = (RD.pages = RD.pages || {});

  const footer = () =>
    h(
      'div',
      { class: 'footer' },
      h('div', { class: 'links' }, h('a', { href: '#/guide' }, 'คู่มือการใช้งาน'), h('a', { href: '#/privacy' }, 'นโยบายความเป็นส่วนตัว'), h('a', { href: '#/terms' }, 'ข้อกำหนด'), h('a', { href: '#/help' }, 'ช่วยเหลือ')),
      h('div', null, 'ข้อมูลในแอปไม่ใช่คำแนะนำทางการแพทย์')
    );

  // ---------------------------------------------------------------- Landing
  P.landing = {
    render() {
      const pillar = (cls, name, text) =>
        h('div', { class: 'card pillar-card' }, h('span', { class: `pillar-bar ${cls}` }), h('div', null, h('h3', null, name), h('p', { class: 'muted' }, text)));
      return h(
        'div',
        { class: 'landing', style: { position: 'relative' } },
        h('div', { class: 'land-glow' }),
        h(
          'div',
          { class: 'land-inner' },
          h(
            'section',
            { class: 'hero-land' },
            h('span', { class: 'badge' }, 'ReDay • รีเซ็ตวันนี้'),
            h('h1', null, 'วันนี้ไม่ต้องเริ่มใหม่ทั้งชีวิต แค่รีเซ็ตวันนี้'),
            h('p', { class: 'lead' }, 'ReDay ช่วยล็อกจังหวะนอน กิน งาน และเก็บห้อง ตามพลังงานจริง'),
            // CTA จาก Landing = ผู้ใช้ใหม่ เปิดหน้า สมัคร เสมอ (ไม่ค้างโหมด เข้าสู่ระบบ จากครั้งก่อน)
            h('div', { class: 'cta' }, h('a', { class: 'btn primary big', href: '#/auth', onClick: () => { authState.mode = 'signup'; } }, 'เริ่มรีเซ็ตวันนี้'), h('span', { class: 'muted small' }, 'ใช้เวลาตั้งค่าไม่ถึง 2 นาที'), h('a', { class: 'link-btn', href: '#/guide', style: { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center' } }, 'ดูวิธีใช้งานก่อน'))
          ),
          h(
            'section',
            null,
            h('h2', { class: 'section-title' }, 'สี่เสาของวัน'),
            h(
              'div',
              { class: 'pillars' },
              pillar('sleep', 'นอน', 'ขยับเวลานอนทีละ 20 นาที ไม่ต้องกระโดดทั้งชั่วโมง'),
              pillar('meal', 'กิน', 'มื้อแรกนับจากเวลาตื่นจริง ไม่ใช่ 07:00 ตายตัว'),
              pillar('work', 'งาน', 'วันพลังงานต่ำ ทำงานย่อย 25 นาที ก็ถือว่าเริ่มแล้ว'),
              pillar('room', 'ห้อง', 'เก็บห้องเป็นช่วง 5–10 นาที ไม่ใช่โปรเจกต์ทั้งวัน')
            )
          ),
          footer()
        )
      );
    },
  };

  // ---------------------------------------------------------------- สมัคร / เข้าสู่ระบบ (สลับในหน้าเดียว)
  const authState = { mode: 'signup' };
  const authDraft = { name: '', email: '', consent: false };
  P.auth = {
    live: false,
    render(ctx) {
      const box = h('div', { class: 'auth stack' });
      const draw = () => {
        box.innerHTML = '';
        box.appendChild(authForm(ctx, draw));
      };
      draw();
      return box;
    },
  };

  function authForm(ctx, redraw) {
    const signup = authState.mode === 'signup';
    const errBox = h('div', { class: 'form-error', role: 'alert', hidden: true });
    const showErr = (msg) => {
      errBox.textContent = msg;
      errBox.hidden = !msg;
    };
    // เก็บค่าที่พิมพ์ไว้ (ยกเว้นรหัสผ่าน) เผื่อกดลิงก์นโยบายแล้วย้อนกลับ ฟอร์มจะไม่ว่างเปล่า
    const name = h('input', { class: 'input', type: 'text', autocomplete: 'nickname', maxlength: '40', placeholder: 'เช่น มะนาว', value: authDraft.name, onInput: (e) => { authDraft.name = e.target.value; } });
    const email = h('input', { class: 'input', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'you@example.com', value: authDraft.email, onInput: (e) => { authDraft.email = e.target.value; } });
    const pw = h('input', { class: 'input', type: 'password', autocomplete: signup ? 'new-password' : 'current-password', placeholder: signup ? 'อย่างน้อย 6 ตัว' : 'รหัสผ่าน' });
    const consent = h('input', { type: 'checkbox', id: 'consent', checked: authDraft.consent, onChange: (e) => { authDraft.consent = e.target.checked; } });
    const show = h('input', { type: 'checkbox', onChange: () => (pw.type = show.checked ? 'text' : 'password') });
    const submit = h('button', { class: 'btn primary big block', type: 'submit' }, signup ? 'สมัครและเริ่มตั้งค่า' : 'เข้าสู่ระบบ');

    const onSubmit = async (e) => {
      e.preventDefault();
      showErr('');
      submit.disabled = true;
      const old = submit.textContent;
      submit.textContent = 'รอสักครู่…';
      try {
        let r;
        if (signup) {
          if (!consent.checked) r = { ok: false, error: 'no_consent' };
          else r = await S.signup({ name: name.value, email: email.value, password: pw.value, consent: true });
        } else {
          r = await S.login({ email: email.value, password: pw.value });
        }
        if (r.ok) {
          Object.assign(authDraft, { name: '', email: '', consent: false });
          ctx.go(S.profile().onboarding_complete ? '/today' : '/onboarding');
          return;
        }
        const msgs = {
          invalid: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
          duplicate: 'อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบแทน',
          short_password: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว',
          no_consent: 'ต้องยอมรับก่อนจึงจะสมัครได้',
          bad_email: 'ตรวจอีเมลอีกครั้งนะ ดูเหมือนยังพิมพ์ไม่ครบ',
        };
        showErr(msgs[r.error] || 'เชื่อมต่อไม่ได้ ลองอีกครั้งในอีกสักครู่');
      } catch (err) {
        showErr('เชื่อมต่อไม่ได้ ลองอีกครั้งในอีกสักครู่');
      }
      submit.disabled = false;
      submit.textContent = old;
    };

    return h(
      'form',
      { class: 'stack', onSubmit, novalidate: true },
      h('h1', null, signup ? 'สมัครใช้ ReDay' : 'ยินดีต้อนรับกลับมา'),
      h('p', { class: 'muted small' }, 'เวอร์ชันนี้เก็บข้อมูลไว้ในเครื่องนี้เท่านั้น ไม่ส่งไปที่ไหน บัญชีจึงใช้ได้บนเบราว์เซอร์นี้'),
      errBox,
      signup ? field('ชื่อที่อยากให้เรียก', name) : null,
      field('อีเมล', email, signup ? { hint: 'ใช้เป็นชื่อบัญชีบนเครื่องนี้ ไม่มีการส่งอีเมล ตรวจให้ถูกต้องก่อนนะ' } : null),
      field('รหัสผ่าน', pw),
      h('label', { class: 'check' }, show, h('span', null, 'แสดงรหัสผ่าน')),
      !signup ? h('a', { class: 'link-btn', href: '#/auth/forgot', style: { alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center' } }, 'ลืมรหัสผ่าน') : null,
      signup
        ? h(
            'div',
            { class: 'card stack-sm' },
            h('h2', { style: { fontSize: '17px' } }, 'บัญชีและความเป็นส่วนตัว'),
            h(
              'label',
              { class: 'check' },
              consent,
              h(
                'span',
                null,
                'ฉันยินยอมให้ ReDay เก็บข้อมูลการนอน การกิน และพลังงานของฉัน เพื่อจัดแผนวันนี้ให้ฉันเท่านั้น ฉันอ่าน ',
                h('a', { href: '#/privacy' }, 'นโยบายความเป็นส่วนตัว'),
                ' แล้ว และถอนความยินยอมได้ทุกเมื่อในหน้า ฉัน'
              )
            ),
            h('p', { class: 'muted small' }, 'การใช้งานเป็นไปตาม ', h('a', { href: '#/terms' }, 'ข้อกำหนดการใช้งาน'))
          )
        : null,
      submit,
      h(
        'button',
        {
          class: 'btn ghost block',
          type: 'button',
          onClick: () => {
            authState.mode = signup ? 'login' : 'signup';
            redraw();
          },
        },
        signup ? 'มีบัญชีอยู่แล้ว เข้าสู่ระบบ' : 'ยังไม่มีบัญชี สมัครใหม่'
      )
    );
  }

  // ---------------------------------------------------------------- ลืมรหัสผ่าน
  let resetCtx = null; // { email, code } อยู่ในหน่วยความจำเท่านั้น

  function showNewRecoveryCode(code) {
    RD.ui.openSheet({
      title: 'รหัสกู้คืนใหม่ของคุณ',
      body: (ctl) =>
        h(
          'div',
          { class: 'stack' },
          h('p', null, 'รหัสกู้คืนใช้ได้ครั้งเดียว รหัสเดิมใช้ไม่ได้แล้ว จดหรือแคปหน้าจอรหัสใหม่นี้เก็บไว้ก่อนปิด ไม่แสดงซ้ำอีก (สร้างใหม่ได้ในหน้า ฉัน)'),
          h('div', { class: 'recovery', 'aria-label': 'รหัสกู้คืนใหม่ ' + code }, code),
          h('button', { class: 'btn secondary block', type: 'button', onClick: async () => { try { await navigator.clipboard.writeText(code); toast('คัดลอกรหัสแล้ว'); } catch (e) { toast('คัดลอกไม่ได้ ลองจดไว้แทนนะ'); } } }, 'คัดลอกรหัส'),
          h('button', { class: 'btn primary block', type: 'button', onClick: () => ctl.close(null) }, 'จดแล้ว ปิด')
        ),
    });
  }

  P.forgot = {
    live: false,
    render(ctx) {
      const msg = h('div', { class: 'form-error', role: 'status', hidden: true });
      const email = h('input', { class: 'input', type: 'email', autocomplete: 'email', inputmode: 'email' });
      const code = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'characters', placeholder: 'XXXX-XXXX-XXXX', maxlength: '16' });
      const btn = h('button', { class: 'btn primary big block', type: 'submit' }, 'ไปตั้งรหัสผ่านใหม่');
      return h(
        'form',
        {
          class: 'stack auth',
          novalidate: true,
          onSubmit: async (e) => {
            e.preventDefault();
            btn.disabled = true;
            const ok = await S.verifyRecovery(email.value, code.value);
            btn.disabled = false;
            if (!ok) {
              msg.textContent = 'ข้อมูลไม่ตรงกัน ลองตรวจอีเมลและรหัสกู้คืนอีกครั้งนะ';
              msg.hidden = false;
              return;
            }
            // อีเมลและรหัสกู้คืนเก็บในหน่วยความจำเท่านั้น (ไม่ลง storage) sessionStorage เก็บแค่ธงว่าผ่านขั้นตอนนี้แล้ว
            resetCtx = { email: email.value, code: code.value };
            sessionStorage.setItem('reday2.reset', '1');
            ctx.go('/auth/reset');
          },
        },
        h('h1', null, 'ลืมรหัสผ่าน'),
        h('p', { class: 'muted' }, 'เวอร์ชันนี้เก็บข้อมูลไว้ในเครื่องและไม่ส่งอีเมล จึงใช้ รหัสกู้คืน ที่แสดงตอนตั้งค่าเสร็จ (และดูหรือสร้างใหม่ได้ในหน้า ฉัน) แทนลิงก์ทางอีเมล'),
        msg,
        field('อีเมลที่ใช้สมัคร', email),
        field('รหัสกู้คืน', code),
        btn,
        h('p', { class: 'muted small' }, 'ไม่มีรหัสกู้คืนแล้ว? ข้อมูลของบัญชีนี้อยู่ในเครื่องนี้เท่านั้น จึงกู้ให้ไม่ได้ ถ้าเข้าอยู่แล้วในเครื่องอื่นหรือแท็บอื่น ให้สร้างรหัสใหม่ที่หน้า ฉัน หรือสมัครบัญชีใหม่ได้เสมอ')
      );
    },
  };

  P.reset = {
    live: false,
    render(ctx) {
      const saved = resetCtx;
      if (!saved) {
        // รีโหลดหน้านี้แล้วข้อมูลในหน่วยความจำหาย → เริ่มขั้นตอนใหม่ที่หน้าก่อนหน้า
        sessionStorage.removeItem('reday2.reset');
        setTimeout(() => ctx.go('/auth/forgot', { replace: true }), 0);
        return h('div');
      }
      const pw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', placeholder: 'อย่างน้อย 6 ตัว' });
      const msg = h('div', { class: 'form-error', role: 'alert', hidden: true });
      const btn = h('button', { class: 'btn primary big block', type: 'submit' }, 'ตั้งรหัสผ่านและเข้าสู่ระบบ');
      return h(
        'form',
        {
          class: 'stack auth',
          novalidate: true,
          onSubmit: async (e) => {
            e.preventDefault();
            btn.disabled = true;
            const r = await S.resetWithRecovery({ email: saved.email, code: saved.code, newPassword: pw.value });
            if (!r.ok) {
              btn.disabled = false;
              msg.textContent = r.error === 'short_password' ? 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว' : 'ลิงก์นี้หมดอายุแล้ว ลองเริ่มใหม่อีกครั้งนะ';
              msg.hidden = false;
              if (r.error !== 'short_password') {
                resetCtx = null;
                sessionStorage.removeItem('reday2.reset');
                setTimeout(() => ctx.go('/auth/forgot'), 1200);
              }
              return;
            }
            resetCtx = null;
            sessionStorage.removeItem('reday2.reset');
            const l = await S.login({ email: r.email, password: pw.value });
            toast('ตั้งรหัสผ่านใหม่แล้ว');
            ctx.go(l.ok ? (S.profile().onboarding_complete ? '/today' : '/onboarding') : '/auth');
            // รหัสกู้คืนใช้ได้ครั้งเดียว ออกรหัสใหม่ให้ทันที ต้องให้ผู้ใช้เห็นและจดก่อนปิด
            if (l.ok) showNewRecoveryCode(r.newCode);
          },
        },
        h('h1', null, 'ตั้งรหัสผ่านใหม่'),
        msg,
        field('รหัสผ่านใหม่', pw),
        btn
      );
    },
  };

  // ---------------------------------------------------------------- เอกสาร: นโยบายความเป็นส่วนตัว / ข้อกำหนด / ช่วยเหลือ
  P.privacy = {
    render() {
      const contact = C.contactEmail ? `อีเมล ${C.contactEmail}` : 'ปุ่ม ส่งความเห็น ในหน้า ฉัน';
      return h(
        'div',
        { class: 'doc' },
        h('span', { class: 'draft-tag' }, 'ฉบับร่าง · ต้องให้ผู้รู้กฎหมายตรวจก่อนเปิดสาธารณะ'),
        h('h1', null, 'นโยบายความเป็นส่วนตัว'),
        h('p', { class: 'muted' }, `เวอร์ชันความยินยอม ${C.consentVersion}`),
        h('h2', null, '1. ข้อมูลที่เก็บ'),
        h('ul', null,
          h('li', null, 'ชื่อที่อยากให้เรียก และอีเมล (ใช้ระบุบัญชีบนเครื่องนี้)'),
          h('li', null, 'ข้อมูลการนอน การกิน และพลังงาน เช่น เวลานอน เวลาตื่น เวลามื้อแรก ระดับพลังงานที่คุณเลือก ซึ่งอาจเข้าข่ายข้อมูลสุขภาพ จึงขอความยินยอมโดยชัดแจ้งตอนสมัคร'),
          h('li', null, 'งาน งานห้อง ค่าตั้งเวลาและการเตือน เหตุผลที่คุณเลือกเอง และความเห็นที่คุณส่ง'),
          h('li', null, 'ข้อมูลการใช้งานแบบเบา เป็นชื่อเหตุการณ์เท่านั้น (เช่น บันทึกเวลาตื่น) ไม่มีข้อความอิสระและไม่มีข้อมูลระบุตัวตน')),
        h('h2', null, '2. วัตถุประสงค์'),
        h('p', null, 'เพื่อจัดแผนวันนี้และสรุปให้คุณเท่านั้น ไม่ใช้เพื่อการโฆษณา ไม่ขายหรือแบ่งปันข้อมูลให้ผู้อื่น และไม่ใช้เพื่อวินิจฉัยทางการแพทย์'),
        h('h2', null, '3. ที่เก็บข้อมูลและผู้ประมวลผล'),
        h('p', null, 'เวอร์ชันนี้เก็บข้อมูลทั้งหมดไว้ในเบราว์เซอร์ของคุณเองบนเครื่องนี้ ไม่ส่งไปยังเซิร์ฟเวอร์ใด จึงยังไม่มีผู้ประมวลผลข้อมูลภายนอก ถ้าในอนาคตเปิดให้ซิงก์ข้อมูลออนไลน์ (เช่น ฐานข้อมูล Supabase และบริการส่งอีเมล) จะระบุผู้ประมวลผล ที่ตั้งของข้อมูล และขอความยินยอมใหม่ก่อน'),
        h('h2', null, '4. ระยะเวลาเก็บ'),
        h('p', null, 'เก็บไว้จนกว่าคุณจะลบข้อมูลหรือบัญชี หรือล้างข้อมูลเว็บไซต์ของเบราว์เซอร์'),
        h('h2', null, '5. การส่งข้อมูลไปต่างประเทศ'),
        h('p', null, 'แอปไม่ส่งข้อมูลที่คุณบันทึกไปต่างประเทศ แต่หน้าเว็บโหลดไฟล์ฟอนต์จาก Google Fonts ซึ่งทำให้เบราว์เซอร์ของคุณติดต่อเซิร์ฟเวอร์ของ Google (เห็นที่อยู่ IP) เมื่อเปิดแอป'),
        h('h2', null, '6. สิทธิของคุณ'),
        h('ul', null,
          h('li', null, 'เข้าถึง: ดูข้อมูลของคุณได้ทุกหน้าในแอป'),
          h('li', null, 'ส่งออก: ปุ่ม ส่งออกข้อมูล ในหน้า ฉัน ได้ไฟล์ JSON ของข้อมูลทั้งหมด'),
          h('li', null, 'ลบ: ลบข้อมูลทั้งหมด (คงบัญชี) หรือลบบัญชี ในหน้า ฉัน ข้อมูลหายทันที'),
          h('li', null, 'ถอนความยินยอม: ทำได้ทุกเมื่อในหน้า ฉัน มีผลเท่ากับลบบัญชี')),
        h('h2', null, '7. ผู้ใช้อายุต่ำกว่า 18 ปี'),
        h('p', null, 'นโยบายสำหรับผู้ใช้อายุต่ำกว่า 18 ปีอยู่ระหว่างให้ผู้รู้กฎหมายพิจารณา'),
        h('h2', null, '8. ช่องทางติดต่อ'),
        h('p', null, `ติดต่อเรื่องข้อมูลส่วนบุคคลได้ที่ ${contact}`),
        h('h2', null, 'ข้อควรรู้'),
        h('p', null, 'ข้อมูลในแอปไม่ใช่คำแนะนำทางการแพทย์')
      );
    },
  };

  P.terms = {
    render() {
      return h(
        'div',
        { class: 'doc' },
        h('span', { class: 'draft-tag' }, 'ฉบับร่าง'),
        h('h1', null, 'ข้อกำหนดการใช้งาน'),
        h('h2', null, '1. สิ่งที่ ReDay เป็น'),
        h('p', null, 'ReDay เป็นเครื่องมือช่วยตั้งกรอบวันที่อ่อนโยนจากเวลาตื่นจริงของคุณ ครอบคลุมสี่เรื่อง คือ นอน กิน งาน และห้อง ข้อเสนอทั้งหมดเป็นเพียงข้อเสนอ คุณเปลี่ยน เลื่อน ข้าม หรือปิดได้เสมอ'),
        h('h2', null, '2. ไม่ใช่คำแนะนำทางการแพทย์'),
        h('p', null, 'ข้อมูลและข้อความในแอปไม่ใช่การวินิจฉัยหรือคำแนะนำทางการแพทย์ ถ้ารู้สึกไม่ไหวหรือกังวลเรื่องการกินหรือการนอน ลองคุยกับคนใกล้ตัวหรือผู้เชี่ยวชาญ ดูช่องทางที่หน้า ช่วยเหลือ'),
        h('h2', null, '3. ข้อมูลของคุณ'),
        h('p', null, 'ข้อมูลเป็นของคุณ คุณเพิ่ม แก้ ลบ ส่งออกได้ทุกเมื่อ รายละเอียดอยู่ในนโยบายความเป็นส่วนตัว'),
        h('h2', null, '4. การใช้งาน'),
        h('ul', null, h('li', null, 'ดูแลรหัสผ่านและรหัสกู้คืนของคุณเอง เพราะข้อมูลอยู่ในเครื่องนี้ ถ้าล้างข้อมูลเบราว์เซอร์ข้อมูลอาจหายไป แนะนำให้ส่งออกข้อมูลสำรองไว้เป็นระยะ'), h('li', null, 'ไม่ใช้แอปในทางที่ละเมิดสิทธิของผู้อื่น')),
        h('h2', null, '5. การเปลี่ยนแปลง'),
        h('p', null, 'ถ้าเนื้อหาเปลี่ยน จะขอความยินยอมใหม่ก่อนใช้งานต่อ')
      );
    },
  };

  P.help = {
    render() {
      const qa = (q, a) => h('details', { class: 'fold', style: { marginBottom: '8px' } }, h('summary', null, q), h('p', { style: { paddingBottom: '14px' } }, a));
      return h(
        'div',
        { class: 'doc' },
        h('h1', null, 'ช่วยเหลือ'),
        h('p', { class: 'muted' }, 'ข้อมูลในแอปไม่ใช่คำแนะนำทางการแพทย์'),
        h('a', { class: 'card', href: '#/guide', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', color: 'inherit', textDecoration: 'none', marginTop: '12px' } }, h('div', null, h('b', null, 'คู่มือการใช้งาน'), h('div', { class: 'muted small' }, 'วิธีใช้แต่ละฟีเจอร์ พร้อมวิธีแก้เมื่อติดขัด')), icon('chevron', 18)),
        h('h2', null, 'ถ้าช่วงนี้รู้สึกเหนื่อยหรือไม่ไหว'),
        h('p', null, 'ลองคุยกับเพื่อนหรือคนใกล้ตัว หรือปรึกษาผู้เชี่ยวชาญก็ได้ ไม่ต้องรอให้หนักก่อน'),
        h('a', { class: 'hotline', href: 'tel:1323', style: { color: 'inherit', textDecoration: 'none', marginTop: '10px' } }, icon('heart', 28), h('div', null, h('b', null, '1323'), h('div', { class: 'muted small' }, 'สายด่วนสุขภาพจิต กรมสุขภาพจิต'))),
        h('h2', null, 'คำถามที่พบบ่อย'),
        qa('ReDay ช่วยอะไรได้บ้าง', 'ช่วยตั้งกรอบวันจากเวลาตื่นจริง ใน 4 เรื่อง คือ นอน กิน งาน และห้อง โดยเสนอขั้นถัดไปที่เล็กลงเสมอ ไม่ใช่แอปรายการสิ่งที่ต้องทำ แอปติดตามนิสัย แอปนับแคลอรี่ หรือแอปฟิตเนส'),
        qa('ปุ่ม รีเซ็ตตอนนี้ คืออะไร', 'เมื่อแผนเช้าพังไปแล้ว ปุ่มนี้สร้างมุมมองใหม่จากเวลาปัจจุบัน เหลือไม่เกิน 3 อย่าง โดยไม่แก้ข้อมูลที่คุณบันทึกไว้'),
        qa('ไม่อยากให้แอปยุ่งเรื่องมื้ออาหาร', 'ปิดได้ในหน้า ฉัน ที่สวิตช์ ติดตามเรื่องมื้ออาหาร เมื่อปิด ระบบจะไม่คำนวณมื้อ ไม่เตือน ไม่ใส่ในสรุป และเดาพลังงานจากเวลาตื่นอย่างเดียว ไม่ต้องบอกเหตุผล'),
        qa('วันนี้ไม่ไหวเลย ทำยังไง', 'เปิดเมนู … ที่หน้า วันนี้ แล้วเลือก วันนี้ขอเบา ๆ จะเหลือแค่สิ่งที่จำเป็นและปิดการเตือนทั้งหมด'),
        qa('ลืมกดบันทึกเวลาตื่น', 'ไม่เป็นไร กด ตื่นแล้ว แล้วแก้เวลาเป็นเวลาจริงก่อนบันทึกได้ หรือแก้ย้อนหลังที่หน้า สรุป > ดูย้อนหลัง'),
        qa('ข้อมูลของฉันอยู่ที่ไหน', 'ในเบราว์เซอร์ของเครื่องนี้เท่านั้น ส่งออกเป็นไฟล์สำรองหรือลบได้ที่หน้า ฉัน ดูรายละเอียดที่นโยบายความเป็นส่วนตัว')
      );
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
