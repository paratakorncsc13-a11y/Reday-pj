/* ReDay v2 — ชั้น Supabase (โหมดออนไลน์)
 *
 * ทำสามอย่าง: (1) บัญชี Supabase Auth (2) โหลดข้อมูลทั้งหมดของผู้ใช้เข้าหน่วยความจำตอนเข้าสู่ระบบ
 * (3) ซิงก์ขึ้นฐานข้อมูลเบื้องหลังหลังทุกการบันทึก (ส่งเฉพาะแถวที่เปลี่ยน) store.js ยังทำงานแบบเดิม (ในหน่วยความจำ + cache ใน localStorage)
 * หน้าจอจึงไม่รู้ว่าข้อมูลอยู่ที่ไหน ไม่มีโค้ดหน้าจอที่ต้องรอผลจากเครือข่าย
 *
 * ปิดโหมดนี้ได้ด้วย ?local=1 และปิดอัตโนมัติเมื่อมี ?ns= (ชุดทดสอบ) หรือไม่มีไลบรารี supabase-js
 */
(function (g) {
  const RD = (g.RD = g.RD || {});
  const cfg = RD.config && RD.config.supabase;
  const search = (g.location && g.location.search) || '';
  if (!cfg || /[?&](ns|local)=/.test(search) || !g.supabase || !g.supabase.createClient) {
    RD.remote = { enabled: false };
    return;
  }

  const client = g.supabase.createClient(cfg.url, cfg.publishableKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // ---------------------------------------------------------------- บัญชี
  function mapAuthError(err) {
    if (!err) return null;
    const code = err.code || '';
    const msg = String(err.message || '').toLowerCase();
    if (code === 'user_already_exists' || /already registered|already been registered/.test(msg)) return 'duplicate';
    if (code === 'invalid_credentials' || /invalid login/.test(msg)) return 'invalid';
    if (code === 'weak_password') return 'short_password';
    if (code === 'email_address_invalid' || code === 'validation_failed') return 'bad_email';
    if (code === 'same_password') return 'same_password';
    if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || err.status === 429) return 'rate_limit';
    if (code === 'email_not_confirmed') return 'confirm_email';
    if (err.name === 'AuthRetryableFetchError' || /failed to fetch|network|load failed/.test(msg)) return 'network';
    return 'unknown';
  }
  const fail = (err) => ({ ok: false, error: mapAuthError(err), detail: err && err.message });

  async function getUser() {
    const { data } = await client.auth.getSession();
    return data && data.session ? data.session.user : null;
  }
  async function signUp({ email, password, name, consentVersion }) {
    const { data, error } = await client.auth.signUp({ email, password, options: { data: { display_name: name, consent_version: consentVersion } } });
    if (error) return fail(error);
    // ถ้าเปิดยืนยันอีเมลอยู่: อีเมลซ้ำจะไม่ error แต่ identities ว่าง; สมัครใหม่สำเร็จแต่ยังไม่มี session
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return { ok: false, error: 'duplicate' };
    if (!data.session) return { ok: false, error: 'confirm_email' };
    return { ok: true, user: data.user };
  }
  async function signIn(email, password) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return fail(error);
    return { ok: true, user: data.user };
  }
  async function signOut() {
    try {
      await client.auth.signOut({ scope: 'local' });
    } catch (e) { /* ออกจากระบบฝั่งเครื่องเสมอ */ }
  }
  async function sendReset(email, redirectTo) {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
    return error ? fail(error) : { ok: true };
  }
  async function updatePassword(password) {
    const { error } = await client.auth.updateUser({ password });
    return error ? fail(error) : { ok: true };
  }
  /** ลบบัญชีและข้อมูลทั้งหมด (ฟังก์ชัน delete_my_account ในฐานข้อมูล ลบ auth.users แล้ว cascade) */
  async function deleteAccount() {
    const { error } = await client.rpc('delete_my_account');
    await signOut();
    return error ? fail(error) : { ok: true };
  }
  function onAuth(cb) {
    // เรียก callback นอก stack ของ supabase-js (กัน deadlock เมื่อ callback เรียกใช้ client ต่อ)
    client.auth.onAuthStateChange((event, session) => setTimeout(() => cb(event, session), 0));
  }

  // ---------------------------------------------------------------- ตารางและคอลัมน์ที่ซิงก์ (ตรงกับ supabase/migrations)
  const COLS = {
    profile: ['display_name', 'usual_bedtime', 'target_bedtime', 'target_wake', 'meal_delay_minutes', 'quiet_start', 'quiet_end', 'notify_meal', 'notify_winddown', 'notify_room', 'track_meals', 'day_cutoff', 'onboarding_complete', 'consent_version', 'consent_at', 'care_card_shown_on', 'care_card_dismissed_on', 'last_rollover'],
    tasks: ['id', 'title', 'minutes', 'energy_needed', 'is_micro', 'status', 'due_date', 'postponed_until', 'postponed_count', 'started_at', 'completed_at', 'micro_done_date', 'micro_session', 'last_shown_date', 'is_sample', 'created_at'],
    chores: ['id', 'title', 'minutes', 'is_sample', 'archived_at', 'created_at'],
    chore_completions: ['chore_id', 'log_date', 'started_at', 'completed_at', 'minutes_spent', 'planned_minutes', 'partial', 'skipped'],
    daily_logs: ['log_date', 'woke_at', 'first_meal_at', 'meal_status', 'bedtime_at', 'energy_override', 'day_mode', 'slipped_reasons', 'reasons_edited', 'swapped', 'skipped_task', 'notes', 'updated_at'],
    reminder_state: ['log_date', 'kind', 'fired_at', 'dismissed_at'],
    consents: ['id', 'version', 'accepted_at', 'withdrawn_at'],
    events: ['id', 'name', 'props', 'at'],
    feedback: ['id', 'page', 'message', 'created_at'],
  };
  // คอลัมน์เวลาที่ต้องแปลงเป็นรูปแบบ ISO ...Z เหมือนที่แอปสร้างเอง (ฐานข้อมูลคืน +00:00)
  const TS = {
    profile: ['consent_at', 'created_at'],
    tasks: ['started_at', 'completed_at', 'created_at'],
    chores: ['archived_at', 'created_at'],
    chore_completions: ['started_at', 'completed_at'],
    daily_logs: ['woke_at', 'first_meal_at', 'bedtime_at', 'updated_at'],
    reminder_state: ['fired_at', 'dismissed_at'],
    consents: ['accepted_at', 'withdrawn_at'],
  };
  const KEYS = { tasks: ['id'], chores: ['id'], chore_completions: ['chore_id', 'log_date'], daily_logs: ['log_date'], reminder_state: ['log_date', 'kind'], consents: ['id'], events: ['id'], feedback: ['id'] };
  const ORDER = ['tasks', 'chores', 'daily_logs', 'chore_completions', 'reminder_state', 'consents', 'events', 'feedback']; // chores ก่อน chore_completions (FK)
  const APPEND_ONLY = new Set(['events', 'feedback']); // ไม่โหลดกลับมา และไม่ลบฝั่งเซิร์ฟเวอร์เมื่อ cache ในเครื่องตัดทิ้ง
  const LOADED = ORDER.filter((t) => !APPEND_ONLY.has(t));
  const CONFLICT = { tasks: 'id', chores: 'id', consents: 'id', events: 'id', feedback: 'id', chore_completions: 'user_id,chore_id,log_date', daily_logs: 'user_id,log_date', reminder_state: 'user_id,log_date,kind' };

  const normTs = (table, row) => {
    for (const c of TS[table] || []) if (row[c]) row[c] = new Date(row[c]).toISOString();
    return row;
  };

  /** โหลดข้อมูลทั้งหมดของผู้ใช้ → รูปแบบเดียวกับ db ใน store.js */
  async function loadAll(userId) {
    const [p, ...rest] = await Promise.all([
      client.from('profiles').select('*').eq('id', userId).maybeSingle(),
      ...LOADED.map((t) => client.from(t).select('*').limit(5000)),
    ]);
    if (p.error) throw p.error;
    if (!p.data) throw Object.assign(new Error('ไม่พบโปรไฟล์'), { code: 'no_profile' });
    const db = { profile: normTs('profile', p.data), events: [], feedback: [] };
    rest.forEach((r, i) => {
      if (r.error) throw r.error;
      db[LOADED[i]] = r.data.map((row) => normTs(LOADED[i], row));
    });
    return db;
  }

  // ---------------------------------------------------------------- ซิงก์ขึ้นฐานข้อมูล
  const keyOf = (t, row) => KEYS[t].map((k) => row[k]).join('|');
  const pick = (table, row) => {
    const o = {};
    for (const c of COLS[table]) if (row[c] !== undefined) o[c] = row[c];
    return o;
  };
  // ข้อผิดพลาดที่เกิดจากข้อมูลของแถวนั้นเอง (ไม่ใช่เครือข่าย): ข้ามแถวนั้นเพื่อไม่ให้ซิงก์ค้างทั้งชุด
  const rowError = (e) => e && typeof e.code === 'string' && /^(22|23|42|PGRST1)/.test(e.code);

  /**
   * สร้างตัวซิงก์ของผู้ใช้หนึ่งคน
   * @param {string} userId
   * @param {() => object} getDb คืน db ปัจจุบันใน store.js
   * @param {(status: 'ok'|'error', err?: any) => void} onStatus
   */
  function createSyncer(userId, getDb, onStatus) {
    let snap = {}; // table -> Map(key -> json)
    let profileSnap = '';
    let running = false;
    let again = false;
    let timer = null;
    let retry = 0;
    let stopped = false;

    const rebase = (db) => {
      snap = {};
      for (const t of ORDER) snap[t] = new Map((db[t] || []).map((r) => [keyOf(t, r), JSON.stringify(pick(t, r))]));
      profileSnap = JSON.stringify(pick('profile', db.profile));
    };

    async function upsertRows(t, rows) {
      if (!rows.length) return;
      const payload = rows.map((o) => Object.assign({ user_id: userId }, o));
      const { error } = await client.from(t).upsert(payload, { onConflict: CONFLICT[t] });
      if (!error) return;
      if (!rowError(error)) throw error;
      // แถวใดแถวหนึ่งผิดเงื่อนไข: ลองทีละแถว แถวที่ผิดจริงถูกข้าม (บันทึก console) แถวอื่นยังไปต่อได้
      for (const row of payload) {
        const r = await client.from(t).upsert(row, { onConflict: CONFLICT[t] });
        if (r.error) {
          if (!rowError(r.error)) throw r.error;
          console.error('ซิงก์ข้ามแถวที่ผิดเงื่อนไข', t, r.error.message);
        }
      }
    }
    async function deleteKeys(t, keys) {
      for (const k of keys) {
        const vals = k.split('|');
        let q = client.from(t).delete();
        KEYS[t].forEach((col, i) => (q = q.eq(col, vals[i])));
        const { error } = await q;
        if (error && !rowError(error)) throw error;
      }
    }

    async function flushOnce() {
      const db = getDb();
      if (!db || stopped) return;
      const cur = {};
      for (const t of ORDER) {
        cur[t] = new Map();
        for (const r of db[t] || []) cur[t].set(keyOf(t, r), pick(t, r));
      }
      const prof = pick('profile', db.profile);
      const profJson = JSON.stringify(prof);

      if (profJson !== profileSnap) {
        const { error } = await client.from('profiles').update(prof).eq('id', userId);
        if (error && !rowError(error)) throw error;
        profileSnap = profJson;
      }
      for (const t of ORDER) {
        const ups = [];
        for (const [k, o] of cur[t]) if (snap[t].get(k) !== JSON.stringify(o)) ups.push([k, o]);
        await upsertRows(t, ups.map((x) => x[1]));
        ups.forEach(([k, o]) => snap[t].set(k, JSON.stringify(o)));
      }
      for (const t of [...ORDER].reverse()) {
        if (APPEND_ONLY.has(t)) continue;
        const gone = [...snap[t].keys()].filter((k) => !cur[t].has(k));
        await deleteKeys(t, gone);
        gone.forEach((k) => snap[t].delete(k));
      }
    }

    async function run() {
      timer = null;
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        await flushOnce();
        retry = 0;
        if (!again) onStatus('ok');
      } catch (e) {
        retry = Math.min(30000, (retry || 2000) * 2);
        onStatus('error', e);
        clearTimeout(timer);
        timer = setTimeout(run, retry);
      } finally {
        running = false;
        if (again) {
          again = false;
          schedule(50);
        }
      }
    }
    function schedule(ms) {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(run, ms == null ? 300 : ms);
    }
    /** ลบ events/feedback ฝั่งเซิร์ฟเวอร์ (ใช้ตอน "ลบข้อมูลทั้งหมด") */
    async function wipeAppendOnly() {
      for (const t of ['events', 'feedback']) {
        const { error } = await client.from(t).delete().eq('user_id', userId);
        if (error) throw error;
        snap[t] = new Map();
      }
    }
    return {
      rebase,
      schedule,
      useDb(fn) {
        getDb = fn; // ตอนออกจากระบบ: ชี้ไปที่ข้อมูลของผู้ใช้เดิมเพื่อส่งส่วนที่ค้างให้จบก่อนทิ้ง
      },
      wipeAppendOnly,
      isBusy: () => running || !!timer,
      stop() {
        stopped = true;
        clearTimeout(timer);
      },
    };
  }

  RD.remote = { enabled: true, client, getUser, signUp, signIn, signOut, sendReset, updatePassword, deleteAccount, onAuth, loadAll, createSyncer, mapAuthError };
})(typeof globalThis !== 'undefined' ? globalThis : this);
