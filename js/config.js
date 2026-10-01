/* ReDay v2 — config
 * ค่าเกณฑ์ทั้งหมดอยู่ที่นี่ (spec: "ค่าเกณฑ์ใน config ต้องทบทวนหลังเพื่อนใช้จริง 2 สัปดาห์")
 */
(function (g) {
  const RD = (g.RD = g.RD || {});

  RD.config = {
    version: '2.0.0',
    consentVersion: '2026-10-02-draft',
    // Supabase (โหมดออนไลน์): url กับ publishable key ออกแบบให้อยู่ในโค้ดหน้าเว็บได้ ความปลอดภัยอยู่ที่ RLS ในฐานข้อมูล
    // ปิดได้ด้วย ?local=1 และปิดอัตโนมัติเมื่อมี ?ns= (ชุดทดสอบ) เพื่อไม่ให้ทดสอบไปแตะฐานข้อมูลจริง
    supabase: {
      url: 'https://ksazuquebmcyjuikykqb.supabase.co',
      publishableKey: 'sb_publishable_SWlfsv7_er1-iq5iUAAmNQ_rF3YiqBW',
    },
    // คีย์ใน localStorage (ชุดทดสอบตั้ง RD_STORAGE_PREFIX เพื่อไม่ให้ไปแตะข้อมูลจริง)
    storagePrefix:
      g.RD_STORAGE_PREFIX ||
      ((g.location && /[?&]ns=([\w-]+)/.exec(g.location.search || '')) || [])[1] ||
      'reday2',

    // เวลา
    tz: 'Asia/Bangkok',
    tzOffsetMin: 420, // UTC+7 ไม่มีเวลาออมแสง
    dayCutoff: '04:00', // เวลาตัดวัน

    // R1 / R2
    lateWakeMin: 90, // ตื่นช้ากว่าเป้าเกินนี้ = พลังงานต่ำ
    onTimeWindowMin: 90, // ห่างจากเป้าไม่เกินนี้ = "ตรงเวลา"
    mealGraceMin: 30, // เลยเวลามื้อแรกไปเกินนี้

    // ไทเมอร์ที่เริ่มก่อนเวลาตัดวันไม่เกินนี้ (ชม.) เดินต่อข้ามเวลาตัดวันได้
    timerCarryHours: 6,

    // ค่าที่ขัดกัน: ช่วงนอนที่สมเหตุสมผล (นอกช่วงนี้ให้ถามว่า นอนข้ามคืนใช่ไหม)
    sleepPlausibleMinMin: 120,
    sleepPlausibleMaxMin: 960,

    // R4
    lateBedtimeMin: 60,
    bedtimeShiftMin: 20,
    winddownLeadMin: 45,
    winddownWindowMin: 60,
    bedtimeLookbackDays: 3,

    // R5 / R6
    microMaxMin: 25,
    microDefaultMin: 25,
    choreLookbackDays: 3,
    choreMaxMin: 10,
    choreLightMin: 5,
    taskAfterMealMin: 15,
    taskNoMealOffsetMin: 60,
    choreAfterTaskMin: 15,
    choreEvening: '17:00',

    // R8
    taskNotStartedAfter: '16:00',
    choreSkippedAfter: '20:00',

    // R9
    resetWinddownWithinMin: 90,
    resetMaxItems: 3,

    // R10
    choreNudgeAfter: '17:00',
    maxNudgesPerDay: 3,

    // การ์ดชวนคุย (กฎความปลอดภัยด้านมื้ออาหารและการนอน)
    careStreakDays: 4,
    careShortSleepDeficitMin: 120, // นอนน้อยกว่าเป้า "มาก" = ขาดเกินนี้
    careCardEveryDays: 7,

    // ข้อมูลอ่านง่าย
    defaultProfile: {
      usual_bedtime: '01:00',
      target_bedtime: '23:30',
      target_wake: '08:00',
      meal_delay_minutes: 30,
      quiet_start: null,
      quiet_end: null,
      notify_meal: true,
      notify_winddown: true,
      notify_room: true,
      track_meals: true,
      day_cutoff: '04:00',
    },
    mealDelayOptions: [15, 30, 45, 60, 90],

    sampleTasks: [
      { title: 'อ่านสรุปวิชาสถิติ บทที่ 4', minutes: 45, energy_needed: 'med', is_micro: false },
      { title: 'ตอบอีเมลที่ค้างอยู่ 1 ฉบับ', minutes: 15, energy_needed: 'low', is_micro: true },
      { title: 'เริ่มร่างรายงานกลุ่ม', minutes: 60, energy_needed: 'high', is_micro: false },
    ],
    sampleChores: [
      { title: 'เก็บโต๊ะ', minutes: 10 },
      { title: 'กวาดพื้น', minutes: 10 },
      { title: 'เก็บผ้า', minutes: 10 },
      { title: 'ล้างจาน', minutes: 10 },
      { title: 'เปิดหน้าต่าง', minutes: 5 },
    ],

    // ช่องทางติดต่อสำหรับนโยบายความเป็นส่วนตัว (เว้นไว้ = ใช้ปุ่ม ส่งความเห็น)
    contactEmail: null,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
