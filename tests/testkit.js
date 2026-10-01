/* runner ทดสอบเล็ก ๆ (ไม่ต้องติดตั้งอะไร) — ใช้ร่วมกันทุกชุดทดสอบ */
(function (g) {
  const results = [];
  let currentSuite = '';

  function stringify(v) {
    try {
      return JSON.stringify(v, (k, x) => (x instanceof Date ? x.toISOString() : x));
    } catch (e) {
      return String(v);
    }
  }

  const kit = {
    results,
    suite(name) {
      currentSuite = name;
    },
    test(name, fn) {
      const entry = { suite: currentSuite, name, pass: true, error: null };
      try {
        const r = fn();
        if (r && typeof r.then === 'function') {
          entry.pending = r.then(
            () => {},
            (e) => {
              entry.pass = false;
              entry.error = e && e.message ? e.message : String(e);
            }
          );
        }
      } catch (e) {
        entry.pass = false;
        entry.error = e && e.message ? e.message : String(e);
      }
      results.push(entry);
    },
    eq(actual, expected, msg) {
      if (stringify(actual) !== stringify(expected)) {
        throw new Error(`${msg ? msg + ': ' : ''}ได้ ${stringify(actual)} แต่ต้องการ ${stringify(expected)}`);
      }
    },
    ok(v, msg) {
      if (!v) throw new Error(msg || 'ค่าที่ได้ควรเป็นจริง');
    },
    notOk(v, msg) {
      if (v) throw new Error(msg || 'ค่าที่ได้ควรเป็นเท็จ');
    },
    async finish() {
      await Promise.all(results.map((r) => r.pending).filter(Boolean));
      return results;
    },
  };
  g.TestKit = kit;
})(typeof globalThis !== 'undefined' ? globalThis : this);
