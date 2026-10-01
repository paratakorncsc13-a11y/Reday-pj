/* ReDay v2 — ชั้นข้อมูล (src/data)
 *
 * เวอร์ชันนี้เก็บข้อมูลไว้ในเครื่องผู้ใช้ (localStorage) โดยใช้โครงตารางเดียวกับสเปก
 * (profiles, tasks, chores, chore_completions, daily_logs, reminder_state, consents, events, feedback)
 * เพื่อให้สลับไปใช้ Supabase ได้โดยแก้เฉพาะไฟล์นี้ — หน้าจอเรียกผ่าน RD.store เท่านั้น
 *
 * หลักสำคัญ: ค่าว่าง ≠ ข้าม (meal_status: unknown / logged / skipped), ผู้ใช้เพิ่ม แก้ ลบได้ทุกอย่าง
 */
(function (g) {
  const RD = (g.RD = g.RD || {});
  const T = RD.time;
  const C = RD.config;

  // ---------- storage ----------
  const mem = {};
  const PREFIX = C.storagePrefix || 'reday2';
  const KEY_ACCOUNTS = `${PREFIX}.accounts`;
  const KEY_SESSION = `${PREFIX}.session`;
  const keyData = (id) => `${PREFIX}.u.${id}`;
  const ls = {
    get(k, fallback) {
      try {
        const v = g.localStorage.getItem(k);
        return v == null ? (k in mem ? JSON.parse(mem[k]) : fallback) : JSON.parse(v);
      } catch (e) {
        return k in mem ? JSON.parse(mem[k]) : fallback;
      }
    },
    set(k, v) {
      const s = JSON.stringify(v);
      try {
        g.localStorage.setItem(k, s);
        delete mem[k];
        return true;
      } catch (e) {
        mem[k] = s; // เก็บในหน่วยความจำแทน (เช่น โหมดส่วนตัวที่ปิด storage)
        return false;
      }
    },
    del(k) {
      try {
        g.localStorage.removeItem(k);
      } catch (e) { /* ignore */ }
      delete mem[k];
    },
  };

  const now = () => T.clock.now();
  const iso = () => now().toISOString();
  function uid() {
    if (g.crypto && g.crypto.randomUUID) return g.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // ---------- state ----------
  const loadAccounts = () => {
    const a = ls.get(KEY_ACCOUNTS, []);
    return Array.isArray(a) ? a.filter((x) => x && x.id && x.email) : [];
  };
  let accounts = loadAccounts();
  let sessionId = ls.get(KEY_SESSION, null);
  let db = null;
  let persistOk = true;
  const listeners = new Set();
  let pendingRecovery = null;

  function emit(what) {
    listeners.forEach((fn) => {
      try {
        fn(what);
      } catch (e) {
        console.error(e);
      }
    });
  }
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function persist(silent) {
    if (db && sessionId) persistOk = ls.set(keyData(sessionId), db);
    if (!silent) emit('data');
  }

  function emptyProfile(id, name) {
    return Object.assign({}, C.defaultProfile, {
      id,
      display_name: name || '',
      onboarding_complete: false,
      consent_version: C.consentVersion,
      consent_at: iso(),
      created_at: iso(),
      care_card_shown_on: null,
      care_card_dismissed_on: null,
      last_rollover: null,
    });
  }
  function emptyDb(id, name) {
    return {
      profile: emptyProfile(id, name),
      tasks: [],
      chores: [],
      chore_completions: [],
      daily_logs: [],
      reminder_state: [],
      consents: [{ id: uid(), user_id: id, version: C.consentVersion, accepted_at: iso(), withdrawn_at: null }],
      events: [],
      feedback: [],
    };
  }
  const TABLES = ['tasks', 'chores', 'chore_completions', 'daily_logs', 'reminder_state', 'consents', 'events', 'feedback'];
  /** ตรวจและเติมโครงสร้างของข้อมูลที่อ่านจาก storage (JSON ถูกต้องแต่โครงสร้างผิดต้องไม่ทำให้แอปพัง) */
  function normalizeDb(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.profile || typeof raw.profile !== 'object') return null;
    for (const k of TABLES) raw[k] = Array.isArray(raw[k]) ? raw[k].filter((x) => x && typeof x === 'object') : [];
    raw.profile = Object.assign({}, C.defaultProfile, raw.profile);
    return raw;
  }
  let recoveredNotice = false;
  /** อ่านข้อมูลของผู้ใช้ ถ้าเสียหายให้เก็บสำเนาไว้ที่ <key>.corrupt แล้วคืน null */
  function readDb(id) {
    const key = keyData(id);
    let s = null;
    try {
      s = g.localStorage.getItem(key);
    } catch (e) { /* ignore */ }
    if (s == null) return key in mem ? normalizeDb(JSON.parse(mem[key])) : null;
    try {
      const d = normalizeDb(JSON.parse(s));
      if (d) return d;
    } catch (e) { /* ข้อมูลเสียหาย */ }
    ls.set(`${key}.corrupt`, s);
    recoveredNotice = true;
    return null;
  }
  /** เปิดแอปครั้งแรก/โหลดซ้ำ: คืน session เดิมถ้าบัญชียังอยู่ ข้อมูลหายหรือเสียหายให้เริ่มชุดว่างแทนการล็อกอินไม่ติด */
  function loadSession() {
    const acc = sessionId ? accounts.find((a) => a.id === sessionId) : null;
    if (!acc) {
      sessionId = null;
      db = null;
      if (ls.get(KEY_SESSION, null)) ls.del(KEY_SESSION);
      return;
    }
    db = readDb(acc.id);
    if (!db) {
      db = emptyDb(acc.id, acc.name);
      persistOk = ls.set(keyData(acc.id), db);
    }
  }
  loadSession();

  // เปิดหลายแท็บ: เมื่อแท็บอื่นเขียนข้อมูล ให้โหลดของใหม่เข้ามา ไม่ใช่เขียนทับด้วยข้อมูลเก่าในหน่วยความจำ
  function syncFromStorage() {
    accounts = loadAccounts();
    sessionId = ls.get(KEY_SESSION, null);
    loadSession();
    emit('external');
  }
  if (g.addEventListener) {
    g.addEventListener('storage', (e) => {
      if (e.storageArea && e.storageArea !== g.localStorage) return;
      if (e.key === null) return syncFromStorage(); // ล้างทั้งหมดจากแท็บอื่น
      if (e.key === KEY_ACCOUNTS || e.key === KEY_SESSION) return syncFromStorage();
      if (sessionId && e.key === keyData(sessionId)) {
        const d = readDb(sessionId);
        if (d) {
          db = d;
          emit('external');
        }
      }
    });
  }

  // ---------- รหัสผ่าน (PBKDF2 ผ่าน WebCrypto) ----------
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  function randomBytes(n) {
    const a = new Uint8Array(n);
    (g.crypto || {}).getRandomValues ? g.crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = Math.floor(Math.random() * 256)));
    return a;
  }
  async function hashSecret(secret, saltB64) {
    const salt = saltB64 ? unb64(saltB64) : randomBytes(16);
    const saltOut = b64(salt);
    if (g.crypto && g.crypto.subtle) {
      const key = await g.crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
      const bits = await g.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' }, key, 256);
      return { salt: saltOut, hash: b64(bits) };
    }
    // สำรองกรณีไม่มี WebCrypto (ไม่ปลอดภัยเท่า) — แอปนี้เก็บบนเครื่องผู้ใช้เท่านั้น
    let h = 5381;
    const s = saltOut + secret;
    for (let r = 0; r < 2000; r++) for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return { salt: saltOut, hash: 'weak:' + h.toString(36) };
  }
  async function verifySecret(secret, rec) {
    // ค่าว่างไม่มีทางตรงกับรหัสที่เก็บไว้ และ WebKit (Safari) ปฏิเสธการสร้างกุญแจ PBKDF2 จากข้อความว่าง
    if (!rec || !rec.hash || !secret) return false;
    try {
      const r = await hashSecret(secret, rec.salt);
      return r.hash === rec.hash;
    } catch (e) {
      return false;
    }
  }
  function makeRecoveryCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(12);
    let s = '';
    for (let i = 0; i < 12; i++) s += alphabet[bytes[i] % alphabet.length];
    return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
  }
  const normEmail = (e) => String(e || '').trim().toLowerCase();
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  // ---------- บัญชี ----------
  async function signup({ name, email, password, consent }) {
    const e = normEmail(email);
    if (!validEmail(e)) return { ok: false, error: 'bad_email' };
    if (!password || password.length < 6) return { ok: false, error: 'short_password' };
    if (!consent) return { ok: false, error: 'no_consent' };
    if (accounts.some((a) => a.email === e)) return { ok: false, error: 'duplicate' };
    const id = uid();
    const pw = await hashSecret(password);
    const code = makeRecoveryCode();
    const rec = await hashSecret(normCode(code));
    accounts.push({ id, email: e, name: String(name || '').trim(), pw, rec, created_at: iso() });
    ls.set(KEY_ACCOUNTS, accounts);
    sessionId = id;
    ls.set(KEY_SESSION, id);
    db = emptyDb(id, String(name || '').trim());
    persist(true);
    pendingRecovery = code;
    track('signup_completed');
    emit('session');
    return { ok: true };
  }

  async function login({ email, password }) {
    const e = normEmail(email);
    const acc = accounts.find((a) => a.email === e);
    if (!acc || !(await verifySecret(password || '', acc.pw))) return { ok: false, error: 'invalid' };
    sessionId = acc.id;
    ls.set(KEY_SESSION, acc.id);
    loadSession(); // ข้อมูลหาย/เสียหาย → เริ่มชุดว่าง (เก็บสำเนาที่เสียไว้) ไม่ใช่ล็อกอินไม่ติด
    emit('session');
    return { ok: true };
  }
  /** true ครั้งเดียวหลังพบว่าข้อมูลเดิมอ่านไม่ได้และเริ่มชุดใหม่ให้ (ให้ UI แจ้งผู้ใช้) */
  function takeRecoveredNotice() {
    const r = recoveredNotice;
    recoveredNotice = false;
    return r;
  }

  function logout() {
    sessionId = null;
    db = null;
    ls.del(KEY_SESSION);
    emit('session');
  }

  /** เปลี่ยนรหัสผ่านขณะล็อกอิน ต้องยืนยันรหัสผ่านเดิมก่อน (กันคนที่หยิบเครื่องที่ล็อกอินค้างไว้) */
  async function changePassword({ current, next }) {
    if (!sessionId) return { ok: false, error: 'no_session' };
    const acc = accounts.find((a) => a.id === sessionId);
    if (!acc || !(await verifySecret(current || '', acc.pw))) return { ok: false, error: 'wrong_current' };
    if (!next || next.length < 6) return { ok: false, error: 'short_password' };
    acc.pw = await hashSecret(next);
    ls.set(KEY_ACCOUNTS, accounts);
    return { ok: true };
  }

  /**
   * ตั้งรหัสผ่านใหม่ด้วยรหัสกู้คืน (ใช้แทนลิงก์อีเมล เพราะเวอร์ชันนี้ไม่มีการส่งอีเมล)
   * รหัสกู้คืนใช้ได้ครั้งเดียว: ใช้แล้วออกรหัสใหม่ให้ทันที (newCode) เพื่อให้ผู้ใช้จดเก็บ
   */
  async function resetWithRecovery({ email, code, newPassword }) {
    const acc = accounts.find((a) => a.email === normEmail(email));
    if (!acc || !(await verifySecret(normCode(code), acc.rec))) return { ok: false, error: 'invalid' };
    if (!newPassword || newPassword.length < 6) return { ok: false, error: 'short_password' };
    const newCode = makeRecoveryCode();
    acc.pw = await hashSecret(newPassword);
    acc.rec = await hashSecret(normCode(newCode));
    ls.set(KEY_ACCOUNTS, accounts);
    return { ok: true, email: acc.email, newCode };
  }

  async function verifyRecovery(email, code) {
    const acc = accounts.find((a) => a.email === normEmail(email));
    return !!acc && (await verifySecret(normCode(code), acc.rec));
  }

  /** สร้างและบันทึกรหัสกู้คืนใหม่ทันที (รหัสเดิมใช้ไม่ได้อีก) */
  async function newRecoveryCode() {
    const code = makeRecoveryCode();
    return (await commitRecoveryCode(code)) ? code : null;
  }
  /** สร้างรหัสไว้แสดงก่อน แต่ยังไม่แทนรหัสเดิมจนกว่าจะ commitRecoveryCode (กันกรณีปิดหน้าต่างโดยยังไม่ได้จด) */
  const draftRecoveryCode = () => makeRecoveryCode();
  async function commitRecoveryCode(code) {
    if (!sessionId) return false;
    const acc = accounts.find((a) => a.id === sessionId);
    if (!acc) return false;
    acc.rec = await hashSecret(normCode(code));
    ls.set(KEY_ACCOUNTS, accounts);
    return true;
  }
  function takePendingRecovery() {
    const c = pendingRecovery;
    return c;
  }
  function clearPendingRecovery() {
    pendingRecovery = null;
  }

  // ---------- ความยินยอม: ถ้าเนื้อหาเปลี่ยน (consentVersion) ต้องขอใหม่ ----------
  const needsConsent = () => !!db && db.profile.consent_version !== C.consentVersion;
  function acceptConsent() {
    const t = iso();
    db.consents.forEach((c) => {
      if (!c.withdrawn_at && c.version !== C.consentVersion) c.superseded_at = t;
    });
    db.consents.push({ id: uid(), user_id: sessionId, version: C.consentVersion, accepted_at: t, withdrawn_at: null });
    db.profile.consent_version = C.consentVersion;
    db.profile.consent_at = t;
    persist();
  }

  function accountInfo() {
    const acc = accounts.find((a) => a.id === sessionId);
    return acc ? { id: acc.id, email: acc.email, created_at: acc.created_at } : null;
  }

  function exportData() {
    const acc = accountInfo();
    return {
      exported_at: iso(),
      app: 'ReDay',
      version: C.version,
      account: acc ? { email: acc.email, created_at: acc.created_at } : null,
      profile: db.profile,
      tasks: db.tasks,
      chores: db.chores,
      chore_completions: db.chore_completions,
      daily_logs: db.daily_logs,
      reminder_state: db.reminder_state,
      consents: db.consents,
      events: db.events,
      feedback: db.feedback,
    };
  }

  /** ลบข้อมูลทั้งหมด คงบัญชี (กลับไปตั้งค่าใหม่) */
  function wipeData() {
    const keep = { consent_version: db.profile.consent_version, consent_at: db.profile.consent_at };
    const consents = db.consents;
    const acc = accounts.find((a) => a.id === sessionId);
    db = emptyDb(sessionId, db.profile.display_name || (acc && acc.name) || '');
    Object.assign(db.profile, keep);
    db.consents = consents;
    persist();
  }

  /** ลบบัญชี: ข้อมูลทุกตารางหายทันที */
  function deleteAccount() {
    const id = sessionId;
    accounts = accounts.filter((a) => a.id !== id);
    ls.set(KEY_ACCOUNTS, accounts);
    ls.del(keyData(id));
    logout();
  }

  // ---------- profile ----------
  const profile = () => db.profile;
  function updateProfile(patch) {
    Object.assign(db.profile, patch);
    persist();
    return db.profile;
  }

  // ---------- daily_logs ----------
  const cutoff = () => T.parseHM(db.profile.day_cutoff || C.dayCutoff);
  const todayLogDate = () => T.logDateOf(now(), cutoff());
  function newLog(date) {
    return {
      id: uid(),
      user_id: sessionId,
      log_date: date,
      woke_at: null,
      first_meal_at: null,
      meal_status: 'unknown',
      bedtime_at: null,
      energy_override: null,
      day_mode: 'normal',
      slipped_reasons: [],
      reasons_edited: false,
      swapped: { task: [], chore: [] },
      skipped_task: false,
      notes: null,
      updated_at: iso(),
    };
  }
  const getLog = (date) => db.daily_logs.find((l) => l.log_date === date) || null;
  function upsertLog(date, patch, silent) {
    let l = getLog(date);
    if (!l) {
      l = newLog(date);
      db.daily_logs.push(l);
    }
    Object.assign(l, patch, { updated_at: iso() });
    persist(silent);
    return l;
  }
  function setMeal(date, status, atInstant) {
    if (status === 'logged') return upsertLog(date, { meal_status: 'logged', first_meal_at: new Date(atInstant).toISOString() });
    return upsertLog(date, { meal_status: status, first_meal_at: null });
  }
  function deleteLog(date) {
    db.daily_logs = db.daily_logs.filter((l) => l.log_date !== date);
    db.chore_completions = db.chore_completions.filter((c) => c.log_date !== date);
    db.reminder_state = db.reminder_state.filter((r) => r.log_date !== date);
    persist();
  }
  const listLogs = () => db.daily_logs.slice();
  const listCompletions = () => db.chore_completions.slice();

  function swapItem(date, type, id) {
    const l = getLog(date) || upsertLog(date, {}, true);
    const sw = Object.assign({ task: [], chore: [] }, l.swapped);
    if (!sw[type].includes(id)) sw[type] = sw[type].concat(id);
    upsertLog(date, { swapped: sw });
    track('task_swapped', { type });
  }

  function unswapItem(date, type, id) {
    const l = getLog(date);
    if (!l) return;
    const sw = Object.assign({ task: [], chore: [] }, l.swapped);
    sw[type] = sw[type].filter((x) => x !== id);
    upsertLog(date, { swapped: sw });
  }

  // ---------- tasks ----------
  const listTasks = () => db.tasks.slice();
  const getTask = (id) => db.tasks.find((t) => t.id === id) || null;
  function cleanTaskFields(f) {
    const out = {};
    if ('title' in f) out.title = String(f.title || '').trim();
    if ('minutes' in f) out.minutes = Math.max(5, Math.min(240, Math.round(Number(f.minutes) || 25)));
    if ('energy_needed' in f) out.energy_needed = ['low', 'med', 'high'].includes(f.energy_needed) ? f.energy_needed : 'med';
    if ('due_date' in f) out.due_date = f.due_date || null;
    if ('is_micro' in f) out.is_micro = !!f.is_micro;
    return out;
  }
  function addTask(f) {
    const c = cleanTaskFields(Object.assign({ minutes: 25, energy_needed: 'med', due_date: null, is_micro: false }, f));
    if (!c.title) return { ok: false, error: 'empty_title' };
    const t = Object.assign(
      {
        id: uid(),
        user_id: sessionId,
        status: 'todo',
        is_sample: !!f.is_sample,
        started_at: null,
        completed_at: null,
        postponed_count: 0,
        postponed_until: null,
        micro_done_date: null,
        micro_session: false,
        last_shown_date: null,
        created_at: iso(),
      },
      c
    );
    db.tasks.push(t);
    persist();
    return { ok: true, task: t };
  }
  function updateTask(id, f) {
    const t = getTask(id);
    if (!t) return { ok: false, error: 'not_found' };
    const c = cleanTaskFields(f);
    if ('title' in c && !c.title) return { ok: false, error: 'empty_title' };
    Object.assign(t, c, { is_sample: false });
    persist();
    return { ok: true, task: t };
  }
  function removeTask(id) {
    db.tasks = db.tasks.filter((t) => t.id !== id);
    persist();
  }
  /** เลื่อนไปพรุ่งนี้: ไม่นับเป็นความล้มเหลว ไม่ขึ้นสีแดง ไม่ถูกลบ */
  function postponeTask(id, logDate) {
    const t = getTask(id);
    if (!t) return;
    t.postponed_until = T.addDays(logDate, 1);
    t.postponed_count = (t.postponed_count || 0) + 1;
    t.last_shown_date = null;
    if (t.status === 'doing') {
      t.status = 'todo';
      t.started_at = null;
      t.micro_session = false;
    }
    persist();
  }
  function unpostponeTask(id) {
    const t = getTask(id);
    if (!t) return;
    t.postponed_until = null;
    persist();
  }
  function startTask(id, opts) {
    const t = getTask(id);
    if (!t) return null;
    t.status = 'doing';
    t.started_at = iso();
    t.micro_session = !!(opts && opts.micro);
    t.postponed_until = null;
    persist();
    return t;
  }
  function cancelTask(id) {
    const t = getTask(id);
    if (!t) return;
    t.status = 'todo';
    t.started_at = null;
    t.micro_session = false;
    persist();
  }
  function completeTask(id) {
    const t = getTask(id);
    if (!t) return;
    t.status = 'done';
    t.completed_at = iso();
    t.micro_session = false;
    persist();
  }
  /** จบงานย่อย 25 นาทีที่ engine เสนอ: งานใหญ่ยังไม่เสร็จ แต่วันนี้ถือว่าเริ่มแล้ว */
  function completeMicroSession(id, logDate) {
    const t = getTask(id);
    if (!t) return;
    t.micro_done_date = logDate;
    t.status = 'todo';
    t.micro_session = false;
    persist();
  }
  function reopenTask(id) {
    const t = getTask(id);
    if (!t) return;
    t.status = 'todo';
    t.completed_at = null;
    t.started_at = null;
    persist();
  }
  function markTaskShown(id, logDate) {
    const t = getTask(id);
    if (t && t.last_shown_date !== logDate) {
      t.last_shown_date = logDate;
      persist(true);
    }
  }
  /** งานที่ไม่ได้ทำเมื่อจบวันเลื่อนต่อเงียบ ๆ (เพิ่ม postponed_count) ไม่ลบ ไม่ขึ้นสีแดง */
  function rollover(logDate) {
    if (!db || db.profile.last_rollover === logDate) return;
    // ไทเมอร์ที่เริ่มไม่เกิน 6 ชม. ก่อนเวลาตัดวัน (เช่น เริ่ม 03:50) ถือว่ายังเดินต่อข้ามเวลาตัดวันได้
    const carryFrom = T.atBkk(logDate, cutoff() - C.timerCarryHours * 60).getTime();
    for (const t of db.tasks) {
      if (t.status === 'doing' && t.started_at && new Date(t.started_at).getTime() < carryFrom) {
        t.status = 'todo';
        t.started_at = null;
        t.micro_session = false;
      }
      if (t.last_shown_date && t.last_shown_date < logDate && t.status !== 'done' && t.status !== 'dropped') {
        if (!t.postponed_until || t.postponed_until <= t.last_shown_date) t.postponed_count = (t.postponed_count || 0) + 1;
        t.last_shown_date = null;
      }
    }
    // แถวไทเมอร์งานห้องที่เริ่มไว้แต่ไม่เคยกดเสร็จและเก่ากว่าเมื่อวาน (ไทเมอร์กำพร้า) เก็บกวาดเงียบ ๆ
    const cutoffRow = T.addDays(logDate, -1);
    db.chore_completions = db.chore_completions.filter((c) => c.completed_at || c.skipped || c.log_date >= cutoffRow);
    db.profile.last_rollover = logDate;
    persist(true);
  }

  // ---------- chores ----------
  const listChores = () => db.chores.filter((c) => !c.archived_at);
  const allChores = () => db.chores.slice();
  const getChore = (id) => db.chores.find((c) => c.id === id) || null;
  const dupChore = (title, exceptId) => {
    const k = String(title).trim().toLowerCase();
    return db.chores.some((c) => !c.archived_at && c.id !== exceptId && c.title.trim().toLowerCase() === k);
  };
  function addChore(f) {
    const title = String(f.title || '').trim();
    if (!title) return { ok: false, error: 'empty_title' };
    if (dupChore(title)) return { ok: false, error: 'duplicate' };
    const c = {
      id: uid(),
      user_id: sessionId,
      title,
      minutes: Math.max(5, Math.min(15, Math.round(Number(f.minutes) || 10))),
      is_sample: !!f.is_sample,
      archived_at: null,
      created_at: iso(),
    };
    db.chores.push(c);
    persist();
    return { ok: true, chore: c };
  }
  function updateChore(id, f) {
    const c = getChore(id);
    if (!c) return { ok: false, error: 'not_found' };
    if ('title' in f) {
      const title = String(f.title || '').trim();
      if (!title) return { ok: false, error: 'empty_title' };
      if (dupChore(title, id)) return { ok: false, error: 'duplicate' };
      c.title = title;
    }
    if ('minutes' in f) c.minutes = Math.max(5, Math.min(15, Math.round(Number(f.minutes) || 10)));
    c.is_sample = false;
    persist();
    return { ok: true, chore: c };
  }
  /** "ลบ" งานห้อง = ย้ายเข้า archived_at (ประวัติการทำเดิมยังอยู่) */
  function archiveChore(id) {
    const c = getChore(id);
    if (!c) return;
    c.archived_at = iso();
    persist();
  }

  // ---------- chore_completions (แหล่งความจริงเดียวของสถานะงานห้อง) ----------
  const findCompletion = (choreId, date) =>
    db.chore_completions.find((c) => c.chore_id === choreId && c.log_date === date) || null;
  function startChore(choreId, date, plannedMinutes) {
    let row = findCompletion(choreId, date);
    if (row && row.completed_at) return row;
    if (!row) {
      row = {
        id: uid(),
        user_id: sessionId,
        chore_id: choreId,
        log_date: date,
        started_at: null,
        completed_at: null,
        minutes_spent: null,
        planned_minutes: plannedMinutes,
        partial: false,
        skipped: false,
      };
      db.chore_completions.push(row);
    }
    row.skipped = false;
    row.started_at = iso();
    row.planned_minutes = plannedMinutes;
    persist();
    track('chore_timer_started');
    return row;
  }
  function setChorePlanned(choreId, date, minutes) {
    const row = findCompletion(choreId, date);
    if (row && !row.completed_at) {
      row.planned_minutes = minutes;
      persist();
    }
  }
  /** สิ่งเดียวที่ทำให้งานห้องเสร็จคือการกด เสร็จ หลังไทเมอร์ */
  function completeChore(choreId, date) {
    const row = findCompletion(choreId, date);
    if (!row || row.completed_at) return row;
    const spent = row.started_at ? Math.max(0, (now() - new Date(row.started_at)) / 60000) : 0;
    row.completed_at = iso();
    row.minutes_spent = Math.round(spent * 10) / 10;
    persist();
    track('chore_completed');
    return row;
  }
  function cancelChore(choreId, date) {
    const row = findCompletion(choreId, date);
    if (row && !row.completed_at) {
      db.chore_completions = db.chore_completions.filter((c) => c !== row);
      persist();
    }
  }
  /** ผู้ใช้แก้ว่า "ยังไม่เสร็จ" — ลบแถวการทำของวันนั้น */
  function reopenChore(choreId, date) {
    const row = findCompletion(choreId, date);
    if (row) {
      db.chore_completions = db.chore_completions.filter((c) => c !== row);
      persist();
    }
  }
  function skipChore(choreId, date) {
    let row = findCompletion(choreId, date);
    if (row && row.completed_at) return;
    if (!row) {
      row = {
        id: uid(),
        user_id: sessionId,
        chore_id: choreId,
        log_date: date,
        started_at: null,
        completed_at: null,
        minutes_spent: null,
        planned_minutes: null,
        partial: false,
        skipped: true,
      };
      db.chore_completions.push(row);
    }
    row.skipped = true;
    row.started_at = null;
    persist();
  }
  function unskipChore(choreId, date) {
    const row = findCompletion(choreId, date);
    if (row && row.skipped && !row.completed_at) {
      db.chore_completions = db.chore_completions.filter((c) => c !== row);
      persist();
    }
  }

  // ---------- reminder_state ----------
  function markReminder(date, kind, field) {
    let r = db.reminder_state.find((x) => x.log_date === date && x.kind === kind);
    if (!r) {
      r = { user_id: sessionId, log_date: date, kind, fired_at: null, dismissed_at: null };
      db.reminder_state.push(r);
    }
    if (!r[field]) r[field] = iso();
    persist(true);
  }

  // ---------- events / feedback ----------
  /** analytics แบบเบา: ห้ามมีข้อความอิสระหรือข้อมูลระบุตัวตนใน props */
  function track(name, props) {
    if (!db) return;
    const safe = {};
    Object.entries(props || {}).forEach(([k, v]) => {
      if (typeof v === 'boolean' || typeof v === 'number' || (typeof v === 'string' && v.length <= 24)) safe[k] = v;
    });
    db.events.push({ id: uid(), user_id: sessionId, name, props: safe, at: iso() });
    if (db.events.length > 1500) db.events.splice(0, db.events.length - 1500);
    persist(true);
  }
  function addFeedback(page, message) {
    const m = String(message || '').trim();
    if (!m) return { ok: false };
    db.feedback.push({ id: uid(), user_id: sessionId, page: String(page || ''), message: m, created_at: iso() });
    persist();
    return { ok: true };
  }

  // ---------- care card ----------
  const markCareShown = (date) => {
    if (db.profile.care_card_shown_on !== date) {
      db.profile.care_card_shown_on = date;
      persist(true);
    }
  };
  const dismissCare = (date) => {
    db.profile.care_card_shown_on = date;
    db.profile.care_card_dismissed_on = date;
    persist();
  };

  // ---------- onboarding (เทียบเท่า RPC complete_onboarding ใน transaction เดียว) ----------
  function completeOnboarding(p) {
    // 1) บันทึก profile
    Object.assign(db.profile, {
      usual_bedtime: p.usual_bedtime,
      target_bedtime: p.target_bedtime,
      target_wake: p.target_wake,
      meal_delay_minutes: p.meal_delay_minutes,
      track_meals: p.track_meals !== false,
      onboarding_complete: true,
    });
    // 2) ลบแถวตัวอย่างเดิม (is_sample = true) ก่อนเพิ่มของผู้ใช้
    db.tasks = db.tasks.filter((t) => !t.is_sample);
    db.chores = db.chores.filter((c) => !c.is_sample);
    // 3) เพิ่มงานและงานห้องที่ผู้ใช้พิมพ์
    const typedTasks = (p.tasks || []).map((t) => String(t || '').trim()).filter(Boolean);
    const typedChores = (p.chores || []).map((t) => String(t || '').trim()).filter(Boolean);
    typedTasks.forEach((title) => {
      addTaskRaw({ title, minutes: 45, energy_needed: 'med', is_micro: false, is_sample: false });
    });
    typedChores.forEach((title) => {
      if (!dupChore(title)) addChoreRaw({ title, minutes: 10, is_sample: false });
    });
    // 4) ถ้าผู้ใช้เว้นว่างทั้งหมด จึงใส่ตัวอย่าง (is_sample = true) ถ้าพิมพ์เองแล้วไม่เติมตัวอย่างปนกับของผู้ใช้
    //    (ค่าที่ผู้ใช้พิมพ์ต้องแทนที่ตัวอย่างเสมอ) งานห้องเพิ่มจากชุดแนะนำได้ทีหลังในหน้า ห้อง
    if (!db.tasks.length) C.sampleTasks.forEach((s) => addTaskRaw(Object.assign({ is_sample: true }, s)));
    if (!db.chores.length) {
      C.sampleChores.slice(0, 3).forEach((s) => {
        if (!dupChore(s.title)) addChoreRaw({ title: s.title, minutes: s.minutes, is_sample: true });
      });
    }
    // 5) สร้าง log วันนี้ใหม่ โดยไม่เขียน woke_at ทับค่าของผู้ใช้
    const date = todayLogDate();
    if (!getLog(date)) db.daily_logs.push(newLog(date));
    persist();
    track('onboarding_completed');
  }
  function addTaskRaw(f) {
    db.tasks.push(
      Object.assign(
        {
          id: uid(), user_id: sessionId, status: 'todo', due_date: null, started_at: null, completed_at: null,
          postponed_count: 0, postponed_until: null, micro_done_date: null, micro_session: false, last_shown_date: null,
          created_at: iso(),
        },
        f
      )
    );
  }
  function addChoreRaw(f) {
    db.chores.push(Object.assign({ id: uid(), user_id: sessionId, archived_at: null, created_at: iso() }, f));
  }

  // ---------- เชื่อมกับ rule engine ----------
  function engineInput(at) {
    const when = at || now();
    const co = cutoff();
    const logDate = T.logDateOf(when, co);
    const recentFrom = T.addDays(logDate, -7);
    return {
      now: when,
      profile: db.profile,
      log: getLog(logDate),
      prevLog: getLog(T.addDays(logDate, -1)),
      recentLogs: db.daily_logs.filter((l) => l.log_date >= recentFrom && l.log_date < logDate),
      tasks: db.tasks,
      chores: db.chores,
      completions: db.chore_completions,
      reminderState: db.reminder_state,
    };
  }
  /** แผนของวันนี้ (ตัวเดียวที่ทุกหน้าใช้) */
  function plan(at) {
    return RD.engine.buildDay(engineInput(at));
  }
  /** สรุปของวันใดวันหนึ่งย้อนหลัง คำนวณ ณ ปลายวันนั้น (ไม่มีข้อมูลงาน เพราะสถานะงานย้อนหลังไม่ได้เก็บเป็นรายวัน) */
  function planForDay(logDate) {
    const co = cutoff();
    // วันที่ผ่านมาแล้วคำนวณ ณ ปลายวัน; วันนี้คำนวณ ณ ตอนนี้ (วันยังไม่จบ จึงยังไม่ควรมี flag ของช่วงเย็น)
    const end = new Date(Math.min(T.logDayWindow(logDate, co).end.getTime() - 60000, now().getTime()));
    const from = T.addDays(logDate, -7);
    const input = {
      now: end,
      profile: db.profile,
      log: getLog(logDate),
      prevLog: getLog(T.addDays(logDate, -1)),
      recentLogs: db.daily_logs.filter((l) => l.log_date >= from && l.log_date < logDate),
      tasks: [],
      chores: db.chores,
      completions: db.chore_completions,
      reminderState: [],
    };
    return RD.engine.buildDay(input);
  }

  RD.store = {
    // session
    isLoggedIn: () => !!(sessionId && db),
    userId: () => sessionId,
    accountInfo,
    signup,
    login,
    logout,
    changePassword,
    resetWithRecovery,
    verifyRecovery,
    newRecoveryCode,
    draftRecoveryCode,
    commitRecoveryCode,
    takeRecoveredNotice,
    needsConsent,
    acceptConsent,
    reloadFromStorage: syncFromStorage,
    takePendingRecovery,
    clearPendingRecovery,
    exportData,
    wipeData,
    deleteAccount,
    persistOk: () => persistOk,
    subscribe,
    // profile
    profile,
    updateProfile,
    completeOnboarding,
    // logs
    todayLogDate,
    cutoff,
    getLog,
    upsertLog,
    setMeal,
    deleteLog,
    listLogs,
    listCompletions,
    swapItem,
    unswapItem,
    // tasks
    listTasks,
    getTask,
    addTask,
    updateTask,
    removeTask,
    postponeTask,
    unpostponeTask,
    startTask,
    cancelTask,
    completeTask,
    completeMicroSession,
    reopenTask,
    markTaskShown,
    rollover,
    // chores
    listChores,
    allChores,
    getChore,
    addChore,
    updateChore,
    archiveChore,
    findCompletion,
    startChore,
    setChorePlanned,
    completeChore,
    cancelChore,
    reopenChore,
    skipChore,
    unskipChore,
    // misc
    markReminder,
    track,
    addFeedback,
    markCareShown,
    dismissCare,
    // engine
    engineInput,
    plan,
    planForDay,
    now,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
