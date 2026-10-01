/* ReDay v2 — rule engine ตัวเดียว (src/engine)
 *
 * ฟังก์ชันบริสุทธิ์: ไม่มี side effect, ไม่อ่านนาฬิกาเอง (now ส่งเข้ามา), ไม่แตะ DOM/storage
 * ทุกหน้าเรียก buildDay(input) ตัวเดียว หน้าจอห้ามคำนวณกฎเอง
 * ข้อความที่ผู้ใช้เห็นสร้างจาก DayPlan (plan.copy / plan.summary / plan.nudges) เท่านั้น
 * รันได้ทั้งใน browser และ Deno (ไม่พึ่ง React/Supabase/DOM)
 *
 * input = { now, profile, log, prevLog, recentLogs, tasks, chores, completions, reminderState }
 */
(function (g) {
  const RD = (g.RD = g.RD || {});
  const T = RD.time;
  const C = RD.config;
  const M = RD.msg;
  const MIN = 60000;

  const D = (x) => T.toDate(x);
  const addMin = (d, n) => new Date(D(d).getTime() + n * MIN);
  const diffMin = (a, b) => Math.round((D(a).getTime() - D(b).getTime()) / MIN);
  const ENERGY_RANK = { low: 0, med: 1, high: 2 };
  const LEVEL_ALLOWS = { low: 0, normal: 1, good: 2 };

  const REASON_TOKEN_TEXT = {
    sick: 'ป่วย',
    long_shift: 'เรียนหรือกะยาว',
    errand: 'มีธุระ',
    other: 'อื่น ๆ',
  };

  function cutoffOf(profile) {
    const m = T.parseHM((profile && profile.day_cutoff) || C.dayCutoff);
    return isNaN(m) ? 240 : m;
  }

  function inQuietHours(profile, now) {
    if (!profile.quiet_start || !profile.quiet_end) return false;
    const s = T.parseHM(profile.quiet_start);
    const e = T.parseHM(profile.quiet_end);
    const m = T.minuteOfDay(now);
    if (s === e) return false;
    return s < e ? m >= s && m < e : m >= s || m < e;
  }

  function cmpDue(a, b) {
    if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
    if (a.due_date) return -1;
    if (b.due_date) return 1;
    return 0;
  }
  const cmpCreated = (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''));

  function inWindow(x, win) {
    if (!x) return false;
    const t = D(x).getTime();
    return t >= win.start.getTime() && t < win.end.getTime();
  }

  /** R1 พลังงาน — ข้อแรกที่ตรงชนะ */
  function computeEnergy(s) {
    const { log, light, wokeAt, wakeDelta, mealOverdue } = s;
    if (log && log.energy_override) {
      return { level: log.energy_override, source: 'user', reason: 'override' };
    }
    if (light) return { level: 'low', source: 'user', reason: 'light_day' };
    if (!wokeAt) return { level: 'normal', source: 'rule', reason: 'no_wake' };
    if (wakeDelta > C.lateWakeMin) return { level: 'low', source: 'rule', reason: 'late_wake' };
    if (mealOverdue) return { level: 'low', source: 'rule', reason: 'meal_overdue' };
    return { level: 'normal', source: 'rule', reason: 'default' };
  }

  /** ชุดข้อมูลสำหรับคำนวณการ์ดหน้า วันนี้/แผน/ห้อง/สรุป */
  function buildDay(input) {
    const now = D(input.now);
    const profile = input.profile || {};
    const cutoff = cutoffOf(profile);
    const logDate = T.logDateOf(now, cutoff);
    const win = T.logDayWindow(logDate, cutoff);
    const log = input.log || null;
    const prevLog = input.prevLog || null;
    const recent = input.recentLogs || [];
    const tasks = input.tasks || [];
    const allChores = input.chores || [];
    const chores = allChores.filter((c) => !c.archived_at);
    const completions = input.completions || [];
    const reminderState = input.reminderState || [];
    const ctx = { userId: profile.id || '', logDate };

    const trackMeals = profile.track_meals !== false;
    const light = !!log && log.day_mode === 'light';
    const nowDM = T.dayMinuteOf(now, cutoff);
    const dm = (hm) => T.dayMinute(T.parseHM(hm), cutoff);

    // ---------- เวลาตื่น (R2) ----------
    const wokeAt = log && log.woke_at ? D(log.woke_at) : null;
    const targetWakeAt = T.resolveInLogDay(logDate, T.parseHM(profile.target_wake || C.defaultProfile.target_wake), cutoff);
    const wakeDelta = wokeAt ? diffMin(wokeAt, targetWakeAt) : null;
    const onTime = wokeAt ? Math.abs(wakeDelta) <= C.onTimeWindowMin : false;
    const wakeChip = wokeAt
      ? `ตื่น ${T.formatTime(wokeAt)}${onTime ? ' · ตรงเวลา' : ''}`
      : 'ยังไม่บันทึกเวลาตื่น';

    // ---------- มื้อแรก (R3) ----------
    const mealStatus = log ? log.meal_status || (log.first_meal_at ? 'logged' : 'unknown') : 'unknown';
    const firstMealAt = log && log.first_meal_at ? D(log.first_meal_at) : null;
    const delay = profile.meal_delay_minutes || C.defaultProfile.meal_delay_minutes;
    const recMealAt = wokeAt ? addMin(wokeAt, delay) : null;
    const mealPast = recMealAt ? diffMin(now, recMealAt) : null; // นาทีที่เลยเวลามื้อแนะนำ
    const mealOverdue =
      trackMeals && recMealAt !== null && (mealStatus === 'unknown' || mealStatus === 'skipped') && mealPast > C.mealGraceMin;

    // ---------- พลังงาน (R1) ----------
    const energy = computeEnergy({ log, light, wokeAt, wakeDelta, mealOverdue });
    energy.text = M.energyChip(energy.level, energy.source);

    // ---------- นอน (R4) ----------
    const lookbackMs = C.bedtimeLookbackDays * 86400000;
    const bedCands = [...recent, prevLog, log]
      .filter((l) => l && l.bedtime_at)
      .map((l) => D(l.bedtime_at))
      .filter((at) => now.getTime() - at.getTime() <= lookbackMs)
      .sort((a, b) => b.getTime() - a.getTime());
    const baseBedMin = bedCands.length
      ? T.minuteOfDay(bedCands[0])
      : T.parseHM(profile.usual_bedtime || C.defaultProfile.usual_bedtime);
    const baseSm = T.sleepMinute(baseBedMin);
    const targetBedMin = T.parseHM(profile.target_bedtime || C.defaultProfile.target_bedtime);
    const targetSm = T.sleepMinute(targetBedMin);
    const sugSm = baseSm - targetSm > C.lateBedtimeMin ? Math.max(baseSm - C.bedtimeShiftMin, targetSm) : targetSm;
    const suggestedBedtime = T.atBkk(logDate, 18 * 60 + sugSm);
    const winddownAt = addMin(suggestedBedtime, -C.winddownLeadMin);
    const shiftMinutes = Math.max(0, baseSm - sugSm);
    const tonightBedAt = log && log.bedtime_at ? D(log.bedtime_at) : null;
    const lastNightAt = prevLog && prevLog.bedtime_at ? D(prevLog.bedtime_at) : null;
    const lastNightLate = lastNightAt ? T.sleepMinute(T.minuteOfDay(lastNightAt)) - targetSm > C.lateBedtimeMin : false;
    const sleep = {
      suggestedBedtime,
      winddownAt,
      shiftMinutes,
      baseBedtimeMin: baseBedMin,
      tonightBedAt,
      lastNight: lastNightAt ? { at: lastNightAt, late: lastNightLate } : null,
    };

    // ---------- งานหลัก / งานย่อย (R5) ----------
    const swapped = (log && log.swapped) || {};
    const swappedTasks = swapped.task || [];
    const swappedChores = swapped.chore || [];
    const isMicro = (t) => !!t.is_micro || t.minutes <= C.microMaxMin;
    // เริ่มภายในวันนี้ หรือก่อนเวลาตัดวันไม่เกิน timerCarryHours (ไทเมอร์ที่คาบเกี่ยว 04:00 ยังนับต่อได้)
    const carryStart = new Date(win.start.getTime() - C.timerCarryHours * 60 * MIN);
    const startedToday = (t) => inWindow(t.started_at, { start: carryStart, end: win.end });
    const doneToday = (t) => t.status === 'done' && inWindow(t.completed_at, win);
    const taskStartAt = !wokeAt
      ? null
      : trackMeals
        ? addMin(mealStatus === 'logged' && firstMealAt ? firstMealAt : recMealAt, C.taskAfterMealMin)
        : addMin(wokeAt, C.taskNoMealOffsetMin);

    function microOffer(task) {
      const title = M.pick('microOffer', M.L.microOffer, ctx)(task.title, C.microDefaultMin);
      return { kind: 'micro', task, proposed: true, title, minutes: C.microDefaultMin };
    }
    function realCard(task, proposed) {
      if (proposed) return microOffer(task);
      return { kind: isMicro(task) ? 'micro' : 'main', task, proposed: false, title: task.title, minutes: task.minutes };
    }

    let taskCard = null;
    let taskEmpty = null;
    if (!light) {
      const active = tasks.find((t) => t.status === 'doing' && startedToday(t));
      const finished = tasks
        .filter(doneToday)
        .sort((a, b) => D(b.completed_at) - D(a.completed_at))[0];
      const microFinished = tasks.find((t) => t.micro_done_date === logDate && t.status !== 'done');
      if (log && log.skipped_task) {
        taskCard = { kind: 'micro', task: null, proposed: false, title: '', minutes: 0, state: 'skipped' };
      } else if (active) {
        taskCard = Object.assign(realCard(active, !!active.micro_session), { state: 'doing' });
      } else if (finished) {
        taskCard = Object.assign(realCard(finished, false), { state: 'done' });
      } else if (microFinished) {
        taskCard = Object.assign(realCard(microFinished, true), { state: 'done' });
      } else {
        const level = energy.level;
        const cands = tasks
          .filter((t) => (t.status === 'todo' || t.status === 'doing') && (!t.postponed_until || t.postponed_until <= logDate))
          .filter((t) => !swappedTasks.includes(t.id));
        const byDue = (a, b) => cmpDue(a, b) || cmpCreated(a, b);
        const byDueHard = (a, b) => cmpDue(a, b) || ENERGY_RANK[b.energy_needed] - ENERGY_RANK[a.energy_needed] || cmpCreated(a, b);
        if (level === 'low') {
          const micro = cands.filter(isMicro).sort(byDue)[0];
          if (micro) taskCard = realCard(micro, false);
          else if (cands.length) taskCard = microOffer(cands.sort(byDue)[0]);
        } else {
          const ok = cands.filter((t) => ENERGY_RANK[t.energy_needed] <= LEVEL_ALLOWS[level]).sort(byDueHard);
          if (ok.length) taskCard = realCard(ok[0], false);
          else if (cands.length) taskCard = microOffer(cands.sort(byDue)[0]);
        }
        if (taskCard) taskCard.state = 'todo';
      }
      if (!taskCard) taskEmpty = 'ยังไม่มีงานที่ต้องทำวันนี้ เพิ่มงานได้ในหน้า แผน';
    }
    if (taskCard && taskCard.state !== 'skipped') taskCard.startAt = taskStartAt;
    const mainTask = taskCard && taskCard.kind === 'main' ? taskCard : null;
    const microTask = taskCard && taskCard.kind === 'micro' && taskCard.state !== 'skipped' ? taskCard : null;

    // ---------- งานห้อง (R6) ----------
    const lastDone = {};
    for (const c of completions) {
      if (!c.completed_at) continue;
      if (!lastDone[c.chore_id] || c.log_date > lastDone[c.chore_id]) lastDone[c.chore_id] = c.log_date;
    }
    const choreById = (id) => allChores.find((c) => c.id === id) || null;
    const choreMin = (c) => Math.min(c.minutes || C.choreMaxMin, C.choreMaxMin);
    let choreCard = null;
    let choreEmpty = null;
    {
      const todays = completions.filter((c) => c.log_date === logDate);
      const prevDate = T.addDays(logDate, -1);
      const running =
        todays.find((c) => !c.completed_at && !c.skipped) ||
        // ไทเมอร์ที่เริ่มก่อนเวลาตัดวันไม่นาน (log_date เมื่อวาน) ยังเดินต่อได้
        completions.find((c) => c.log_date === prevDate && !c.completed_at && !c.skipped && c.started_at && inWindow(c.started_at, { start: carryStart, end: win.end }));
      const finished = todays.filter((c) => c.completed_at).sort((a, b) => D(b.completed_at) - D(a.completed_at))[0];
      const skipped = todays.find((c) => c.skipped);
      const mk = (chore, state, completion) => ({
        chore,
        state,
        completion: completion || null,
        optional: light,
        minutes: light ? C.choreLightMin : completion && completion.planned_minutes ? completion.planned_minutes : choreMin(chore),
      });
      if (running && choreById(running.chore_id)) choreCard = mk(choreById(running.chore_id), 'running', running);
      else if (finished && choreById(finished.chore_id)) choreCard = mk(choreById(finished.chore_id), 'done', finished);
      else if (skipped && choreById(skipped.chore_id)) choreCard = mk(choreById(skipped.chore_id), 'skipped', skipped);
      else {
        const eligible = chores
          .filter((c) => !swappedChores.includes(c.id))
          .filter((c) => !lastDone[c.id] || T.diffDays(logDate, lastDone[c.id]) >= C.choreLookbackDays)
          .sort((a, b) => {
            const la = lastDone[a.id] || '';
            const lb = lastDone[b.id] || '';
            return la < lb ? -1 : la > lb ? 1 : cmpCreated(a, b);
          });
        if (eligible.length) {
          choreCard = mk(eligible[0], 'todo', null);
        } else if (!chores.length) {
          choreEmpty = 'ยังไม่มีงานห้อง เพิ่มได้ในหน้า ห้อง';
        } else {
          choreEmpty = 'ห้องเรียบร้อยดี วันนี้ไม่มีอะไรต้องเก็บ';
        }
      }
    }

    // ---------- ไทม์ไลน์ (R7) ----------
    const eveningAt = T.resolveInLogDay(logDate, T.parseHM(C.choreEvening), cutoff);
    let taskItemAt = null;
    if (taskCard && taskCard.state !== 'skipped') {
      const t = taskCard.task;
      taskItemAt =
        taskCard.state === 'done' && t && t.completed_at
          ? D(t.completed_at)
          : t && t.started_at && startedToday(t)
            ? D(t.started_at)
            : taskStartAt;
    }
    let choreItemAt = null;
    if (choreCard) {
      if (choreCard.state === 'running') choreItemAt = D(choreCard.completion.started_at);
      else if (choreCard.state === 'done') choreItemAt = D(choreCard.completion.completed_at);
      else if (choreCard.state === 'skipped') choreItemAt = null;
      else if (taskItemAt && taskCard && taskCard.state !== 'done') choreItemAt = addMin(taskItemAt, taskCard.minutes + C.choreAfterTaskMin);
      else if (taskItemAt && taskCard) choreItemAt = addMin(taskItemAt, C.choreAfterTaskMin);
      else choreItemAt = eveningAt;
    }

    const items = [];
    if (wokeAt) items.push({ id: 'wake', kind: 'wake', pillar: 'sleep', at: wokeAt, title: 'ตื่น', sub: null, status: 'done' });
    if (trackMeals && (firstMealAt || recMealAt)) {
      const status = mealStatus === 'logged' ? 'done' : mealStatus === 'skipped' ? 'skipped' : 'upcoming';
      items.push({
        id: 'meal',
        kind: 'meal',
        pillar: 'meal',
        at: mealStatus === 'logged' && firstMealAt ? firstMealAt : recMealAt,
        title: mealStatus === 'logged' ? 'กินมื้อแรก' : mealStatus === 'skipped' ? 'ไม่กินมื้อนี้' : 'มื้อแรก',
        sub: null,
        status,
      });
    }
    if (taskCard && taskCard.state !== 'skipped' && taskItemAt) {
      items.push({
        id: 'task',
        kind: 'task',
        pillar: 'work',
        at: taskItemAt,
        title: taskCard.proposed && taskCard.task ? taskCard.task.title : taskCard.title,
        sub: taskCard.proposed ? `${taskCard.minutes} นาที · เริ่มแค่นี้ก็พอ` : `${taskCard.minutes} นาที`,
        status: taskCard.state === 'done' ? 'done' : taskCard.state === 'doing' ? 'doing' : 'upcoming',
      });
    }
    if (choreCard && choreItemAt) {
      items.push({
        id: 'chore',
        kind: 'chore',
        pillar: 'room',
        at: choreItemAt,
        title: choreCard.chore.title,
        sub: `${choreCard.minutes} นาที`,
        status: choreCard.state === 'done' ? 'done' : choreCard.state === 'running' ? 'doing' : 'upcoming',
      });
    }
    items.push({
      id: 'winddown',
      kind: 'winddown',
      pillar: 'sleep',
      at: winddownAt,
      title: 'ผ่อนจังหวะ',
      sub: null,
      status: tonightBedAt ? 'done' : 'upcoming',
    });
    items.push({
      id: 'sleep',
      kind: 'sleep',
      pillar: 'sleep',
      at: tonightBedAt || suggestedBedtime,
      title: tonightBedAt ? 'เข้านอน' : 'เวลานอนที่แนะนำ',
      sub: null,
      status: tonightBedAt ? 'done' : 'upcoming',
    });
    const timeline = T.sortByDayMinute(items, (it) => T.minuteOfDay(it.at), cutoff);
    const firstUpcoming = timeline.find((it) => it.status === 'upcoming' || it.status === 'doing');
    if (firstUpcoming) firstUpcoming.status = firstUpcoming.status === 'doing' ? 'doing' : 'next';

    // ---------- Flags และสรุป (R8) ----------
    const flags = [];
    if (!light) {
      if (lastNightLate) flags.push({ key: 'late_bedtime', text: M.FLAG_TEXT.late_bedtime });
      if (trackMeals && wokeAt && (mealStatus === 'skipped' || (mealStatus === 'unknown' && mealPast > C.mealGraceMin))) {
        flags.push({ key: 'missing_meal', text: M.FLAG_TEXT.missing_meal });
      }
      if (nowDM >= dm(C.taskNotStartedAfter) && taskCard && taskCard.state === 'todo') {
        flags.push({ key: 'main_task_not_started', text: M.FLAG_TEXT.main_task_not_started });
      }
      if (nowDM >= dm(C.choreSkippedAfter) && choreCard && choreCard.state !== 'done') {
        flags.push({ key: 'chore_skipped', text: M.FLAG_TEXT.chore_skipped });
      }
    }

    const summary = buildSummary({
      light, flags, log, ctx, nowDM, dmTaskAfter: dm(C.taskNotStartedAfter), trackMeals, delay, sleep, now,
    });

    // ---------- การเตือน (R10) ----------
    const nudges = computeNudges({
      now, nowDM, profile, light, trackMeals, mealStatus, recMealAt, choreCard, winddownAt, tonightBedAt,
      reminderState, logDate, ctx, dmChore: dm(C.choreNudgeAfter), cutoff,
    });

    // ---------- การ์ดชวนคุย ----------
    const care = careCheck({ profile, log, recent, logDate, trackMeals });

    // ---------- ปุ่มหลัก: รายการถัดไป ----------
    const next = computeNext({ wokeAt, trackMeals, mealStatus, taskCard, choreCard, tonightBedAt, light, winddownAt, recMealAt, taskStartAt, choreItemAt });

    // ---------- ข้อความ (copy) ----------
    // คำทักช่วงดึก: บันทึกเวลานอนแล้ว = ของคืนนี้ หรือของเมื่อคืนที่เพิ่งบันทึกไว้ (ก่อนเวลาตัดวัน) และยังไม่ได้บันทึกเวลาตื่น
    const sleptRecently =
      !!lastNightAt && !wokeAt && diffMin(now, lastNightAt) >= 0 && diffMin(now, lastNightAt) < 8 * 60;
    const copy = buildCopy({
      profile, ctx, now, energy, light, wokeAt, wakeChip, trackMeals, mealStatus, firstMealAt, recMealAt, delay,
      sleep, targetBedMin, taskCard, taskEmpty, choreCard, choreEmpty, hasBedtimeTonight: !!tonightBedAt || sleptRecently,
    });

    return {
      logDate,
      window: win,
      now,
      mode: light ? 'light' : 'normal',
      trackMeals,
      energy,
      wake: { at: wokeAt, chipText: wakeChip, delta: wakeDelta, onTime, targetAt: targetWakeAt },
      nextMeal: trackMeals
        ? {
            at: mealStatus === 'logged' && firstMealAt ? firstMealAt : recMealAt,
            recommendedAt: recMealAt,
            status: mealStatus,
            waitingForWake: !wokeAt,
          }
        : null,
      sleep,
      mainTask,
      microTask,
      taskCard,
      chore: choreCard,
      timeline,
      flags,
      nudges,
      summary,
      care,
      next,
      copy,
    };
  }

  function buildSummary(s) {
    const { light, flags, log, ctx, nowDM, dmTaskAfter, trackMeals, delay, sleep } = s;
    const title = nowDM < dmTaskAfter ? 'จนถึงตอนนี้' : 'ทำไมวันนี้เลื่อน';
    if (light) {
      return { title, badge: 'ระบบช่วยคิด', text: M.LIGHT_SUMMARY, chips: [], tomorrow: [], light: true, edited: false };
    }
    const edited = !!(log && log.reasons_edited);
    const userTokens = (log && log.slipped_reasons) || [];
    const chips = edited
      ? userTokens.map((k) => ({
          key: k,
          text: M.FLAG_TEXT[k] || REASON_TOKEN_TEXT[k] || k,
          kind: M.FLAG_TEXT[k] ? 'flag' : 'user',
        }))
      : flags.map((f) => ({ key: f.key, text: f.text, kind: 'flag' }));
    const has = (k) => chips.some((c) => c.key === k);

    if (!chips.length) {
      return { title, badge: 'ระบบช่วยคิด', text: M.pick('summaryNone', M.L.summaryNone, ctx), chips, tomorrow: [], light: false, edited };
    }

    const causes = chips
      .filter((c) => c.key === 'late_bedtime' || c.key === 'missing_meal' || c.kind === 'user')
      .map((c) => c.text);
    const consequences = [];
    if (has('main_task_not_started')) consequences.push('งานใหญ่เลยไม่ถูกเริ่ม');
    if (has('chore_skipped')) consequences.push('งานห้องเลยรอไว้ก่อน');

    const steps = [];
    if (has('missing_meal') && trackMeals) steps.push(`มื้อแรกใน ${delay} นาทีหลังตื่น`);
    if (has('main_task_not_started')) steps.push(`ทำงานย่อย ${C.microDefaultMin} นาที`);
    if (has('chore_skipped')) steps.push(`เก็บห้อง ${C.choreMaxMin} นาที`);

    const sentences = [];
    if (causes.length) {
      const intro = (nowDM < dmTaskAfter ? M.L.summaryIntroNow : M.L.summaryIntro);
      sentences.push(M.pick('summaryIntro', intro, ctx)(causes.join('และ')) + (consequences.length ? ' ' + consequences.join(' ') : ''));
    } else {
      if (has('main_task_not_started')) sentences.push(M.pick('summaryOnlyTask', M.L.summaryOnlyTask, ctx));
      if (has('chore_skipped')) sentences.push(M.pick('summaryOnlyChore', M.L.summaryOnlyChore, ctx));
    }
    if (steps.length) {
      sentences.push(M.pick('summaryTomorrow', M.L.summaryTomorrow, ctx)(steps.join(' แล้ว')));
    } else {
      sentences.push('พรุ่งนี้เริ่มจากเวลาตื่นก็พอ' + (has('late_bedtime') ? ` คืนนี้ลองเข้านอนราว ${T.formatTime(sleep.suggestedBedtime)}` : ''));
    }
    return { title, badge: 'ระบบช่วยคิด', text: sentences.join(' '), chips, tomorrow: steps, light: false, edited };
  }

  /** R10 เงื่อนไขการเตือน */
  function computeNudges(s) {
    const { now, nowDM, profile, light, trackMeals, mealStatus, recMealAt, choreCard, winddownAt, tonightBedAt, reminderState, logDate, ctx } = s;
    if (light) return [];
    if (inQuietHours(profile, now)) return [];
    const today = reminderState.filter((r) => r.log_date === logDate);
    const used = (kind) => today.some((r) => r.kind === kind && (r.fired_at || r.dismissed_at));
    const out = [];

    if (
      trackMeals &&
      profile.notify_meal !== false &&
      recMealAt &&
      mealStatus === 'unknown' &&
      diffMin(now, recMealAt) >= 0 &&
      !used('meal')
    ) {
      out.push({ kind: 'meal', text: M.pick('nudgeMeal', M.L.nudgeMeal, ctx) });
    }
    if (
      profile.notify_room !== false &&
      choreCard &&
      choreCard.state === 'todo' && // ไทเมอร์กำลังเดินอยู่ = กำลังทำอยู่แล้ว ไม่ต้องเตือน
      nowDM >= s.dmChore &&
      !used('room')
    ) {
      out.push({ kind: 'room', text: M.pick('nudgeRoom', M.L.nudgeRoom, ctx) });
    }
    if (
      profile.notify_winddown !== false &&
      !tonightBedAt &&
      diffMin(now, winddownAt) >= 0 &&
      diffMin(now, winddownAt) < C.winddownWindowMin &&
      !used('winddown')
    ) {
      out.push({ kind: 'winddown', text: M.pick('nudgeWinddown', M.L.nudgeWinddown, ctx) });
    }
    const firedCount = today.filter((r) => r.fired_at).length;
    return out.slice(0, Math.max(0, C.maxNudgesPerDay - firedCount));
  }

  /** nudgesDue(now) — ตัวเดียวกับที่ Edge Function ใช้คำนวณฝั่งเซิร์ฟเวอร์ */
  function nudgesDue(now, input) {
    return buildDay(Object.assign({}, input, { now })).nudges;
  }

  /** การ์ดชวนคุย: ไม่เก็บเหตุผล ไม่บอกว่าเป็นโรคใด ไม่เกินสัปดาห์ละครั้ง */
  function careCheck(s) {
    const { profile, log, recent, logDate, trackMeals } = s;
    const byDate = {};
    for (const l of [...recent, log]) if (l) byDate[l.log_date] = l;
    const streak = (test) => {
      let n = 0;
      let d = logDate;
      // วันนี้ยังไม่เข้าเงื่อนไข ไม่ถือว่าขาดช่วง เริ่มนับจากเมื่อวาน
      if (!test(byDate[d], d)) d = T.addDays(d, -1);
      while (n < 8 && test(byDate[d], d)) {
        n++;
        d = T.addDays(d, -1);
      }
      return n;
    };
    const targetSleep =
      (T.parseHM(profile.target_wake || C.defaultProfile.target_wake) -
        T.parseHM(profile.target_bedtime || C.defaultProfile.target_bedtime) +
        1440) %
      1440;
    const shortSleep = (l, d) => {
      const prev = byDate[T.addDays(d, -1)];
      if (!l || !l.woke_at || !prev || !prev.bedtime_at) return false;
      return targetSleep - diffMin(l.woke_at, prev.bedtime_at) >= C.careShortSleepDeficitMin;
    };
    const mealSkipped = (l) => !!l && l.meal_status === 'skipped';

    const need = C.careStreakDays;
    const mealStreak = trackMeals ? streak(mealSkipped) : 0;
    const sleepStreak = streak(shortSleep);
    const triggered = mealStreak >= need || sleepStreak >= need;

    const shownOn = profile.care_card_shown_on || null;
    const dismissedOn = profile.care_card_dismissed_on || null;
    let allowed = true;
    if (shownOn) {
      if (shownOn === logDate) allowed = dismissedOn !== logDate;
      else allowed = T.diffDays(logDate, shownOn) >= C.careCardEveryDays;
    }
    return { show: triggered && allowed, text: M.CARE_TEXT };
  }

  function computeNext(s) {
    const { wokeAt, trackMeals, mealStatus, taskCard, choreCard, tonightBedAt, light, winddownAt, recMealAt, taskStartAt, choreItemAt } = s;
    if (!wokeAt) return { kind: 'wake', action: 'log_wake', label: 'บันทึกเวลาตื่น', title: 'บันทึกเวลาตื่น', at: null };
    if (trackMeals && mealStatus === 'unknown') {
      return { kind: 'meal', action: 'log_meal', label: 'บันทึกมื้อแรก', title: 'มื้อแรก', at: recMealAt };
    }
    if (!light && taskCard && (taskCard.state === 'todo' || taskCard.state === 'doing')) {
      return {
        kind: 'task',
        action: taskCard.state === 'doing' ? 'open_timer_task' : 'start_task',
        label: taskCard.state === 'doing' ? 'กลับไปที่ไทเมอร์' : `เริ่ม ${taskCard.minutes} นาที`,
        title: taskCard.title,
        at: taskStartAt,
      };
    }
    if (choreCard && (choreCard.state === 'todo' || choreCard.state === 'running')) {
      return {
        kind: 'chore',
        action: choreCard.state === 'running' ? 'open_timer_chore' : 'start_chore',
        label: choreCard.state === 'running' ? 'กลับไปที่ไทเมอร์' : `ทำเลย ${choreCard.minutes} นาที`,
        title: choreCard.chore.title,
        at: choreItemAt,
      };
    }
    if (!tonightBedAt) {
      return { kind: 'winddown', action: 'winddown', label: 'ผ่อนจังหวะก่อนนอน', title: 'ผ่อนจังหวะ', at: winddownAt };
    }
    return { kind: 'done', action: null, label: 'วันนี้พอแล้ว', title: 'ราตรีสวัสดิ์', at: null };
  }

  function buildCopy(s) {
    const { profile, ctx, now, energy, light, wokeAt, wakeChip, trackMeals, mealStatus, firstMealAt, recMealAt, delay, sleep, targetBedMin, taskCard, taskEmpty, choreCard, choreEmpty } = s;
    const name = (profile.display_name || '').trim();
    const greeting = M.greeting(T.minuteOfDay(now), name, s.hasBedtimeTonight);

    // นอน
    const sleepCopy = {
      last: sleep.lastNight
        ? `เมื่อคืนเข้านอน ${T.formatTime(sleep.lastNight.at)}`
        : 'ยังไม่บันทึกเวลานอนเมื่อคืน',
      lastSub: sleep.lastNight ? `เป้า ${T.formatTime(targetBedMin)}` : null,
      tonight: sleep.tonightBedAt ? `คืนนี้เข้านอน ${T.formatTime(sleep.tonightBedAt)} ราตรีสวัสดิ์` : null,
      winddown: `คืนนี้ผ่อนจังหวะ ${T.formatTime(sleep.winddownAt)}`,
      suggest: `เวลานอนที่แนะนำ ${T.formatTime(sleep.suggestedBedtime)}`,
      note: sleep.shiftMinutes > 0 ? `ขยับจากเดิมแค่ ${Math.min(sleep.shiftMinutes, C.bedtimeShiftMin)} นาที ไม่ต้องกระโดดทั้งชั่วโมง` : null,
    };

    // กิน
    let mealCopy = null;
    if (trackMeals) {
      if (!wokeAt) mealCopy = { main: 'รอบันทึกเวลาตื่นก่อน', sub: null };
      else if (mealStatus === 'logged') mealCopy = { main: `กินมื้อแรกแล้ว ${T.formatTime(firstMealAt)}`, sub: null };
      else if (mealStatus === 'skipped') mealCopy = { main: 'ไม่กินมื้อนี้', sub: 'ไม่เป็นไร เปลี่ยนใจเมื่อไรก็บันทึกได้' };
      else mealCopy = { main: `มื้อถัดไป ${T.formatTime(recMealAt)}`, sub: `หลังตื่น ${delay} นาที` };
    }

    // งาน
    let taskCopy;
    if (light) taskCopy = null;
    else if (!taskCard) taskCopy = { main: taskEmpty, sub: null, empty: true };
    else if (taskCard.state === 'skipped') taskCopy = { main: 'ข้ามงานวันนี้แล้ว', sub: 'ไม่เป็นไร พรุ่งนี้ค่อยว่ากัน', skipped: true };
    else {
      const subParts = [`${taskCard.minutes} นาที`];
      if (taskCard.state === 'done') subParts.push('เสร็จแล้ว');
      else if (taskCard.state === 'doing') subParts.push('กำลังทำอยู่');
      else if (taskCard.startAt) subParts.push(`เริ่มได้ตั้งแต่ ${T.formatTime(taskCard.startAt)}`);
      taskCopy = { main: taskCard.title, sub: subParts.join(' · '), proposed: taskCard.proposed };
    }

    // ห้อง
    let choreCopy;
    if (!choreCard) choreCopy = { main: choreEmpty, sub: null, empty: true };
    else {
      const m = choreCard.minutes;
      let sub;
      if (choreCard.state === 'done') sub = 'เสร็จแล้ว';
      else if (choreCard.state === 'running') sub = 'กำลังจับเวลาอยู่';
      else if (choreCard.state === 'skipped') sub = 'ข้ามวันนี้แล้ว ไม่เป็นไร พรุ่งนี้ค่อยว่ากัน';
      else if (choreCard.optional) sub = `${m} นาที · ไม่บังคับ`;
      else sub = M.pick('choreHint', M.L.choreHint, ctx)(m);
      choreCopy = { main: choreCard.chore.title, sub, minutes: m };
    }

    const lowNote =
      !light && energy.level === 'low' ? M.pick('lowEnergyNote', M.L.lowEnergyNote, ctx)(C.choreMaxMin) : null;

    return {
      greeting,
      energyChip: energy.text,
      wakeChip,
      lowEnergyNote: lowNote,
      sleep: sleepCopy,
      meal: mealCopy,
      task: taskCopy,
      chore: choreCopy,
      lightBanner: light ? 'วันนี้ขอเบา ๆ — เหลือแค่สิ่งจำเป็น' : null,
    };
  }

  /** R9 รีเซ็ตตอนนี้ — มุมมองของวันนี้ ไม่แก้ข้อมูลที่ผู้ใช้บันทึก เหลือไม่เกิน 3 อย่าง */
  function resetFrom(nowIn, plan) {
    const now = D(nowIn);
    const items = [];
    if (plan.trackMeals && plan.nextMeal && plan.nextMeal.status === 'unknown') {
      items.push({ kind: 'meal', title: 'กินมื้อแรกเบา ๆ', sub: 'อะไรก็ได้ที่กินได้ตอนนี้', action: 'log_meal', minutes: null });
    }

    const tc = plan.taskCard;
    if (tc && tc.task && (tc.state === 'todo' || tc.state === 'doing')) {
      // งานย่อยจริง (≤ 25 นาที) ใช้นาทีของตัวมันเอง งานใหญ่/ข้อเสนอใช้ 25 นาที ให้ตรงกับไทเมอร์ที่จะเริ่มจริง
      const realMicro = tc.kind === 'micro' && !tc.proposed;
      const minutes = realMicro ? tc.minutes : C.microDefaultMin;
      const title = tc.kind === 'micro' ? tc.title : M.L.microOffer[0](tc.task.title, C.microDefaultMin);
      items.push({
        kind: 'task',
        title,
        sub: `${minutes} นาที พอแล้ว`,
        action: tc.state === 'doing' ? 'open_timer_task' : 'start_micro',
        minutes,
      });
    }

    if (items.length < C.resetMaxItems) {
      const toWind = diffMin(plan.sleep.winddownAt, now);
      const windNear = toWind <= C.resetWinddownWithinMin && toWind > -C.winddownWindowMin && !plan.sleep.tonightBedAt;
      const cc = plan.chore;
      if (windNear) {
        items.push({ kind: 'winddown', title: 'ผ่อนจังหวะก่อนนอน', sub: `ช่วง ${T.formatTime(plan.sleep.winddownAt)}`, action: 'winddown', minutes: null });
      } else if (cc && (cc.state === 'todo' || cc.state === 'running')) {
        items.push({
          kind: 'chore',
          title: cc.chore.title,
          sub: `${Math.min(cc.minutes, C.choreMaxMin)} นาที`,
          action: cc.state === 'running' ? 'open_timer_chore' : 'start_chore',
          minutes: Math.min(cc.minutes, C.choreMaxMin),
        });
      }
    }
    return { items: items.slice(0, C.resetMaxItems), note: 'เหลือแค่นี้ก็พอ ที่เหลือพรุ่งนี้ค่อยว่ากัน', at: now };
  }

  /**
   * ตรวจค่าที่ขัดกัน: ตื่นก่อนเวลานอนที่เพิ่งบันทึก หรือช่วงนอนยาว/สั้นผิดปกติ → ให้ถาม "นอนข้ามคืนใช่ไหม"
   * (ไม่แสดง error และไม่บล็อก — ผู้ใช้ตอบ ใช่ แล้วค่าที่ผู้ใช้ป้อนยังชนะเสมอ)
   * นอน 23:30 ตื่น 07:00 เป็นกรณีปกติ ไม่ต้องถาม
   */
  function sleepConflict(bedAt, wakeAt) {
    if (!bedAt || !wakeAt) return false;
    const dur = diffMin(wakeAt, bedAt);
    return dur <= 0 || dur < C.sleepPlausibleMinMin || dur > C.sleepPlausibleMaxMin;
  }

  RD.engine = { buildDay, resetFrom, nudgesDue, sleepConflict, inQuietHours, cutoffOf, REASON_TOKEN_TEXT };
})(typeof globalThis !== 'undefined' ? globalThis : this);
