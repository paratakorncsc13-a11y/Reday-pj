/* ReDay v2 — lib/time
 * เวลาเก็บเป็น instant (UTC) แสดงผลตาม Asia/Bangkok (UTC+7 ไม่มีเวลาออมแสง)
 * ทุกการแสดงเวลาผ่าน formatTime() ที่คืนรูป HH:mm น. เท่านั้น
 * ไม่มีฟังก์ชันไหนในไฟล์นี้อ่านนาฬิกาเอง (ยกเว้น clock ท้ายไฟล์ ซึ่งเป็นของฝั่ง UI)
 */
(function (g) {
  const RD = (g.RD = g.RD || {});
  const OFF_MIN = 420;
  const OFF = OFF_MIN * 60000;
  const MIN = 60000;

  const pad = (n) => String(n).padStart(2, '0');

  function toDate(x) {
    if (x == null) return null;
    return x instanceof Date ? x : new Date(x);
  }

  function parts(d) {
    const t = new Date(toDate(d).getTime() + OFF);
    return {
      y: t.getUTCFullYear(),
      mo: t.getUTCMonth() + 1,
      d: t.getUTCDate(),
      h: t.getUTCHours(),
      mi: t.getUTCMinutes(),
      dow: t.getUTCDay(),
    };
  }

  /** วันที่ตามปฏิทินไทย 'YYYY-MM-DD' (ยังไม่คิดเวลาตัดวัน) */
  function ymd(d) {
    const p = parts(d);
    return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
  }

  function minuteOfDay(d) {
    const p = parts(d);
    return p.h * 60 + p.mi;
  }

  /** 'HH:mm' -> นาทีนับจากเที่ยงคืน */
  function parseHM(s) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(s));
    if (!m) return NaN;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  /** นาทีนับจากเที่ยงคืน -> 'HH:mm' */
  function hmStr(min) {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  }

  /**
   * ฟังก์ชันเดียวที่ใช้แสดงเวลา -> '02:30 น.'
   * รับ Date, ISO string, จำนวนนาที (0-1439) หรือ 'HH:mm'
   */
  function formatTime(x) {
    if (x == null || x === '') return '';
    if (typeof x === 'number') return `${hmStr(x)} น.`;
    if (typeof x === 'string' && /^\d{1,2}:\d{2}$/.test(x)) return `${hmStr(parseHM(x))} น.`;
    return `${hmStr(minuteOfDay(x))} น.`;
  }

  /** instant ของเวลา minutes (นับจากเที่ยงคืนของ ymdStr, เกิน 1440 หรือติดลบได้) ตามเวลาไทย */
  function atBkk(ymdStr, minutes) {
    const [y, m, d] = ymdStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + minutes * MIN - OFF);
  }

  function addDays(ymdStr, n) {
    const [y, m, d] = ymdStr.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }

  /** a - b เป็นจำนวนวัน */
  function diffDays(a, b) {
    const pa = a.split('-').map(Number);
    const pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pa[0], pa[1] - 1, pa[2]) - Date.UTC(pb[0], pb[1] - 1, pb[2])) / 86400000);
  }

  /** log_date: วันตามเวลาตัดวัน (ก่อน cutoff ถือเป็นวันก่อนหน้า) */
  function logDateOf(d, cutoffMin) {
    return ymd(new Date(toDate(d).getTime() - cutoffMin * MIN));
  }

  /** นาทีนับจากเวลาตัดวัน — ใช้เรียงไทม์ไลน์ (23:50 มาก่อน 00:10 มาก่อน 03:40 เสมอ) */
  function dayMinute(minOfDay, cutoffMin) {
    return (((minOfDay - cutoffMin) % 1440) + 1440) % 1440;
  }

  function dayMinuteOf(d, cutoffMin) {
    return dayMinute(minuteOfDay(d), cutoffMin);
  }

  /** นาทีนับจาก 18:00 น. — ใช้เทียบเวลานอนข้ามเที่ยงคืน */
  function sleepMinute(minOfDay) {
    return (((minOfDay - 18 * 60) % 1440) + 1440) % 1440;
  }

  /** เรียงตามนาทีนับจากเวลาตัดวัน getMin(item) คืนนาทีของวัน (0-1439) */
  function sortByDayMinute(items, getMin, cutoffMin) {
    return items
      .map((it, i) => ({ it, i, k: dayMinute(getMin(it), cutoffMin) }))
      .sort((a, b) => a.k - b.k || a.i - b.i)
      .map((x) => x.it);
  }

  /** ช่วงของ log day: [start, end) */
  function logDayWindow(logDate, cutoffMin) {
    const start = atBkk(logDate, cutoffMin);
    return { start, end: new Date(start.getTime() + 1440 * MIN) };
  }

  /** instant ของเวลา minOfDay ที่อยู่ภายใน log day นั้น */
  function resolveInLogDay(logDate, minOfDay, cutoffMin) {
    const w = logDayWindow(logDate, cutoffMin);
    return new Date(w.start.getTime() + dayMinute(minOfDay, cutoffMin) * MIN);
  }

  /** instant ล่าสุดที่ไม่เกิน ref ซึ่งมีเวลานาฬิกาเป็น minOfDay */
  function latestAtOrBefore(minOfDay, ref) {
    const r = toDate(ref);
    const floored = Math.floor(r.getTime() / MIN) * MIN;
    const diff = (((minuteOfDay(new Date(floored)) - minOfDay) % 1440) + 1440) % 1440;
    return new Date(floored - diff * MIN);
  }

  /** instant ที่ใกล้ ref ที่สุด (ภายใน ±12 ชม.) ซึ่งมีเวลานาฬิกาเป็น minOfDay */
  function nearest(minOfDay, ref) {
    const r = toDate(ref);
    const before = latestAtOrBefore(minOfDay, r);
    return r.getTime() - before.getTime() > 12 * 60 * MIN ? new Date(before.getTime() + 1440 * MIN) : before;
  }

  /** วันที่ไทย (พ.ศ.) เช่น 'พฤ. 1 ต.ค. 2569' ใช้ Intl ตามสเปก ฐานข้อมูลเก็บ ค.ศ. เสมอ */
  const WD_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  const WD_LONG = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
  const dateFmt = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const dateFmtShort = new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
  });

  function noonOf(ymdStr) {
    return atBkk(ymdStr, 12 * 60);
  }
  /** 'พฤ. 1 ต.ค. 2569' — วันในสัปดาห์ใช้ตัวย่อตามสเปก ส่วนวัน เดือน ปี พ.ศ. มาจาก Intl */
  function weekdayShort(ymdStr) {
    return WD_SHORT[parts(noonOf(ymdStr)).dow];
  }
  function formatDate(ymdStr) {
    return `${weekdayShort(ymdStr)} ${dateFmt.format(noonOf(ymdStr))}`;
  }
  function formatDateShort(ymdStr) {
    return dateFmtShort.format(noonOf(ymdStr));
  }
  function formatDateLong(ymdStr) {
    return `${WD_LONG[parts(noonOf(ymdStr)).dow]}ที่ ${dateFmt.format(noonOf(ymdStr))}`;
  }

  /** ระยะเวลาเป็นข้อความ เช่น '1 ชม. 20 นาที' */
  function formatDuration(min) {
    const m = Math.max(0, Math.round(min));
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h && r) return `${h} ชม. ${r} นาที`;
    if (h) return `${h} ชม.`;
    return `${r} นาที`;
  }

  /** นาฬิกาของฝั่ง UI — รองรับ ?now=2026-10-01T09:30+07:00 เพื่อทดสอบ/สาธิต (เวลาเดินต่อจากค่าที่ตั้ง) */
  const clock = {
    offsetMs: 0,
    now() {
      return new Date(Date.now() + this.offsetMs);
    },
    setFrom(iso) {
      const t = new Date(iso).getTime();
      if (!isNaN(t)) this.offsetMs = t - Date.now();
    },
  };

  RD.time = {
    OFF_MIN,
    pad,
    toDate,
    parts,
    ymd,
    minuteOfDay,
    parseHM,
    hmStr,
    formatTime,
    atBkk,
    addDays,
    diffDays,
    logDateOf,
    dayMinute,
    dayMinuteOf,
    sleepMinute,
    sortByDayMinute,
    logDayWindow,
    resolveInLogDay,
    latestAtOrBefore,
    nearest,
    formatDate,
    formatDateShort,
    formatDateLong,
    weekdayShort,
    formatDuration,
    clock,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
